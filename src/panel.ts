/* ───────── panel.ts ───────── */
/**
 * CC MCP LSP Java — 管理面板
 *
 * 提供两种视图：
 *   1. openManagementPanel — 编辑器标签页 (WebviewPanel)
 *   2. registerManagementView — 左侧活动栏侧边视图 (WebviewView)
 *
 * 内容相同：服务器状态、连接数、控制重启、历史记录。
 *
 * 所有 Webview HTML 由 Vite + React 构建，存放在 dist/webview/ 下，
 * 运行时通过 fs.readFileSync 读取。
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getServerInfo, onDidChangeStatus, startMcpServer, stopMcpServer } from './server.js';
import { isSidecarRunning, getStatus, getCallers, getCallees, listMethods, scan as jacgScan, cleanProjectCache, discoverProjectClasspath, getAvailableProjects, setActiveProject } from './jacg-bridge.js';

/* ───────── 共享状态 ───────── */

let _context: vscode.ExtensionContext;
let _log: (msg: string) => void;

/* ───────── HTML 读取和 URI 转换 ───────── */

const _htmlCache = new Map<string, string>();

/**
 * 读取 Vite 构建的 HTML，并将 asset 路径转换为 webview 可加载的 URI。
 * 同时配置 localResourceRoots 允许 webview 访问 dist/webview 资源。
 *
 * 缓存原始文件内容避免重复读盘，但 asset 路径替换每次执行（因 webview 实例不同，asWebviewUri 结果也不同）。
 */
function resolveWebviewHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  name: string,
): string {
  const webviewRoot = vscode.Uri.joinPath(context.extensionUri, 'dist-webview');
  webview.options = {
    enableScripts: true,
    localResourceRoots: [webviewRoot],
  };

  // 缓存原始文件内容
  let html = _htmlCache.get(name);
  if (!html) {
    const filePath = path.join(context.extensionPath, 'dist-webview', name, 'index.html');
    html = fs.readFileSync(filePath, 'utf-8');
    _htmlCache.set(name, html);
  }

  // 每次执行替换（webview 实例不同，URI 也不同）
  const assetsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets'));
  return html.replace(/\/assets\//g, `${assetsUri}/`);
}

/* ───────── MCP 说明文档标签页 ───────── */

let docPanel: vscode.WebviewPanel | undefined;

export function openMcpDocPanel() {
  if (docPanel) {
    docPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  docPanel = vscode.window.createWebviewPanel(
    'ccMcpLspJavaDoc',
    'MCP LSP Java 接口说明',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  docPanel.webview.html = resolveWebviewHtml(docPanel.webview, _context, 'doc');

  docPanel.onDidDispose(() => { docPanel = undefined; });
}

/* ───────── 编辑器标签页面板 ───────── */

let panel: vscode.WebviewPanel | undefined;
let panelStatusDisposable: vscode.Disposable | undefined;

export function openManagementPanel(context: vscode.ExtensionContext, log: (msg: string) => void) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'ccMcpLspJavaManagementPanel',
    'CC MCP LSP Java 管理',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = resolveWebviewHtml(panel.webview, context, 'management');

  // 推送初始状态
  panel.webview.postMessage({ type: 'status', data: getServerInfo() });

  // 监听服务器状态变更
  panelStatusDisposable = onDidChangeStatus((info) => {
    panel?.webview.postMessage({ type: 'status', data: info });
  });

  // 监听 Webview 消息
  const msgDisposable = panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'start':
        log('Starting MCP server from management panel...');
        await startMcpServer(context, log);
        break;
      case 'restart':
        log('Restarting MCP server from management panel...');
        await startMcpServer(context, log);
        break;
      case 'changePort':
        await startMcpServer(context, log, msg.port as number);
        break;
      case 'stop':
        await stopMcpServer();
        log('MCP server stopped from management panel.');
        break;
      case 'openDoc':
        openMcpDocPanel();
        break;
      case 'requestStatus':
        panel?.webview.postMessage({ type: 'status', data: getServerInfo() });
        break;
    }
  });

  panel.onDidDispose(() => {
    panelStatusDisposable?.dispose();
    msgDisposable.dispose();
    panelStatusDisposable = undefined;
    panel = undefined;
  });
}

/* ───────── 左侧活动栏侧边视图 ───────── */

