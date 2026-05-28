/**
 * java-all-call-graph 侧车桥接模块
 *
 * 管理 Java 侧车子进程生命周期，提供 HTTP 客户端查询接口。
 * 自动通过 redhat.java 扩展发现项目 classpath（编译输出 + 依赖 JAR）。
 */

import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

const SIDECAR_JAR_REL = 'java-sidecar/target/jacg-sidecar-0.1.2-jar-with-dependencies.jar';
const DEFAULT_PORT = 38766;
const DEFAULT_DB_DIR = '.cc-mcp-lsp-java/jacg';

let sidecarProcess: cp.ChildProcess | null = null;
let sidecarPort = DEFAULT_PORT;
let _activeProjectIndex = 0; // multi-root 支持

/* ───────── 详细侧车状态（替代简单的 running boolean） ───────── */

export type SidecarStatusCode =
  | 'not_started'    // 还未尝试启动
  | 'jar_missing'    // JAR 文件不存在
  | 'starting'       // 进程已创建，健康检查中
  | 'ready'          // 运行中且健康检查通过
  | 'timeout'        // 启动超时，未在时限内就绪
  | 'crashed'        // 非预期退出
  | 'stopped'        // 主动停止
  | 'error';         // 启动失败（如端口冲突）

export interface SidecarDetailedStatus {
  status: SidecarStatusCode;
  detail: string;
  running: boolean;
  scanned: boolean;
  restartCount: number;
  dbDir: string;
  projectId: string;
  inputDirs: string[];
  dbFileSize: number;
}

let _sidecarDetail: SidecarDetailedStatus = {
  status: 'not_started',
  detail: '侧车未启动',
  running: false,
  scanned: false,
  restartCount: 0,
  dbDir: '',
  projectId: '',
  inputDirs: [],
  dbFileSize: 0,
};

let _restartCount = 0;
const MAX_RESTARTS = 3;

/**
 * 设置详细状态并同步 running 字段。
 */
function setSidecarDetail(partial: Partial<SidecarDetailedStatus>) {
  _sidecarDetail = {
    ..._sidecarDetail,
    ...partial,
    running: partial.status === undefined
      ? _sidecarDetail.running
      : (partial.status === 'ready'),
  };
}

/* ───────── 项目隔离：基于 workspace 路径哈希 ───────── */

/**
 * 获取所有工作区文件夹。
 */
export function getAvailableProjects(): { name: string; index: number }[] {
  return (vscode.workspace.workspaceFolders || []).map((f, i) => ({ name: f.name, index: i }));
}

/**
 * 设置当前活跃项目索引（multi-root 切换）。
 */
export function setActiveProject(index: number): void {
  _activeProjectIndex = Math.max(0, Math.min(index, (vscode.workspace.workspaceFolders?.length || 1) - 1));
}

export function getActiveProjectIndex(): number {
  return _activeProjectIndex;
}

/**
 * 获取当前活跃项目的根路径。
 */
function getActiveProjectRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[_activeProjectIndex]?.uri?.fsPath;
}

/**
 * 根据当前活跃工作区路径生成稳定的项目 ID（SHA256 前 16 位）。
 * 每个项目有独立的 H2 数据库目录，避免数据混合。
 */
export function getProjectId(): string | undefined {
  const ws = getActiveProjectRoot();
  if (!ws) return undefined;
  return crypto.createHash('sha256').update(ws).digest('hex').slice(0, 16);
}

/* ───────── Classpath 自动发现 ───────── */

/**
 * 通过 redhat.java 扩展发现当前 Java 项目的完整 classpath。
 * 返回 { compileOutput: string[], dependencyJars: string[] }
 */
