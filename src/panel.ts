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