export function registerManagementView(context: vscode.ExtensionContext, log: (msg: string) => void) {
  _context = context;
  _log = log;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ccMcpLspJavaManagement', new ManagementProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

class ManagementProvider implements vscode.WebviewViewProvider {
  private _statusDisposable?: vscode.Disposable;

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.html = resolveWebviewHtml(webviewView.webview, _context, 'management');

    webviewView.webview.postMessage({ type: 'status', data: getServerInfo() });

    this._statusDisposable = onDidChangeStatus((info) => {
      webviewView.webview.postMessage({ type: 'status', data: info });
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'start':
          _log('Starting MCP server from management panel...');
          await startMcpServer(_context, _log);
          break;
        case 'restart':
          _log('Restarting MCP server from management panel...');
          await startMcpServer(_context, _log);
          break;
        case 'changePort':
          await startMcpServer(_context, _log, msg.port as number);
          break;
        case 'stop':
          await stopMcpServer();
          _log('MCP server stopped from management panel.');
          break;
        case 'openDoc':
          openMcpDocPanel();
          break;
        case 'requestStatus':
          webviewView.webview.postMessage({ type: 'status', data: getServerInfo() });
          break;
      }
    });

    webviewView.onDidDispose(() => {
      this._statusDisposable?.dispose();
      this._statusDisposable = undefined;
    });
  }
}

/* ───────── MCP 接口说明视图（侧边栏） ───────── */

export function registerDocView(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ccMcpLspJavaDoc', new DocProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

class DocProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = getDocBtnHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openDoc') openMcpDocPanel();
    });
  }
}

/**
 * Doc 侧边栏按钮仍然使用内联 HTML（极小，仅一个按钮 + 事件）
 * 主体文档内容已迁移为 React（doc/index.html）
 */
function getDocBtnHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; padding: 10px; margin: 0; }
  .btn { width: 100%; padding: 8px 0; text-align: center; font-size: 12px; border: 1px solid #3c3c3c; border-radius: 4px; background: #2d2d2d; color: #cccccc; cursor: pointer; transition: background 0.15s; }
  .btn:hover { background: #353535; }
</style>
</head>
<body>
<button class="btn" id="btnOpenDoc">打开接口说明文档</button>
<script>(function(){const api=acquireVsCodeApi();document.getElementById('btnOpenDoc').addEventListener('click',()=>{api.postMessage({type:'openDoc'})})})();</script>
</body>
</html>`;
}

/* ───────── 调用图 MCP 接口说明 ───────── */

export function registerCallGraphDocView(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ccMcpLspJavaCallGraphDoc', new CallGraphDocProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

let callGraphDocPanel: vscode.WebviewPanel | undefined;

export function openCallGraphDocPanel(context: vscode.ExtensionContext) {
  if (callGraphDocPanel) { callGraphDocPanel.reveal(vscode.ViewColumn.Beside); return; }
  callGraphDocPanel = vscode.window.createWebviewPanel(
    'ccMcpLspJavaCallGraphDocPanel', 'CC MCP LSP Java — 调用图 MCP 接口说明',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  callGraphDocPanel.webview.html = resolveWebviewHtml(callGraphDocPanel.webview, context, 'callgraph-doc');
  callGraphDocPanel.onDidDispose(() => { callGraphDocPanel = undefined; });
}

class CallGraphDocProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = getCallGraphDocBtnHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openCallGraphDoc') openCallGraphDocPanel(_context);
    });
  }
}

function getCallGraphDocBtnHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; padding: 10px; margin: 0; }
  .btn { width: 100%; padding: 8px 0; text-align: center; font-size: 12px; border: 1px solid #3c3c3c; border-radius: 4px; background: #2d2d2d; color: #cccccc; cursor: pointer; transition: background 0.15s; }
  .btn:hover { background: #353535; }
</style>
</head>
<body>
<button class="btn" id="btnOpenDoc">打开调用图 MCP 接口说明</button>
<script>(function(){const api=acquireVsCodeApi();document.getElementById('btnOpenDoc').addEventListener('click',()=>{api.postMessage({type:'openCallGraphDoc'})})})();</script>
</body>
</html>`;
}

/* ───────── Java 查询测试视图 ───────── */

interface SearchResultItem {
  kind: string;
  fqn: string;
  source: 'src' | 'JAR';
  location: string;
  relPath: string;
  line: number;
  uri: string;
}

const KIND_LABEL: Record<number, string> = {
  [vscode.SymbolKind.Class]: 'Class',
  [vscode.SymbolKind.Interface]: 'Interface',
  [vscode.SymbolKind.Enum]: 'Enum',
};

let resultPanel: vscode.WebviewPanel | undefined;

/** 最近一次结果数据，用于 result panel 重连时重放 */
let _lastResult: { type: string; [key: string]: unknown } | undefined;

function openResultPanel(title: string) {
  if (resultPanel) {
    resultPanel.dispose();
  }

  resultPanel = vscode.window.createWebviewPanel(
    'ccMcpLspJavaResult',
    title,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  resultPanel.webview.html = resolveWebviewHtml(resultPanel.webview, _context, 'result');

  const disposable = resultPanel.webview.onDidReceiveMessage((msg) => {
    switch (msg.type) {
      case 'openFile': {
        const uri = vscode.Uri.parse(msg.uri as string);
        vscode.window.showTextDocument(uri, { selection: new vscode.Range((msg.line as number) - 1, 0, (msg.line as number) - 1, 0) });
        break;
      }
      case 'requestResult':
        if (_lastResult) {
          resultPanel?.webview.postMessage(_lastResult);
        }
        break;
    }
  });

  resultPanel.onDidDispose(() => {
    disposable.dispose();
    resultPanel = undefined;
  });

  return resultPanel;
}

export function registerTestView(context: vscode.ExtensionContext, log: (msg: string) => void) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ccMcpLspJavaTest', new TestProvider(context, log), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

class TestProvider implements vscode.WebviewViewProvider {
  constructor(private context: vscode.ExtensionContext, private log: (msg: string) => void) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.html = resolveWebviewHtml(webviewView.webview, this.context, 'test');

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'search': {
          const query = msg.fuzzy ? `*${msg.name as string}*` : (msg.name as string);
          try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
              'vscode.executeWorkspaceSymbolProvider', query
            );
            if (!symbols || symbols.length === 0) {
              vscode.window.showInformationMessage(`未找到匹配 "${msg.name as string}" 的类型`);
              return;
            }
            const typeKinds = new Set([vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum]);
            const items: SearchResultItem[] = [];
            for (const sym of symbols) {
              if (!typeKinds.has(sym.kind)) continue;
              const absPath = sym.location.uri.fsPath;
              const isFileScheme = sym.location.uri.scheme === 'file';
              items.push({
                kind: KIND_LABEL[sym.kind] || `Kind(${sym.kind})`,
                fqn: sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name,
                source: isFileScheme ? 'src' : 'JAR',
                location: isFileScheme ? absPath : sym.location.uri.toString(),
                relPath: isFileScheme ? vscode.workspace.asRelativePath(absPath) : sym.location.uri.toString(),
                line: sym.location.range.start.line + 1,
                uri: sym.location.uri.toString(),
              });
            }
            if (items.length === 0) {
              vscode.window.showInformationMessage(`找到 ${symbols.length} 个符号，但没有 Java 类型`);
              return;
            }
            const panel = openResultPanel(`类型搜索: ${msg.name as string}`);
            // 数据通过 postMessage 发送给 React 组件
            const resultData: { type: string; query: string; items: SearchResultItem[] } = { type: 'searchResult', query: msg.name as string, items };
            panel.webview.postMessage(resultData);
            _lastResult = resultData;
          } catch (err) {
            this.log(`Search error: ${err}`);
            vscode.window.showErrorMessage(`搜索失败: ${err}`);
          }
          break;
        }
        case 'getSource': {
          try {
            const parts = (msg.fqn as string).split('.');
            const simpleName = parts.pop()!;
            const query = msg.fuzzy ? `*${simpleName}*` : simpleName;
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
              'vscode.executeWorkspaceSymbolProvider', query
            );

            if (!symbols || symbols.length === 0) {
              vscode.window.showInformationMessage(`未找到 "${msg.fqn as string}"`);
              return;
            }

            // 模糊模式且有多个结果 → 显示候选列表
            if (msg.fuzzy && symbols.length > 1) {
              const typeKinds = new Set([vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum]);
              const items: SearchResultItem[] = [];
              for (const sym of symbols) {
                if (!typeKinds.has(sym.kind)) continue;
                const absPath = sym.location.uri.fsPath;
                const isFileScheme = sym.location.uri.scheme === 'file';
                items.push({
                  kind: KIND_LABEL[sym.kind] || `Kind(${sym.kind})`,
                  fqn: sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name,
                  source: isFileScheme ? 'src' : 'JAR',
                  location: isFileScheme ? absPath : sym.location.uri.toString(),
                  relPath: isFileScheme ? vscode.workspace.asRelativePath(absPath) : sym.location.uri.toString(),
                  line: sym.location.range.start.line + 1,
                  uri: sym.location.uri.toString(),
                });
              }
              if (items.length > 0) {
                const panel = openResultPanel(`模糊搜索: ${simpleName}`);
                const resultData: { type: string; query: string; items: SearchResultItem[] } = { type: 'searchResult', query: simpleName, items };
                panel.webview.postMessage(resultData);
                _lastResult = resultData;
                return;
              }
            }

            const match = symbols.find(s => s.name === simpleName && s.containerName === parts.join('.'))
              || symbols.find(s => s.name === simpleName);
            if (!match) {
              vscode.window.showInformationMessage(`未精确匹配 "${msg.fqn as string}"`);
              return;
            }
            if (match.location.uri.scheme !== 'file') {
              vscode.window.showInformationMessage(`"${msg.fqn as string}" 来自 JAR 依赖，无法获取完整源码`);
              return;
            }
            const doc = await vscode.workspace.openTextDocument(match.location.uri);
            const source = doc.getText();
            const panel = openResultPanel(`源码: ${msg.fqn as string}`);
            const sourceData: { type: string; fqn: string; filePath: string; uri: string; source: string } = {
              type: 'sourceResult',
              fqn: msg.fqn as string,
              filePath: match.location.uri.fsPath,
              uri: match.location.uri.toString(),
              source,
            };
            panel.webview.postMessage(sourceData);
            _lastResult = sourceData;
          } catch (err) {
            this.log(`getSource error: ${err}`);
            vscode.window.showErrorMessage(`获取源码失败: ${err}`);
          }
          break;
        }
      }
    });
  }
}