export async function discoverProjectClasspath(
  log: (msg: string) => void,
): Promise<{ compileOutput: string[]; dependencyJars: string[] } | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    log('[jacg] No workspace folder open, cannot auto-discover classpath');
    return null;
  }

  const javaExt = vscode.extensions.getExtension('redhat.java');
  if (!javaExt) {
    log('[jacg] redhat.java extension not found, cannot auto-discover classpath');
    return null;
  }

  // 等 JDT.LS 完成就绪
  if (!javaExt.isActive) {
    log('[jacg] Waiting for redhat.java to activate...');
    await javaExt.activate();
  }

  const api = javaExt.exports as any;
  if (!api.getProjectSettings && !api.resolveClasspath) {
    log('[jacg] redhat.java API does not expose classpath methods');
    return null;
  }

  // 用当前活跃项目根目录推断
  const root = getActiveProjectRoot();
  if (!root) { log('[jacg] No active project root'); return null; }
  const rootUri = vscode.Uri.file(root);
  const result = { compileOutput: new Set<string>(), dependencyJars: new Set<string>() };

  // 策略 A：直接搜 target/classes + target/dependency 等已知输出目录
  const knownDirs = [
    'target/classes',
    'target/dependency',
    'build/classes/java/main',
    'bin',
  ];
  for (const dir of knownDirs) {
    const fullPath = path.join(rootUri.fsPath, dir);
    if (fs.existsSync(fullPath)) {
      result.compileOutput.add(fullPath);
      log(`[jacg] Found compile output: ${fullPath}`);
    }
  }

  // Maven 本地仓库
  const m2Repo = path.join(process.env.HOME || process.env.USERPROFILE || '', '.m2', 'repository');
  if (fs.existsSync(m2Repo)) {
    log(`[jacg] Maven repo: ${m2Repo}`);
  }

  // 策略 B：用 redhat.java API 取精确 classpath
  try {
    let classpaths: string[] = [];
    let outputPath: string | undefined;

    // getProjectSettings 返回完整信息
    if (api.getProjectSettings) {
      const settings = await api.getProjectSettings(rootUri);
      if (settings) {
        classpaths = settings.classpaths || [];
        outputPath = settings.outputPath;
      }
    }

    // fallback: resolveClasspath 用任意 Java 文件
    if ((!classpaths || classpaths.length === 0) && api.resolveClasspath) {
      // 找工作区里的第一个 .java 文件
      const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/node_modules/**', 1);
      if (javaFiles.length > 0) {
        const entries: { path: string; kind: string }[] = await api.resolveClasspath(javaFiles[0]);
        for (const e of entries) {
          if (e.kind === 'l') {
            result.dependencyJars.add(e.path);
          } else if (e.kind === 'c') {
            result.compileOutput.add(e.path);
          }
        }
      }
    }

    // 从 classpaths 数组中分离输出目录和 JAR
    for (const cp of classpaths) {
      if (cp.endsWith('.jar') || cp.endsWith('.JAR')) {
        result.dependencyJars.add(cp);
      } else {
        result.compileOutput.add(cp);
      }
    }
    if (outputPath) {
      result.compileOutput.add(outputPath);
    }
  } catch (err) {
    log(`[jacg] redhat.java API call failed: ${err}`);
    // 继续使用策略 A 找到的目录
  }

  const compileOutput = [...result.compileOutput];
  const dependencyJars = [...result.dependencyJars];

  log(`[jacg] Discovered ${compileOutput.length} compile dir(s), ${dependencyJars.length} dep jar(s)`);
  return { compileOutput, dependencyJars };
}

/* ───────── 侧车生命周期 ───────── */

let _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let _startTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let _restartTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 内部函数：执行一次进程创建 → health check → 超时/完成。
 * resolve/reject 由 startSidecar 统一设置，跨重启复用同一个 Promise。
 */
function _doSpawn(
  javaBin: string,
  args: string[],
  log: (msg: string) => void,
  dbDir: string,
  onReady: () => void,
  onFailed: (reason: string) => void,
) {
  // 清理残存进程
  if (sidecarProcess) {
    sidecarProcess.kill();
    sidecarProcess = null;
  }
  clearTimers();

  sidecarProcess = cp.spawn(javaBin, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  sidecarProcess.on('error', (err) => {
    log(`[jacg] Failed to start sidecar: ${err.message}`);
    sidecarProcess = null;
    setSidecarDetail({ status: 'error', detail: `启动失败: ${err.message}` });
    clearTimers();
    onFailed(err.message);
  });

  let started = false;
  _healthCheckTimer = setInterval(() => {
    healthCheck()
      .then((ok) => {
        if (ok && !started) {
          started = true;
          clearTimers();
          setSidecarDetail({ status: 'ready', detail: '侧车就绪', restartCount: _restartCount });
          log('[jacg] Sidecar ready');
          onReady();
        }
      })
      .catch(() => {});
  }, 500);

  _startTimeoutTimer = setTimeout(() => {
    clearTimers();
    if (!started) {
      log('[jacg] Sidecar start timeout (15s)');
      setSidecarDetail({ status: 'timeout', detail: '侧车启动超时(15s)，请检查端口 38766 是否被占用或 Java 环境是否正确' });
      onFailed('timeout after 15s');
    }
  }, 15000);

  sidecarProcess.on('exit', (code) => {
    log(`[jacg] Sidecar exited with code ${code}`);
    sidecarProcess = null;
    clearTimers();

    if (_sidecarDetail.status === 'starting' || _sidecarDetail.status === 'ready' || _sidecarDetail.status === 'timeout') {
      /* ── 暗坑 #3 修复：非预期退出时自动重启 ── */
      if (_restartCount < MAX_RESTARTS) {
        _restartCount++;
        const delay = Math.min(1000 * Math.pow(2, _restartCount - 1), 8000);
        log(`[jacg] Auto-restart attempt ${_restartCount}/${MAX_RESTARTS} in ${delay}ms`);
        setSidecarDetail({ status: 'starting', detail: `侧车已退出(code=${code})，${_restartCount}/${MAX_RESTARTS} 次自动重启…` });
        _restartTimer = setTimeout(() => _doSpawn(javaBin, args, log, dbDir, onReady, onFailed), delay);
      } else {
        log(`[jacg] Max restarts (${MAX_RESTARTS}) reached, giving up`);
        setSidecarDetail({ status: 'crashed', detail: `侧车已退出(code=${code})，已自动重启 ${MAX_RESTARTS} 次均失败` });
        vscode.window.showErrorMessage(`CC MCP LSP Java: 侧车进程崩溃，已自动重启 ${MAX_RESTARTS} 次失败。请检查日志。`);
        onFailed(`exited ${MAX_RESTARTS} times`);
      }
    } else {
      setSidecarDetail({ status: 'stopped', detail: `侧车已停止(code=${code})` });
    }
  });
}

export function startSidecar(
  context: vscode.ExtensionContext,
  log: (msg: string) => void,
  options?: { port?: number; dbDir?: string; javaHome?: string },
): Promise<void> {
  if (sidecarProcess && _sidecarDetail.status === 'ready') {
    log('[jacg] Sidecar already running');
    return Promise.resolve();
  }

  // 进程残存但状态异常（如 crashed/timeout），先清理
  if (sidecarProcess) {
    log('[jacg] Cleaning up stale sidecar process before restart');
    stopSidecar();
  }

  sidecarPort = options?.port ?? DEFAULT_PORT;
  const dbDir = options?.dbDir ?? path.join(context.globalStorageUri.fsPath, DEFAULT_DB_DIR);
  const sidecarJar = path.join(context.extensionPath, SIDECAR_JAR_REL);

  /* ── 暗坑 #1 修复：JAR 不存在时弹窗提示，不静默跳过 ── */
  if (!fs.existsSync(sidecarJar)) {
    const msg = `Java 侧车 JAR 不存在，调用图功能不可用。请在终端中构建：\ncd java-sidecar && mvn package -DskipTests`;
    log('[jacg] ' + msg);
    setSidecarDetail({ status: 'jar_missing', detail: msg, dbDir });
    vscode.window.showWarningMessage('CC MCP LSP Java: ' + msg, '构建指南').then(selection => {
      if (selection === '构建指南') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/gx-zyl/cc-mcp-lsp-java#java-%E4%BE%A7%E8%BD%A6%E8%B0%83%E7%94%A8%E5%9B%BE%E5%88%86%E6%9E%90'));
      }
    });
    return Promise.reject(new Error(msg));
  }

  const javaBin = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', 'java')
    : 'java';

  const args = [
    '-jar', sidecarJar,
    '--port', String(sidecarPort),
    '--db-dir', dbDir,
  ];

  log(`[jacg] Starting sidecar: ${javaBin} ${args.join(' ')}`);
  setSidecarDetail({ status: 'starting', detail: '侧车启动中…', dbDir });

  return new Promise<void>((resolve, reject) => {
    _doSpawn(javaBin, args, log, dbDir,
      () => { resolve(); },
      (reason) => { reject(new Error(reason)); },
    );
  });
}

/** 清理定时器，防止内存泄漏 */
function clearTimers() {
  if (_healthCheckTimer) { clearInterval(_healthCheckTimer); _healthCheckTimer = null; }
  if (_startTimeoutTimer) { clearTimeout(_startTimeoutTimer); _startTimeoutTimer = null; }
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
}

export function stopSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill();
    sidecarProcess = null;
  }
  clearTimers();
  _restartCount = 0;
  setSidecarDetail({ status: 'stopped', detail: '侧车已主动停止', restartCount: 0 });
}

