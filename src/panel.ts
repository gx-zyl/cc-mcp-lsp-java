/**
 * CC MCP LSP Java — 管理面板
 *
 * 提供两种视图：
 *   1. openManagementPanel — 编辑器标签页 (WebviewPanel)
 *   2. registerManagementView — 左侧活动栏侧边视图 (WebviewView)
 *
 * 内容相同：服务器状态、连接数、控制重启、历史记录。
 */

import * as vscode from 'vscode';
import { getServerInfo, onDidChangeStatus, startMcpServer, stopMcpServer } from './server.js';

/* ───────── 共享状态 ───────── */

let _context: vscode.ExtensionContext;
let _log: (msg: string) => void;

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
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  );

  docPanel.webview.html = getDocHtml();

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
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  );

  panel.webview.html = getHtml();

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
        await startMcpServer(context, log, msg.port);
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
  private _view?: vscode.WebviewView;
  private _statusDisposable?: vscode.Disposable;

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = getHtml();

    // 推送初始状态
    webviewView.webview.postMessage({ type: 'status', data: getServerInfo() });

    // 监听服务器状态变更
    this._statusDisposable = onDidChangeStatus((info) => {
      webviewView.webview.postMessage({ type: 'status', data: info });
    });

    // 监听 Webview 消息
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
          await startMcpServer(_context, _log, msg.port);
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
      this._view = undefined;
    });
  }
}

/* ───────── MCP 接口说明视图 ───────── */

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

function getDocBtnHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1e1e1e; padding: 10px; margin: 0;
  }
  .btn {
    width: 100%; padding: 8px 0; text-align: center; font-size: 12px;
    border: 1px solid #3c3c3c; border-radius: 4px;
    background: #2d2d2d; color: #cccccc; cursor: pointer; transition: background 0.15s;
  }
  .btn:hover { background: #353535; }
</style>
</head>
<body>
<button class="btn" id="btnOpenDoc">打开接口说明文档</button>
<script>
(function() {
  const api = acquireVsCodeApi();
  document.getElementById('btnOpenDoc').addEventListener('click', () => {
    api.postMessage({ type: 'openDoc' });
  });
})();
</script>
</body>
</html>`;
}

/* ───────── Java 查询测试视图 ───────── */

export function registerTestView(context: vscode.ExtensionContext, log: (msg: string) => void) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ccMcpLspJavaTest', new TestProvider(context, log), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
}

const KIND_LABEL: Record<number, string> = {
  [vscode.SymbolKind.Class]: 'Class',
  [vscode.SymbolKind.Interface]: 'Interface',
  [vscode.SymbolKind.Enum]: 'Enum',
};

interface SearchResultItem {
  kind: string;
  fqn: string;
  source: 'src' | 'JAR';
  location: string;
  relPath: string;
  line: number;
  uri: string;
}

/** 复用搜索结果/源码面板 */
let resultPanel: vscode.WebviewPanel | undefined;
let resultPanelDisposable: vscode.Disposable | undefined;

function openResultPanel(title: string, html: string) {
  // 复用已有面板
  if (resultPanel) {
    resultPanel.dispose();
  }

  resultPanel = vscode.window.createWebviewPanel(
    'ccMcpLspJavaResult',
    title,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  );
  resultPanel.webview.html = html;

  const disposable = resultPanel.webview.onDidReceiveMessage((msg) => {
    if (msg.type === 'openFile') {
      const uri = vscode.Uri.parse(msg.uri);
      vscode.window.showTextDocument(uri, { selection: new vscode.Range(msg.line - 1, 0, msg.line - 1, 0) });
    }
  });

  resultPanel.onDidDispose(() => {
    disposable.dispose();
    resultPanel = undefined;
    resultPanelDisposable = undefined;
  });

  resultPanelDisposable = disposable;
  return resultPanel;
}

class TestProvider implements vscode.WebviewViewProvider {
  constructor(private context: vscode.ExtensionContext, private log: (msg: string) => void) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = getTestHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'search': {
          const query = msg.fuzzy ? `*${msg.name}*` : msg.name;
          try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
              'vscode.executeWorkspaceSymbolProvider', query
            );
            if (!symbols || symbols.length === 0) {
              vscode.window.showInformationMessage(`未找到匹配 "${msg.name}" 的类型`);
              return;
            }
            const typeKinds = new Set([vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum]);
            const items: SearchResultItem[] = [];
            for (const sym of symbols) {
              if (!typeKinds.has(sym.kind)) continue;
              const absPath = sym.location.uri.fsPath;
              items.push({
                kind: KIND_LABEL[sym.kind] || `Kind(${sym.kind})`,
                fqn: sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name,
                source: sym.location.uri.scheme === 'file' ? 'src' : 'JAR',
                location: absPath || sym.location.uri.toString(),
                relPath: absPath ? vscode.workspace.asRelativePath(absPath) : sym.location.uri.toString(),
                line: sym.location.range.start.line + 1,
                uri: sym.location.uri.toString(),
              });
            }
            if (items.length === 0) {
              vscode.window.showInformationMessage(`找到 ${symbols.length} 个符号，但没有 Java 类型`);
              return;
            }
            const panel = openResultPanel(`类型搜索: ${msg.name}`, getSearchResultHtml(msg.name, items, query));
            panel.onDidDispose(() => { /* cleanup */ });
          } catch (err) {
            this.log(`Search error: ${err}`);
            vscode.window.showErrorMessage(`搜索失败: ${err}`);
          }
          break;
        }
        case 'getSource': {
          try {
            const parts = msg.fqn.split('.');
            const simpleName = parts.pop()!;
            // 模糊模式用通配符搜索；精确模式按原名搜索
            const query = msg.fuzzy ? `*${simpleName}*` : simpleName;
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
              'vscode.executeWorkspaceSymbolProvider', query
            );

            if (!symbols || symbols.length === 0) {
              vscode.window.showInformationMessage(`未找到 "${msg.fqn}"`);
              return;
            }

            // 模糊模式且有多个结果 → 显示候选列表
            if (msg.fuzzy && symbols.length > 1) {
              const typeKinds = new Set([vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum]);
              const items: SearchResultItem[] = [];
              for (const sym of symbols) {
                if (!typeKinds.has(sym.kind)) continue;
                const absPath = sym.location.uri.fsPath;
                items.push({
                  kind: KIND_LABEL[sym.kind] || `Kind(${sym.kind})`,
                  fqn: sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name,
                  source: sym.location.uri.scheme === 'file' ? 'src' : 'JAR',
                  location: absPath || sym.location.uri.toString(),
                  relPath: absPath ? vscode.workspace.asRelativePath(absPath) : sym.location.uri.toString(),
                  line: sym.location.range.start.line + 1,
                  uri: sym.location.uri.toString(),
                });
              }
              if (items.length > 0) {
                openResultPanel(`模糊搜索: ${simpleName}`, getSearchResultHtml(simpleName, items, query));
                return;
              }
            }

            const match = symbols.find(s => s.name === simpleName && s.containerName === parts.join('.'))
              || symbols.find(s => s.name === simpleName);
            if (!match) {
              vscode.window.showInformationMessage(`未精确匹配 "${msg.fqn}"`);
              return;
            }
            if (match.location.uri.scheme !== 'file') {
              vscode.window.showInformationMessage(`"${msg.fqn}" 来自 JAR 依赖，无法获取完整源码`);
              return;
            }
            const doc = await vscode.workspace.openTextDocument(match.location.uri);
            const source = doc.getText();
            openResultPanel(`源码: ${msg.fqn}`, getSourceResultHtml(msg.fqn, match.location.uri.fsPath, source, match.location.uri.toString()));
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

function getSearchResultHtml(query: string, items: SearchResultItem[], rawQuery: string): string {
  const totalSrc = items.filter(i => i.source === 'src').length;
  const totalJar = items.filter(i => i.source === 'JAR').length;
  const kinds = [...new Set(items.map(i => i.kind))].sort();

  const rows = items.map((item, idx) => JSON.stringify(item)).join('|||');

  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: #1e1e1e; --card: #2d2d2d; --card-hover: #353535;
    --border: #3c3c3c; --text: #cccccc; --text-dim: #888888;
    --green: #4ec9b0; --blue: #569cd6; --orange: #ce9178; --yellow: #dcdcaa;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text); padding: 20px 24px;
    font-size: 13px; line-height: 1.6;
  }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .summary { color: var(--text-dim); font-size: 13px; margin-bottom: 16px; }
  .summary strong { color: var(--text); }

  /* ── Filters ── */
  .filters { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
  .filters label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.3px; }
  .filters select, .filters input {
    padding: 4px 8px; border: 1px solid var(--border); border-radius: 3px;
    background: var(--card); color: var(--text); font-size: 12px; outline: none;
  }
  .filters select:focus, .filters input:focus { border-color: var(--blue); }
  .filters .count { font-size: 12px; color: var(--text-dim); margin-left: auto; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    text-align: left; padding: 8px 10px; color: var(--text-dim);
    font-weight: 500; border-bottom: 2px solid var(--border);
    white-space: nowrap; cursor: pointer; user-select: none;
  }
  th:hover { color: var(--text); }
  td { padding: 6px 10px; border-bottom: 1px solid var(--border); }
  tr:hover td { background: var(--card-hover); }
  tr.hidden { display: none; }

  .tag-kind {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    font-size: 10px; font-weight: 500;
  }
  .tag-kind.Class { background: #1a3a5e; color: #7ec8e3; }
  .tag-kind.Interface { background: #3a2a5e; color: #c586c0; }
  .tag-kind.Enum { background: #3a4a1e; color: #b5cea8; }
  .tag-src { color: var(--green); font-size: 10px; font-weight: 500; }
  .tag-jar { color: var(--orange); font-size: 10px; font-weight: 500; }

  .loc { font-size: 11px; color: var(--text-dim); }
  .loc a { color: var(--blue); text-decoration: none; }
  .loc a:hover { text-decoration: underline; }
  .loc .line { color: var(--text-dim); }

  /* ── 路径悬停详情 ── */
  .loc-cell { position: relative; cursor: default; }
  .loc-tooltip {
    position: absolute; left: 0; top: calc(100% + 6px); z-index: 1000;
    background: #252526; border: 1px solid #454545; border-radius: 6px;
    padding: 8px 12px; font-size: 12px; white-space: nowrap;
    display: none; opacity: 0; transition: opacity 0.15s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4); gap: 8px; align-items: center;
    pointer-events: auto;
  }
  .loc-tooltip.visible { display: inline-flex; opacity: 1; }
  .loc-tooltip-path { color: var(--text); font-family: monospace; font-size: 11px; }
  .loc-copy-btn {
    padding: 2px 8px; border: 1px solid var(--border); border-radius: 3px;
    background: var(--card); color: var(--blue); cursor: pointer;
    font-size: 11px; transition: background 0.15s; white-space: nowrap;
  }
  .loc-copy-btn:hover { background: var(--card-hover); }
  .loc-copy-btn.copied { color: var(--green); border-color: var(--green); }
  .detail-btn {
    padding: 1px 6px; margin-left: 6px; border: 1px solid var(--border); border-radius: 3px;
    background: var(--card); color: var(--text-dim); cursor: pointer;
    font-size: 10px; line-height: 1.4; transition: background 0.15s; vertical-align: middle;
  }
  .detail-btn:hover { background: var(--card-hover); color: var(--text); }
  .detail-btn.active { color: var(--blue); border-color: var(--blue); }
</style>
</head>
<body>

<h1>类型搜索: ${escapeHtml(query)}</h1>
<p class="summary">
  共 <strong>${items.length}</strong> 个类型
  <span style="color:var(--green)">&#9679; ${totalSrc} 项目源码</span>
  <span style="color:var(--orange);margin-left:6px">&#9679; ${totalJar} JAR 依赖</span>
</p>

<div class="filters">
  <label>种类</label>
  <select id="filterKind">
    <option value="all">全部</option>
    ${kinds.map(k => `<option value="${k}">${k}</option>`).join('')}
  </select>
  <label>来源</label>
  <select id="filterSource">
    <option value="all">全部</option>
    <option value="src">项目源码</option>
    <option value="JAR">JAR 依赖</option>
  </select>
  <label>搜索</label>
  <input type="text" id="filterText" placeholder="名称过滤..." style="width:140px">
  <span class="count" id="visibleCount">显示 ${items.length}/${items.length}</span>
</div>

<table>
  <thead><tr>
    <th data-sort="kind">种类</th>
    <th data-sort="fqn" style="width:50%">全限定名</th>
    <th data-sort="source">来源</th>
    <th>位置</th>
  </tr></thead>
  <tbody id="resultBody">
    ${items.map((item, idx) => `<tr data-idx="${idx}">
      <td><span class="tag-kind ${item.kind}">${item.kind}</span></td>
      <td style="font-family:monospace;font-size:12px">${escapeHtml(item.fqn)}</td>
      <td><span class="tag-${item.source}">${item.source === 'src' ? '项目源码' : 'JAR 依赖'}</span></td>
      <td class="loc">${item.source === 'src'
        ? `<span class="loc-cell"><a href="#" data-uri="${escapeHtml(item.uri)}" data-line="${item.line}">${escapeHtml(item.relPath)}</a><span class="line">:${item.line}</span><button class="detail-btn">详情</button><div class="loc-tooltip"><code class="loc-tooltip-path">${escapeHtml(item.location)}</code><span class="line">:${item.line}</span><button class="loc-copy-btn" data-copy="${escapeHtml(item.location)}:${item.line}">复制路径</button></div></span>`
        : `<span class="loc-cell"><span class="loc-jar">${escapeHtml(item.location)}</span><button class="detail-btn">详情</button><div class="loc-tooltip"><code class="loc-tooltip-path">${escapeHtml(item.location)}</code><button class="loc-copy-btn" data-copy="${escapeHtml(item.location)}">复制路径</button></div></span>`}</td>
    </tr>`).join('')}
  </tbody>
</table>

<script>
(function() {
  const items = [${items.map(item => JSON.stringify(item)).join(',\n    ')}];

  // ── 过滤 ──
  const filterKind = document.getElementById('filterKind');
  const filterSource = document.getElementById('filterSource');
  const filterText = document.getElementById('filterText');
  const countEl = document.getElementById('visibleCount');

  function applyFilters() {
    const kind = filterKind.value;
    const source = filterSource.value;
    const text = filterText.value.toLowerCase();
    const tbody = document.getElementById('resultBody');
    const rows = tbody.querySelectorAll('tr');
    let visible = 0;
    rows.forEach(row => {
      const item = items[parseInt(row.dataset.idx)];
      const match = (kind === 'all' || item.kind === kind)
        && (source === 'all' || item.source === source)
        && (!text || item.fqn.toLowerCase().includes(text) || item.kind.toLowerCase().includes(text));
      row.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    countEl.textContent = '显示 ' + visible + '/' + items.length;
  }
  filterKind.addEventListener('change', applyFilters);
  filterSource.addEventListener('change', applyFilters);
  filterText.addEventListener('input', applyFilters);

  // ── 排序 ──
  let sortKey = '';
  let sortAsc = true;
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortAsc = !sortAsc;
      else { sortKey = key; sortAsc = true; }
      const tbody = document.getElementById('resultBody');
      const rows = [...tbody.querySelectorAll('tr')];
      const sorted = rows.sort((a, b) => {
        const ia = items[parseInt(a.dataset.idx)];
        const ib = items[parseInt(b.dataset.idx)];
        let va = ia[key], vb = ib[key];
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        return va < vb ? (sortAsc ? -1 : 1) : va > vb ? (sortAsc ? 1 : -1) : 0;
      });
      sorted.forEach(r => tbody.appendChild(r));
    });
  });

  // ── 文件链接 ──
  document.querySelectorAll('a[data-uri]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      acquireVsCodeApi().postMessage({ type: 'openFile', uri: a.dataset.uri, line: parseInt(a.dataset.line) });
    });
  });

  // ── 路径详情切换（点击详情按钮展开/收起） ──
  document.querySelectorAll('.loc-cell').forEach(cell => {
    cell.addEventListener('click', (e) => e.stopPropagation());
  });
  document.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tooltip = btn.parentElement.querySelector('.loc-tooltip');
      // 关闭其他 tooltip
      document.querySelectorAll('.loc-tooltip.visible').forEach(t => {
        if (t !== tooltip) t.classList.remove('visible');
      });
      document.querySelectorAll('.detail-btn.active').forEach(b => {
        if (b !== btn) b.classList.remove('active');
      });
      tooltip.classList.toggle('visible');
      btn.classList.toggle('active', tooltip.classList.contains('visible'));
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.loc-tooltip.visible').forEach(t => t.classList.remove('visible'));
    document.querySelectorAll('.detail-btn.active').forEach(b => b.classList.remove('active'));
  });

  // ── 复制按钮 ──
  document.querySelectorAll('.loc-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = '✓ 已复制';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '复制路径';
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  });
})();
</script>
</body>
</html>`;
}