/* ───────── 调用图分析视图 ───────── */

export function registerCallGraphView(context: vscode.ExtensionContext, log: (msg: string) => void) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ccMcpLspJavaCallGraph', new CallGraphProvider(context, log), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

class CallGraphProvider implements vscode.WebviewViewProvider {
  constructor(private context: vscode.ExtensionContext, private log: (msg: string) => void) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.html = resolveWebviewHtml(webviewView.webview, this.context, 'callgraph');
    // 告知 webview 它处于侧边栏模式
    webviewView.webview.postMessage({ type: 'panelConfig', isSidebar: true });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'requestSidecarStatus':
          postSidecarStatus(webviewView.webview);
          break;
        case 'startSidecarScan':
          postSidecarStatus(webviewView.webview);
          handleSidecarScan(webviewView.webview, this.log).catch((err) => {
            this.log(`Sidecar scan error: ${err}`);
            postSidecarStatus(webviewView.webview);
          });
          break;
        case 'cleanSidecarCache':
          handleSidecarClean(webviewView.webview);
          break;
        case 'openInEditor':
          openCallGraphPanel(this.context, this.log);
          break;
        case 'switchProject':
          setActiveProject(msg.index as number);
          postSidecarStatus(webviewView.webview);
          break;
        case 'sidecarQuery': {
          const queryType = msg.queryType as string;
          const query = msg.query as string;
          const parts = query.split(':');
          const className = parts[0] || '';
          const methodName = parts[1] || '';
          try {
            let data: { method: string; related: string[] }[];
            if (queryType === 'list') {
              const methods = await listMethods({ className, methodName });
              data = methods.map(m => ({ method: m, related: [] }));
            } else if (queryType === 'callers') {
              data = await getCallers({ className, methodName });
            } else {
              data = await getCallees({ className, methodName });
            }
            webviewView.webview.postMessage({ type: 'queryResult', queryType, data });
          } catch (err) {
            this.log(`Query error: ${err}`);
            webviewView.webview.postMessage({ type: 'queryResult', queryType, data: [] });
          }
          break;
        }
      }
    });
  }
}

/* ───────── 调用图编辑器面板 ───────── */

let callGraphPanel: vscode.WebviewPanel | undefined;

