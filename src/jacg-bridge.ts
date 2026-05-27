/**
 * java-all-call-graph 侧车桥接模块
 *
 * 管理 Java 侧车子进程生命周期，提供 HTTP 客户端查询接口。
 * 侧车 JAR：D:\project\cc-mcp-lsp-java-jacg-sidecar\target\jacg-sidecar-0.1.0-jar-with-dependencies.jar
 *
 * 通信协议：HTTP JSON-RPC
 *   POST /scan     — 阶段1：解析字节码 → H2
 *   POST /query    — 阶段2：查询调用图
 *   GET  /status   — 状态
 *   GET  /health   — 存活检查
 */

import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

const SIDECAR_JAR_REL = 'java-sidecar/target/jacg-sidecar-0.1.0-jar-with-dependencies.jar';
const DEFAULT_PORT = 38766;
const DEFAULT_DB_DIR = '.cc-mcp-lsp-java/jacg';

let sidecarProcess: cp.ChildProcess | null = null;
let sidecarPort = DEFAULT_PORT;

/* ───────── 生命周期 ───────── */

export function startSidecar(
  context: vscode.ExtensionContext,
  log: (msg: string) => void,
  options?: { port?: number; dbDir?: string; javaHome?: string },
): Promise<void> {
  if (sidecarProcess) {
    log('[jacg] Sidecar already running');
    return Promise.resolve();
  }

  sidecarPort = options?.port ?? DEFAULT_PORT;
  const dbDir = options?.dbDir ?? path.join(context.globalStorageUri.fsPath, DEFAULT_DB_DIR);
  const sidecarJar = path.join(context.extensionPath, SIDECAR_JAR_REL);

  if (!fs.existsSync(sidecarJar)) {
    log('[jacg] Sidecar JAR not found at ' + sidecarJar + '. Skipping call-graph features.');
    return Promise.resolve();
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

  return new Promise<void>((resolve, reject) => {
    sidecarProcess = cp.spawn(javaBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    sidecarProcess.on('error', (err) => {
      log(`[jacg] Failed to start sidecar: ${err.message}`);
      sidecarProcess = null;
      reject(err);
    });

    sidecarProcess.on('exit', (code) => {
      log(`[jacg] Sidecar exited with code ${code}`);
      sidecarProcess = null;
    });

    let started = false;
    const check = setInterval(() => {
      healthCheck()
        .then((ok) => {
          if (ok && !started) {
            started = true;
            clearInterval(check);
            log('[jacg] Sidecar ready');
            resolve();
          }
        })
        .catch(() => {});
    }, 500);

    setTimeout(() => {
      clearInterval(check);
      if (!started) {
        log('[jacg] Sidecar start timeout');
        resolve(); // 不阻塞扩展启动
      }
    }, 15000);
  });
}

export function stopSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill();
    sidecarProcess = null;
  }
}

export function isSidecarRunning(): boolean {
  return sidecarProcess !== null && sidecarProcess.exitCode === null;
}

/* ───────── HTTP 查询 ───────── */

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

/**
 * 阶段 1：扫描项目字节码，填充数据库。
 */
export async function scan(inputDir: string, log: (msg: string) => void): Promise<boolean> {
  log(`[jacg] Scanning: ${inputDir}`);
  const result = await post('/scan', { input: inputDir }) as { ok?: boolean; error?: string };
  if (result.error) {
    log(`[jacg] Scan error: ${result.error}`);
    return false;
  }
  log('[jacg] Scan complete');
  return true;
}

/**
 * 阶段 2：查询调用方（谁调了这个方法？）。
 */
export async function getCallers(): Promise<CallGraphNode[]> {
  const result = await post('/query', { cmd: 'callers' }) as { data?: { caller: string; callees: string[] }[] };
  return ((result.data || []) as { caller: string; callees: string[] }[]).map((n) => ({
    method: n.caller,
    related: n.callees || [],
  }));
}

/**
 * 阶段 2：查询被调用方（这个方法调了谁？）。
 */
export async function getCallees(): Promise<CallGraphNode[]> {
  const result = await post('/query', { cmd: 'callees' }) as { data?: { callee: string; callers: string[] }[] };
  return ((result.data || []) as { callee: string; callers: string[] }[]).map((n) => ({
    method: n.callee,
    related: n.callers || [],
  }));
}

/**
 * 列出所有已分析方法。
 */
export async function listMethods(): Promise<string[]> {
  const result = await post('/query', { cmd: 'methodList' }) as { methods?: string[] };
  return result.methods || [];
}

/**
 * 搜索调用路径（按关键字过滤堆栈文件）。
 */
export async function findPath(keyword: string): Promise<string[]> {
  const result = await post('/query', { cmd: 'findPath', keyword }) as { paths?: string[] };
  return result.paths || [];
}

/**
 * 获取侧车状态。
 */
export async function getStatus(): Promise<{ scanned: boolean; dbDir: string; inputDir: string }> {
  const result = await post('/status') as { scanned: boolean; dbDir: string; inputDir: string };
  return result;
}
