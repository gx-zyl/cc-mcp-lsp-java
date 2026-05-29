/**
 * CC MCP LSP Java — VS Code Extension
 *
 * 启动内嵌 HTTP 服务器，通过 Streamable HTTP 暴露 MCP 协议。
 * 使用 VS Code 内置 LSP API（executeWorkspaceSymbolProvider 等）调用 JDT.LS，
 * 不额外启动 JDT.LS 进程。
 */

import * as vscode from 'vscode';
import { startMcpServer, stopMcpServer } from './server.js';
import { registerManagementView, registerDocView, registerTestView, registerCallGraphView, registerCallGraphDocView, openManagementPanel, openCallGraphPanel, openCallGraphDocPanel } from './panel.js';
import { startSidecar, stopSidecar, cleanProjectCache, discoverProjectClasspath, scan as jacgScan } from './jacg-bridge.js';

const LOG_TAG = '[cc-mcp-lsp-java]';
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('CC MCP LSP Java');
  log('Extension activating...');

  // 注册左侧活动栏侧边视图
  registerManagementView(context, log);
  registerDocView(context);
  registerTestView(context, log);
  registerCallGraphView(context, log);
  registerCallGraphDocView(context);

  // 注册编辑器标签页命令
  context.subscriptions.push(
    vscode.commands.registerCommand('cc-mcp-lsp-java.openManagement', () => {
      openManagementPanel(context, log);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cc-mcp-lsp-java.openCallGraph', () => {
      openCallGraphPanel(context, log);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cc-mcp-lsp-java.openCallGraphDoc', () => {
      openCallGraphDocPanel(context);
    })
  );

  // 注册配置变更监听
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cc-mcp-lsp-java')) {
        const enabled = vscode.workspace.getConfiguration('cc-mcp-lsp-java').get<boolean>('enabled', true);
        if (enabled) {
          stopMcpServer().then(() => startMcpServer(context, log));
          log('Configuration changed, restarting MCP server...');
        } else {
          stopMcpServer();
          log('MCP server disabled via settings.');
        }
      }
    })
  );

  // 启动 MCP 服务器
  const enabled = vscode.workspace.getConfiguration('cc-mcp-lsp-java').get<boolean>('enabled', true);
  if (enabled) {
    startMcpServer(context, log);
  }

  // 启动 java-all-call-graph 侧车（后台，不阻塞）
  startSidecar(context, log).then(() => log('Sidecar ready')).catch((err) => {
    log('Sidecar start failed: ' + (err instanceof Error ? err.message : String(err)));
  });

  // ── 状态栏图标 ──
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'cc-mcp-lsp-java.openManagement';
  statusBarItem.tooltip = 'CC MCP LSP Java — 点击打开管理面板';
  statusBarItem.text = '$(radio-tower) MCP';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── 侧车命令 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('cc-mcp-lsp-java.scanCallGraph', async () => {
      const cp = await discoverProjectClasspath(log);
      if (!cp) { vscode.window.showErrorMessage('无法自动发现 Classpath'); return; }
      const dirs = [...cp.compileOutput, ...cp.dependencyJars];
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在扫描调用图...', cancellable: true }, async (progress, token) => {
        token.onCancellationRequested(() => log('[jacg] Scan cancelled by user'));
        progress.report({ message: '分析字节码中...' });
        const ok = await jacgScan(dirs, log, {
          scanTimeout: vscode.workspace.getConfiguration('cc-mcp-lsp-java').get<number>('scanTimeout', 600),
        });
        if (ok) vscode.window.showInformationMessage('调用图扫描完成');
        else vscode.window.showErrorMessage('调用图扫描失败');
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cc-mcp-lsp-java.cleanCallGraph', async () => {
      const ok = await cleanProjectCache(log);
      if (ok) { vscode.window.showInformationMessage('调用图缓存已清理'); }
      else vscode.window.showErrorMessage('清理失败');
    })
  );

  log('Extension activated.');
}

export function deactivate() {
  log('Extension deactivating...');
  stopMcpServer();
  stopSidecar();
  outputChannel?.dispose();
}

function log(msg: string) {
  const line = `${LOG_TAG} ${msg}`;
  console.log(line);
  outputChannel?.appendLine(msg);
}