export function openCallGraphPanel(context: vscode.ExtensionContext, log: (msg: string) => void) {
  if (callGraphPanel) { callGraphPanel.reveal(vscode.ViewColumn.Beside); return; }
  callGraphPanel = vscode.window.createWebviewPanel(
    'ccMcpLspJavaCallGraphPanel', 'CC MCP LSP Java — 调用图分析',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  callGraphPanel.webview.html = resolveWebviewHtml(callGraphPanel.webview, context, 'callgraph');
  // 告知 webview 它处于编辑器面板模式
  callGraphPanel.webview.postMessage({ type: 'panelConfig', isSidebar: false });

  const disposable = callGraphPanel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'requestSidecarStatus': postSidecarStatus(callGraphPanel?.webview); break;
      case 'startSidecarScan':
        postSidecarStatus(callGraphPanel?.webview);
        await handleSidecarScan(callGraphPanel?.webview, log);
        break;
      case 'cleanSidecarCache': await handleSidecarClean(callGraphPanel?.webview, log); break;
      case 'switchProject':
        setActiveProject(msg.index as number);
        postSidecarStatus(callGraphPanel?.webview);
        break;
      case 'sidecarQuery': {
        const queryType = msg.queryType as string;
        const query = msg.query as string;
        const parts = query.split(':');
        const className = parts[0] || '';
        const methodName = parts[1] || '';
        try {
          let data: { method: string; related: string[] }[];
          if (queryType === 'list') {
            const methods = await listMethods({ className, methodName });
            data = methods.map(m => ({ method: m, related: [] }));
          } else if (queryType === 'callers') {
            data = await getCallers({ className, methodName });
          } else {
            data = await getCallees({ className, methodName });
          }
          callGraphPanel?.webview.postMessage({ type: 'queryResult', queryType, data });
        } catch (err) {
          log(`Query error: ${err}`);
          callGraphPanel?.webview.postMessage({ type: 'queryResult', queryType, data: [] });
        }
        break;
      }
    }
  });

  callGraphPanel.onDidDispose(() => { disposable.dispose(); callGraphPanel = undefined; });
}

/* ───────── 侧车操作 ───────── */

async function handleSidecarScan(webview: vscode.Webview | undefined, log?: (msg: string) => void) {
  if (!webview) return;
  const logger = (msg: string) => {
    if (log) log(msg);
    try { webview.postMessage({ type: 'sidecarProgress', message: msg }); } catch { /* webview disposed */ }
  };
  const cp = await discoverProjectClasspath(logger);
  if (!cp) { vscode.window.showErrorMessage('无法自动发现 Classpath'); postSidecarStatus(webview); return; }
  const dirs = [...cp.compileOutput, ...cp.dependencyJars];
  const ok = await jacgScan(dirs, logger);
  if (ok) { vscode.window.showInformationMessage('调用图扫描完成'); }
  else { vscode.window.showErrorMessage('调用图扫描失败'); }
  postSidecarStatus(webview);
}

async function handleSidecarClean(webview: vscode.Webview | undefined) {
  if (!webview) return;
  const ok = await cleanProjectCache(_log || (() => {}));
  if (ok) { vscode.window.showInformationMessage('调用图缓存已清理'); }
  else { vscode.window.showErrorMessage('清理失败'); }
  postSidecarStatus(webview);
}

/* ───────── 侧车状态推送 ───────── */

const SIDECAR_STATUS_DEFAULT = { running: false, scanned: false, dbDir: '', projectId: '', inputDirs: [], dbFileSize: 0, classpathCount: 0, projects: [] };

async function postSidecarStatus(webview: vscode.Webview | undefined) {
  if (!webview) return;
  try {
    const running = isSidecarRunning();
    if (running) {
      const s = await getStatus();
      webview.postMessage({ type: 'sidecarStatus', data: {
        running: true,
        scanned: s.scanned,
        dbDir: s.dbDir,
        projectId: s.projectId,
        inputDirs: s.inputDirs,
        dbFileSize: s.dbFileSize,
        classpathCount: s.inputDirs.length,
        projects: getAvailableProjects(),
      }});
    } else {
      webview.postMessage({ type: 'sidecarStatus', data: SIDECAR_STATUS_DEFAULT });
    }
  } catch {
    webview.postMessage({ type: 'sidecarStatus', data: SIDECAR_STATUS_DEFAULT });
  }
}