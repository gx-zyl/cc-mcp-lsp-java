/**
 * CC MCP LSP Java — VS Code Extension
 *
 * 启动内嵌 HTTP 服务器，通过 Streamable HTTP 暴露 MCP 协议。
 * 使用 VS Code 内置 LSP API（executeWorkspaceSymbolProvider 等）调用 JDT.LS，
 * 不额外启动 JDT.LS 进程。
 */

import * as vscode from 'vscode';
import { startMcpServer, stopMcpServer } from './server.js';
import { registerManagementView, registerDocView, openManagementPanel } from './panel.js';

const LOG_TAG = '[cc-mcp-lsp-java]';
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('CC MCP LSP Java');
  log('Extension activating...');

  // 注册左侧活动栏侧边视图
  registerManagementView(context, log);
  registerDocView(context);

  // 注册编辑器标签页命令
  context.subscriptions.push(
    vscode.commands.registerCommand('cc-mcp-lsp-java.openManagement', () => {
      openManagementPanel(context, log);
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

  log('Extension activated.');
}

export function deactivate() {
  log('Extension deactivating...');
  stopMcpServer();
  outputChannel?.dispose();
}

function log(msg: string) {
  const line = `${LOG_TAG} ${msg}`;
  console.log(line);
  outputChannel?.appendLine(msg);
}