export function getDetailedStatus(): SidecarDetailedStatus {
  return { ..._sidecarDetail };
}

export function isSidecarRunning(): boolean {
  return _sidecarDetail.running;
}

/* ───────── HTTP 通信 ───────── */

async function post(endpoint: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `http://127.0.0.1:${sidecarPort}${endpoint}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sidecar ${endpoint} error (${res.status}): ${text}`);
  }
  return res.json();
}

async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${sidecarPort}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/* ───────── 命令式 API ───────── */

export interface CallGraphNode {
  method: string;
  related: string[];
}

export interface QueryFilter {
  className?: string;
  methodName?: string;
}

/** 给每个请求加上 projectId 参数 */
function withProject<T>(body: T): T & { projectId: string } {
  const pid = getProjectId();
  return { ...body, projectId: pid || 'default' };
}

/** 构造带过滤的查询 body */
function queryBody(cmd: string, filter?: QueryFilter): Record<string, unknown> {
  return withProject({ cmd, ...(filter?.className ? { className: filter.className } : {}), ...(filter?.methodName ? { methodName: filter.methodName } : {}) });
}

/**
 * 阶段 1：扫描项目字节码 → 填充数据库。
 * inputDirs 可传多个目录（编译输出 + 依赖 JAR 目录）。
 * 扫描期间侧车 stdout 会输出 JSON 进度行，此处捕获并转发。
 */