function getSourceResultHtml(fqn: string, filePath: string, source: string, uri: string): string {
  const truncated = source.length > 10000;
  const body = truncated ? source.substring(0, 10000) : source;
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { --bg: #1e1e1e; --card: #2d2d2d; --border: #3c3c3c; --text: #cccccc; --text-dim: #888888; --blue: #569cd6; --green: #4ec9b0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text); padding: 16px 20px; font-size: 13px;
  }
  h1 { font-size: 16px; font-weight: 600; margin-bottom: 2px; }
  .path { color: var(--text-dim); font-size: 12px; margin-bottom: 14px; }
  pre {
    background: #1a1a2e; border: 1px solid var(--border); border-radius: 6px;
    padding: 14px 16px; font-family: monospace; font-size: 12px;
    overflow-x: auto; line-height: 1.5; color: var(--text);
  }
  .truncated { color: var(--text-dim); font-style: italic; margin-top: 8px; }
</style>
</head>
<body>
<h1>${escapeHtml(fqn)}</h1>
<div class="path"><a href="#" data-uri="${escapeHtml(uri)}" data-line="1" style="color:var(--blue);text-decoration:none">${escapeHtml(filePath)}</a></div>
<pre>${escapeHtml(body)}</pre>
${truncated ? '<div class="truncated">源码超过 10000 字符，已截断。</div>' : ''}
<script>
(function() {
  document.querySelectorAll('a[data-uri]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      acquireVsCodeApi().postMessage({ type: 'openFile', uri: a.dataset.uri, line: parseInt(a.dataset.line) });
    });
  });
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getTestHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: #1e1e1e; --card: #2d2d2d; --card-hover: #353535;
    --border: #3c3c3c; --text: #cccccc; --text-dim: #888888;
    --blue: #569cd6; --green: #4ec9b0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text); padding: 10px; font-size: 12px;
  }
  .tabs { display: flex; gap: 4px; margin-bottom: 10px; }
  .tab {
    flex: 1; padding: 6px 0; text-align: center; font-size: 11px;
    border: 1px solid var(--border); border-radius: 3px;
    background: var(--card); color: var(--text-dim); cursor: pointer;
  }
  .tab.active { background: var(--blue); border-color: var(--blue); color: #fff; }
  .tab:hover:not(.active) { background: var(--card-hover); }

  .field { margin-bottom: 8px; }
  .field label {
    display: block; font-size: 10px; color: var(--text-dim); margin-bottom: 3px;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  .field input, .field select {
    width: 100%; padding: 5px 8px; border: 1px solid var(--border); border-radius: 3px;
    background: var(--card); color: var(--text); font-size: 12px; outline: none;
  }
  .field input:focus, .field select:focus { border-color: var(--blue); }

  .btn-run {
    width: 100%; padding: 6px 0; text-align: center; font-size: 11px;
    border: 1px solid var(--green); border-radius: 3px;
    background: #1a3a2e; color: var(--green); cursor: pointer;
  }
  .btn-run:hover { background: #1a4a3e; }
</style>
</head>
<body>

<div class="tabs">
  <div class="tab active" data-mode="search">搜索类型</div>
  <div class="tab" data-mode="source">获取源码</div>
</div>

<div id="panelSearch">
  <div class="field">
    <label>类型名称</label>
    <input type="text" id="searchName" placeholder="如 ArrayList, Service" autocomplete="off">
  </div>
  <div class="field">
    <label>匹配模式</label>
    <select id="searchMode">
      <option value="strict">精确 (strict)</option>
      <option value="fuzzy">模糊 (fuzzy)</option>
    </select>
  </div>
  <button class="btn-run" id="btnSearch">&#9654; 搜索</button>
</div>

<div id="panelSource" style="display:none">
  <div class="field">
    <label>类名</label>
    <input type="text" id="sourceFqn" placeholder="如 java.util.ArrayList, StringUtils" autocomplete="off">
  </div>
  <div class="field">
    <label>匹配模式</label>
    <select id="sourceMode">
      <option value="strict">精确 (FQN)</option>
      <option value="fuzzy">模糊</option>
    </select>
  </div>
  <button class="btn-run" id="btnSource">&#9654; 获取源码</button>
</div>

<script>
(function() {
  const api = acquireVsCodeApi();

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panelSearch').style.display = tab.dataset.mode === 'search' ? 'block' : 'none';
      document.getElementById('panelSource').style.display = tab.dataset.mode === 'source' ? 'block' : 'none';
    });
  });

  document.getElementById('btnSearch').addEventListener('click', () => {
    const name = document.getElementById('searchName').value.trim();
    if (!name) return;
    api.postMessage({ type: 'search', name, fuzzy: document.getElementById('searchMode').value === 'fuzzy' });
  });
  document.getElementById('searchName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
  });

  document.getElementById('btnSource').addEventListener('click', () => {
    const fqn = document.getElementById('sourceFqn').value.trim();
    if (!fqn) return;
    api.postMessage({ type: 'getSource', fqn, fuzzy: document.getElementById('sourceMode').value === 'fuzzy' });
  });
  document.getElementById('sourceFqn').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnSource').click();
  });
})();
</script>
</body>
</html>`;
}

function getHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: #1e1e1e;
    --card: #2d2d2d;
    --card-hover: #353535;
    --border: #3c3c3c;
    --text: #cccccc;
    --text-dim: #888888;
    --green: #4ec9b0;
    --red: #f44747;
    --blue: #569cd6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text); padding: 10px; font-size: 12px;
  }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .header h1 { font-size: 13px; font-weight: 600; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
  }
  .status-dot.running { background: var(--green); box-shadow: 0 0 5px var(--green); }
  .status-dot.stopped { background: var(--red); }
  .status-text { font-size: 11px; margin-left: auto; color: var(--text-dim); }

  /* ── Stat row ── */
  .stat-row { display: flex; gap: 8px; margin-bottom: 10px; }
  .stat-box {
    flex: 1; background: var(--card); border: 1px solid var(--border);
    border-radius: 6px; padding: 10px;
  }
  .stat-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.3px; }
  .stat-value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .stat-value .sub { font-size: 11px; font-weight: 400; color: var(--text-dim); margin-left: 2px; }

  /* ── Section ── */
  .section { margin-bottom: 12px; }
  .section-title {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    color: var(--text-dim); letter-spacing: 0.5px; margin-bottom: 6px;
    padding-bottom: 4px; border-bottom: 1px solid var(--border);
  }

  /* ── Controls ── */
  .controls { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .btn {
    padding: 4px 10px; border: 1px solid var(--border); border-radius: 3px;
    background: var(--card); color: var(--text); cursor: pointer;
    font-size: 11px; transition: background 0.15s;
  }
  .btn:hover { background: var(--card-hover); }
  .btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
  .btn.primary:hover { filter: brightness(1.15); }
  .btn.danger { color: var(--red); border-color: var(--red); }
  .btn.danger:hover { background: var(--red); color: #fff; }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .port-group {
    display: flex; align-items: center; gap: 4px;
    background: var(--card); border: 1px solid var(--border); border-radius: 3px;
    padding: 0 6px;
  }
  .port-group span { color: var(--text-dim); font-size: 11px; }
  .port-group input {
    width: 60px; padding: 3px 0; border: none; background: transparent;
    color: var(--text); font-size: 11px; font-variant-numeric: tabular-nums; outline: none;
  }

  /* ── Table ── */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th {
    text-align: left; padding: 4px 6px; color: var(--text-dim);
    font-weight: 500; border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  td {
    padding: 3px 6px; border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  .tag {
    display: inline-block; padding: 1px 5px; border-radius: 2px;
    font-size: 10px; font-weight: 500;
  }
  .tag.active { background: #1a3a2e; color: var(--green); }
  .tag.closed { background: #3a1a1a; color: var(--red); }

  /* ── Log list ── */
  .log-list { max-height: 140px; overflow-y: auto; }
  .log-item {
    padding: 3px 6px; font-size: 11px; font-family: monospace;
    border-bottom: 1px solid var(--border); color: var(--text-dim);
  }

  /* ── Empty ── */
  .empty { color: var(--text-dim); font-size: 11px; padding: 8px 0; text-align: center; }
</style>
</head>
<body>

<div class="header">
  <span class="status-dot" id="statusDot"></span>
  <h1>MCP LSP Java</h1>
  <span class="status-text" id="statusText">检查中...</span>
</div>

<!-- ── 状态行 ── -->
<div class="stat-row">
  <div class="stat-box">
    <div class="stat-label">监听</div>
    <div class="stat-value"><span id="listenAddr">-</span></div>
  </div>
  <div class="stat-box">
    <div class="stat-label">会话</div>
    <div class="stat-value"><span id="activeSessions">0</span><span class="sub">活跃</span></div>
  </div>
</div>

<!-- ── 控制区 ── -->
<div class="section">
  <div class="section-title">控制</div>
  <div class="controls">
    <button class="btn primary" id="btnStart">启动</button>
    <button class="btn" id="btnRestart">重启</button>
    <button class="btn danger" id="btnStop" disabled>停止</button>
    <div class="port-group">
      <span>端口</span>
      <input type="number" id="portInput" value="38765" min="1024" max="65535">
    </div>
    <button class="btn" id="btnChangePort" style="font-size:10px">变更</button>
  </div>
</div>

<!-- ── 连接历史 ── -->
<div class="section">
  <div class="section-title">连接历史</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>会话</th><th>建立</th><th>状态</th></tr></thead>
      <tbody id="historyBody">
        <tr><td colspan="3" class="empty">暂无记录</td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ── 重启记录 ── -->
<div class="section">
  <div class="section-title">重启历史</div>
  <div class="log-list" id="restartLog">
    <div class="empty">暂无记录</div>
  </div>
</div>


<script>
(function() {
  const api = acquireVsCodeApi();

  function fmtTime(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('zh-CN', { hour12: false, month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  function fmtDuration(start, end) {
    if (!end) return '进行中';
    const sec = Math.round((end - start) / 1000);
    if (sec < 60) return sec + '秒';
    if (sec < 3600) return Math.floor(sec/60) + '分' + (sec%60) + '秒';
    return Math.floor(sec/3600) + '时' + Math.floor((sec%3600)/60) + '分';
  }

  function render(info) {
    const dot = document.getElementById('statusDot');
    const st = document.getElementById('statusText');
    if (info.running) {
      dot.className = 'status-dot running';
      st.textContent = '运行中';
    } else {
      dot.className = 'status-dot stopped';
      st.textContent = '已停止';
    }
    document.getElementById('listenAddr').textContent = info.running ? info.host + ':' + info.port : '-';
    document.getElementById('activeSessions').textContent = info.sessions;
    document.getElementById('portInput').value = info.port;
    document.getElementById('btnStop').disabled = !info.running;
    document.getElementById('btnRestart').disabled = !info.running;
    document.getElementById('btnStart').disabled = info.running;

    // 连接历史
    const tbody = document.getElementById('historyBody');
    if (info.connections.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">暂无记录</td></tr>';
    } else {
      const sorted = [...info.connections].sort((a, b) => b.startTime - a.startTime);
      tbody.innerHTML = sorted.map(c => {
        const active = !c.endTime;
        return '<tr>' +
          '<td style="font-family:monospace;font-size:10px">' + c.id.substring(0, 8) + '</td>' +
          '<td style="white-space:nowrap">' + fmtTime(c.startTime) + '</td>' +
          '<td><span class="tag ' + (active ? 'active' : 'closed') + '">' + (active ? '活跃' : '已关闭') + '</span></td>' +
          '</tr>';
      }).join('');
    }

    // 重启历史
    const logDiv = document.getElementById('restartLog');
    if (info.restartHistory.length === 0) {
      logDiv.innerHTML = '<div class="empty">暂无记录</div>';
    } else {
      logDiv.innerHTML = [...info.restartHistory].reverse().slice(0, 20).map(r =>
        '<div class="log-item">' + r + '</div>'
      ).join('');
    }
  }

  document.getElementById('btnStart').addEventListener('click', () => api.postMessage({ type: 'start' }));
  document.getElementById('btnRestart').addEventListener('click', () => api.postMessage({ type: 'restart' }));
  document.getElementById('btnStop').addEventListener('click', () => api.postMessage({ type: 'stop' }));
  document.getElementById('btnChangePort').addEventListener('click', () => {
    const port = parseInt(document.getElementById('portInput').value, 10);
    if (isNaN(port) || port < 1024 || port > 65535) return;
    api.postMessage({ type: 'changePort', port });
  });
  document.getElementById('portInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnChangePort').click();
  });

  window.addEventListener('message', (e) => {
    if (e.data.type === 'status') render(e.data.data);
  });
  api.postMessage({ type: 'requestStatus' });
})();
</script>
</body>
</html>`;
}

function getDocHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: #1e1e1e;
    --card: #2d2d2d;
    --border: #3c3c3c;
    --text: #cccccc;
    --text-dim: #888888;
    --green: #4ec9b0;
    --blue: #569cd6;
    --orange: #ce9178;
    --yellow: #dcdcaa;
    --purple: #c586c0;
    --link: #3794ff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text); padding: 24px 32px;
    font-size: 14px; line-height: 1.7; max-width: 860px;
  }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { color: var(--text-dim); font-size: 13px; margin-bottom: 28px; }
  h2 { font-size: 16px; font-weight: 600; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  h3 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: var(--blue); }
  h4 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; color: var(--yellow); }
  p, li { margin: 6px 0; color: var(--text-dim); }
  ul, ol { padding-left: 20px; }
  li { margin: 4px 0; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: var(--card); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 13px; color: var(--orange); }
  pre {
    background: #1a1a2e; border: 1px solid var(--border); border-radius: 6px;
    padding: 14px 16px; font-family: monospace; font-size: 13px; overflow-x: auto; margin: 10px 0; line-height: 1.5; color: var(--text);
  }
  pre .comment { color: #6a9955; }
  pre .keyword { color: var(--purple); }
  pre .string { color: var(--orange); }
  pre .func { color: var(--yellow); }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  th { text-align: left; padding: 8px 10px; color: var(--text-dim); font-weight: 500; border-bottom: 1px solid var(--border); }
  td { padding: 6px 10px; border-bottom: 1px solid var(--border); }
  td:first-child { font-family: monospace; white-space: nowrap; }
  tr:hover td { background: var(--card-hover); }
  td .dim { color: var(--text-dim); font-family: inherit; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; }
  .tag.req { background: #1a3a2e; color: var(--green); }
  .tag.opt { background: #2a2a3e; color: var(--text-dim); }
  .info-box { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; margin: 14px 0; }
  .info-box .row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
  .info-box .label { color: var(--text-dim); min-width: 100px; font-size: 13px; }
  .info-box .value { font-family: monospace; font-size: 13px; }
  .toc { margin: 16px 0 20px; padding: 12px 16px; background: var(--card); border-radius: 6px; border: 1px solid var(--border); }
  .toc a { display: block; padding: 2px 0; font-size: 13px; }
  .toc .l2 { padding-left: 16px; font-size: 12px; }
</style>
</head>
<body>

<h1>CC MCP LSP Java — 接口说明</h1>
<p class="subtitle">
  Streamable HTTP 协议 MCP 服务器，通过 VS Code 内置 LSP API 桥接 JDT.LS (Eclipse Java Language Server)。
  <a href="https://spec.modelcontextprotocol.io/specification/2025-03-26/" target="_blank">MCP 规范</a>
  ·
  <a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/" target="_blank">LSP 3.17 规范</a>
  ·
  <a href="https://github.com/redhat-developer/vscode-java" target="_blank">JDT.LS (redhat.java)</a>
</p>

<div class="toc">
  <a href="#overview">一、架构概述</a>
  <a href="#server-info" class="l2">服务信息</a>
  <a href="#lsp-bridge" class="l2">LSP 桥接原理</a>
  <a href="#config">二、客户端配置</a>
  <a href="#tools">三、工具参考</a>
  <a href="#tool-search" class="l2">1. searchJavaTypes</a>
  <a href="#tool-source" class="l2">2. getSourceCodeByFQN</a>
  <a href="#lsp-methods">四、LSP 方法映射</a>
  <a href="#use-cases">五、使用场景</a>
  <a href="#limits">六、限制与注意事项</a>
</div>

<h2 id="overview">一、架构概述</h2>
<h3 id="server-info">服务信息</h3>
<div class="info-box">
  <div class="row"><span class="label">协议</span><span class="value">Streamable HTTP (MCP)</span></div>
  <div class="row"><span class="label">端点</span><span class="value" id="docEndpoint">http://localhost:38765/mcp</span></div>
  <div class="row"><span class="label">方法</span><span class="value">POST /mcp</span></div>
  <div class="row"><span class="label">Session</span><span class="value">Mcp-Session-Id header 自动管理</span></div>
  <div class="row"><span class="label">健康检查</span><span class="value">GET /health → { status, sessions }</span></div>
</div>

<h3 id="lsp-bridge">LSP 桥接原理</h3>
<p>本扩展<strong>不直接启动 JDT.LS 进程</strong>，而是复用 VS Code 已集成的 JDT.LS。当打开 Java 项目时 <code>redhat.java</code> 扩展自动启动 JDT.LS 并与编辑器建立 LSP 连接。本扩展通过 VS Code 的 <code>commands.executeCommand</code> 调用内置 LSP Provider，底层向 JDT.LS 发送 LSP 请求并返回结果。</p>

<p>链路：AI Client → MCP → cc-mcp-lsp-java → VS Code API → JDT.LS → LSP → Eclipse JDT</p>

<p>参考：<a href="https://code.visualstudio.com/api/language-extensions/language-server-extension-guide" target="_blank">VS Code LSP 扩展指南</a> · <a href="https://github.com/eclipse-jdtls/eclipse.jdt.ls" target="_blank">Eclipse JDT.LS</a></p>

<h2 id="config">二、客户端配置</h2>
<p>在 Claude Desktop、Cursor 或其他 MCP 客户端中配置：</p>
<pre>{
  <span class="keyword">"mcpServers"</span>: {
    <span class="keyword">"cc-mcp-lsp-java"</span>: {
      <span class="keyword">"url"</span>: <span class="string">"http://localhost:38765/mcp"</span>
    }
  }
}</pre>
<p><a href="https://modelcontextprotocol.io/quickstart/user" target="_blank">MCP 客户端快速开始 →</a></p>

<h2 id="tools">三、工具参考</h2>
<h3 id="tool-search">1. searchJavaTypes — 搜索 Java 类型</h3>
<p>调用 <code>executeWorkspaceSymbolProvider</code>，对应 LSP <a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol" target="_blank">workspace/symbol</a>。适用于查找不确定完整路径的类、探索项目中的类型分布。</p>
<table>
  <tr><th>参数</th><th>类型</th><th>说明</th></tr>
  <tr><td>name</td><td><span class="tag req">必填</span></td><td>类型名称或名称片段，fuzzy 模式自动加通配符 <code>*name*</code></td></tr>
  <tr><td>matchMode</td><td><span class="tag opt">可选</span></td><td><code>strict</code> 精确匹配（默认）/ <code>fuzzy</code> 模糊搜索</td></tr>
</table>
<p>返回：类型种类、全限定名、文件路径、行号、来源（项目源码 <code>[src]</code> / JAR <code>[JAR]</code>）</p>

<pre><span class="comment">// 精确查找 ArrayList</span>
<span class="func">searchJavaTypes</span>({ <span class="keyword">name</span>: <span class="string">"ArrayList"</span>, <span class="keyword">matchMode</span>: <span class="string">"strict"</span> })

<span class="comment">// 模糊搜索项目中所有含 "Controller" 的类</span>
<span class="func">searchJavaTypes</span>({ <span class="keyword">name</span>: <span class="string">"Controller"</span>, <span class="keyword">matchMode</span>: <span class="string">"fuzzy"</span> })</pre>

<h3 id="tool-source">2. getSourceCodeByFQN — 获取源码</h3>
<p>按全限定名获取 Java 类型源码。先调用 <code>executeWorkspaceSymbolProvider</code> 定位文件，再用 <code>executeDocumentSymbolProvider</code>（LSP <a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol" target="_blank">textDocument/documentSymbol</a>）按方法名过滤。</p>
<table>
  <tr><th>参数</th><th>类型</th><th>说明</th></tr>
  <tr><td>fullyQualifiedName</td><td><span class="tag req">必填</span></td><td>全限定类名，如 <code>java.util.ArrayList</code></td></tr>
  <tr><td>methodNames</td><td><span class="tag opt">可选</span></td><td>字符串数组，只返回这些方法的源码片段</td></tr>
</table>
<p>项目 .java 文件返回完整源码；JAR 依赖返回签名信息。</p>

<pre><span class="comment">// 获取完整源码</span>
<span class="func">getSourceCodeByFQN</span>({ <span class="keyword">fullyQualifiedName</span>: <span class="string">"java.util.ArrayList"</span> })

<span class="comment">// 只获取 findById 和 save 方法</span>
<span class="func">getSourceCodeByFQN</span>({
  <span class="keyword">fullyQualifiedName</span>: <span class="string">"com.example.MyService"</span>,
  <span class="keyword">methodNames</span>: [<span class="string">"findById"</span>, <span class="string">"save"</span>]
})</pre>

<h2 id="lsp-methods">四、LSP 方法映射</h2>
<table>
  <tr><th>VS Code 命令</th><th>LSP 方法</th><th>用途</th><th>MCP 工具</th></tr>
  <tr><td><code>executeWorkspaceSymbolProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol" target="_blank">workspace/symbol</a></td><td>工作区符号搜索</td><td>searchJavaTypes<br>getSourceCodeByFQN</td></tr>
  <tr><td><code>executeDocumentSymbolProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol" target="_blank">textDocument/documentSymbol</a></td><td>文档符号列表</td><td>getSourceCodeByFQN</td></tr>
  <tr><td><code>executeDefinitionProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_definition" target="_blank">textDocument/definition</a></td><td>跳转到定义</td><td><span class="dim">规划中</span></td></tr>
  <tr><td><code>executeReferenceProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_references" target="_blank">textDocument/references</a></td><td>查找引用</td><td><span class="dim">规划中</span></td></tr>
  <tr><td><code>executeHoverProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_hover" target="_blank">textDocument/hover</a></td><td>悬停提示</td><td><span class="dim">规划中</span></td></tr>
  <tr><td><code>executeCompletionItemProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion" target="_blank">textDocument/completion</a></td><td>代码补全</td><td><span class="dim">规划中</span></td></tr>
</table>
<p><a href="https://code.visualstudio.com/api/references/commands" target="_blank">VS Code 命令参考 →</a></p>

<h2 id="use-cases">五、使用场景</h2>
<h3>场景 1：在新项目中探索代码结构</h3>
<pre><span class="comment">// 1. 模糊搜索了解有哪些 Service</span>
<span class="func">searchJavaTypes</span>({ <span class="keyword">name</span>: <span class="string">"Service"</span>, <span class="keyword">matchMode</span>: <span class="string">"fuzzy"</span> })

<span class="comment">// 2. 查看核心 Service 的完整源码</span>
<span class="func">getSourceCodeByFQN</span>({ <span class="keyword">fullyQualifiedName</span>: <span class="string">"com.acme.order.OrderService"</span> })</pre>

<h3>场景 2：理解第三方库用法</h3>
<pre><span class="comment">// 搜索 JAR 中的工具类</span>
<span class="func">searchJavaTypes</span>({ <span class="keyword">name</span>: <span class="string">"StringUtils"</span>, <span class="keyword">matchMode</span>: <span class="string">"fuzzy"</span> })

<span class="comment">// 获取签名（JAR 中只返回签名）</span>
<span class="func">getSourceCodeByFQN</span>({ <span class="keyword">fullyQualifiedName</span>: <span class="string">"org.apache.commons.lang3.StringUtils"</span> })</pre>

<h2 id="limits">六、限制与注意事项</h2>
<table>
  <tr><th>限制项</th><th>说明</th></tr>
  <tr><td>JDT.LS 依赖</td><td>需要 <code>redhat.java</code> 安装并激活，VS Code 必须打开 Java 项目</td></tr>
  <tr><td>索引进度</td><td>JDT.LS 索引完成前搜索结果可能不完整</td></tr>
  <tr><td>JAR 源码</td><td>编译依赖只返回方法签名，无完整实现</td></tr>
  <tr><td>端口配置</td><td>默认 38765，设置 <code>cc-mcp-lsp-java.port</code></td></tr>
  <tr><td>Session</td><td>管理面板可查看活跃会话和连接历史；重启后所有会话断开</td></tr>
  <tr><td>网络</td><td>仅监听 localhost，不暴露到网络</td></tr>
</table>

<script>
(function() {
  window.addEventListener('message', (e) => {
    if (e.data.type === 'status' && e.data.data.running) {
      const ep = document.getElementById('docEndpoint');
      if (ep) ep.textContent = 'http://' + e.data.data.host + ':' + e.data.data.port + '/mcp';
    }
  });
  const api = acquireVsCodeApi();
  api.postMessage({ type: 'requestStatus' });
})();
</script>
</body>
</html>`;
}