export async function scan(inputDirs: string[], log: (msg: string) => void): Promise<boolean> {
  const projectId = getProjectId();
  log(`[jacg] Scanning ${inputDirs.length} dir(s) for project ${projectId || '(no workspace)'}`);

  // 监听侧车 stdout 的 JSON 进度行（捕获局部引用防竞态）
  const proc = sidecarProcess;
  let progressListener: ((chunk: Buffer) => void) | undefined;
  if (proc?.stdout) {
    progressListener = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n').filter(l => l.trim())) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'progress') {
            log(`[jacg] ${parsed.phase}: ${parsed.message}`);
          }
        } catch {
          // 非 JSON 行忽略
        }
      }
    };
    proc.stdout.on('data', progressListener);
  }

  try {
    const result = await post('/scan', withProject({ inputDirs })) as { ok?: boolean; error?: string };
    if (result.error) {
      log(`[jacg] Scan error: ${result.error}`);
      return false;
    }
    log('[jacg] Scan complete');
    return true;
  } finally {
    if (progressListener && proc?.stdout) {
      proc.stdout.removeListener('data', progressListener);
    }
  }
}

export async function getCallers(filter?: QueryFilter): Promise<CallGraphNode[]> {
  const result = await post('/query', queryBody('callers', filter)) as { data?: { caller: string; callees: string[] }[] };
  return ((result.data || []) as { caller: string; callees: string[] }[]).map((n) => ({
    method: n.caller,
    related: n.callees || [],
  }));
}

export async function getCallees(filter?: QueryFilter): Promise<CallGraphNode[]> {
  const result = await post('/query', queryBody('callees', filter)) as { data?: { callee: string; callers: string[] }[] };
  return ((result.data || []) as { callee: string; callers: string[] }[]).map((n) => ({
    method: n.callee,
    related: n.callers || [],
  }));
}

export async function listMethods(filter?: QueryFilter): Promise<string[]> {
  const result = await post('/query', queryBody('methodList', filter)) as { methods?: string[] };
  return result.methods || [];
}

export async function findPath(keyword: string): Promise<string[]> {
  const result = await post('/query', withProject({ cmd: 'findPath', keyword })) as { paths?: string[] };
  return result.paths || [];
}

export async function getStatus(): Promise<{
  scanned: boolean;
  dbDir: string;
  projectId: string;
  inputDirs: string[];
  dbFileSize: number;
}> {
  const result = await post('/status') as {
    scanned: boolean;
    baseDbDir: string;
    projectId?: string;
    inputDirs?: string[];
  };
  const pid = result.projectId || '';
  // 从文件系统获取 H2 数据库文件大小
  let dbFileSize = 0;
  if (pid) {
    try {
      const dbFile = path.join(result.baseDbDir, `${pid}.mv.db`);
      dbFileSize = fs.statSync(dbFile).size;
    } catch { /* 文件还不存在 */ }
  }
  return {
    scanned: result.scanned,
    dbDir: result.baseDbDir,
    projectId: pid,
    inputDirs: result.inputDirs || [],
    dbFileSize,
  };
}

/* ───────── 缓存清理 ───────── */

/**
 * 清理当前项目的 H2 数据库（删除整个 projectDbDir）。
 */
export async function cleanProjectCache(log: (msg: string) => void): Promise<boolean> {
  const projectId = getProjectId();
  log(`[jacg] Cleaning cache for project ${projectId || '(no workspace)'}`);
  try {
    const result = await post('/clean', { projectId: projectId || 'default' }) as { ok?: boolean; freed?: string };
    if (result.ok) {
      log(`[jacg] Cleaned: ${result.freed}`);
    }
    return !!result.ok;
  } catch (err) {
    log(`[jacg] Clean error: ${err}`);
    return false;
  }
}

/**
 * 清理所有项目的缓存。
 */
export async function cleanAllCache(log: (msg: string) => void): Promise<boolean> {
  log('[jacg] Cleaning all project caches');
  try {
    const result = await post('/clean-all', {}) as { ok?: boolean; freed?: string };
    if (result.ok) {
      log(`[jacg] All caches cleared: ${result.freed}`);
    }
    return !!result.ok;
  } catch (err) {
    log(`[jacg] Clean-all error: ${err}`);
    return false;
  }
}
