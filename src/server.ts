/**
 * Streamable HTTP MCP 服务器
 *
 * 使用 @modelcontextprotocol/sdk 的 StreamableHTTPServerTransport，
 * 单端点 POST /mcp，MCP + JSON-RPC 2.0 协议。
 *
 * 客户端配置:
 *   { "mcpServers": { "cc-mcp-lsp-java": { "url": "http://localhost:38765/mcp" } } }
 */

import * as http from 'node:http';
import * as vscode from 'vscode';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';

let httpServer: http.Server | null = null;

/** sid → { transport } */
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

export async function startMcpServer(
  context: vscode.ExtensionContext,
  log: (msg: string) => void
): Promise<void> {
  const port = vscode.workspace
    .getConfiguration('cc-mcp-lsp-java')
    .get<number>('port', 38765);

  if (httpServer) await stopMcpServer();

  httpServer = http.createServer(async (req, res) => {
    // ── CORS 预检 ──
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    // ── MCP: POST /mcp ──
    if (req.method === 'POST' && req.url === '/mcp') {
      // 读取请求体
      const buffers: Buffer[] = [];
      for await (const chunk of req) buffers.push(chunk);
      const body = Buffer.concat(buffers).toString('utf-8');

      try {
        const clientSessionId = req.headers['mcp-session-id'] as string | undefined;
        const existing = clientSessionId ? sessions.get(clientSessionId) : undefined;

        let transport: StreamableHTTPServerTransport;
        let isNewSession = false;

        if (existing) {
          // ── 复用已有会话 ──
          transport = existing.transport;
          log(`[session ${clientSessionId!.substring(0, 8)}] request`);
        } else if (clientSessionId) {
          // ── 会话 ID 无效 ──
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        } else {
          // ── 新会话 ──
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
          });

          const mcpServer = new McpServer({
            name: 'cc-mcp-lsp-java',
            version: '0.1.0',
          });
          registerTools(mcpServer, log);

          await mcpServer.connect(transport);
          isNewSession = true;
          log('New session connecting...');
        }

        // 由 transport 接管 response 写入（含 session ID header）
        await transport.handleRequest(
          req as Parameters<typeof transport.handleRequest>[0],
          res as Parameters<typeof transport.handleRequest>[1],
          JSON.parse(body)
        );

        // 新会话初始化完成后保存（sessionId 在 handleRequest 内部生成）
        if (isNewSession && transport.sessionId) {
          const sid = transport.sessionId;
          sessions.set(sid, { transport });
          transport.onclose = () => sessions.delete(sid);
          log(`Session established: ${sid.substring(0, 8)}...`);
        }
      } catch (err) {
        log(`MCP error: ${err}`);
        if (!res.writableEnded) {
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
          } catch { /* ignore */ }
        }
      }
      return;
    }

    // ── GET /health ──
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'cc-mcp-lsp-java', status: 'running', sessions: sessions.size }));
      return;
    }

    // ── 404 ──
    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise<void>((resolve) => {
    httpServer!.listen(port, () => {
      log(`MCP server ready at http://localhost:${port}/mcp (Streamable HTTP)`);
      vscode.window.showInformationMessage(
        `[CC MCP LSP Java] Server → http://localhost:${port}/mcp`
      );
      context.subscriptions.push({ dispose: () => stopMcpServer() });
      resolve();
    });

    httpServer!.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log(`Port ${port} in use. Change port in settings (cc-mcp-lsp-java.port).`);
        vscode.window.showWarningMessage(`[CC MCP LSP Java] Port ${port} is in use.`);
      } else {
        log(`Server error: ${err.message}`);
      }
      httpServer = null;
      resolve();
    });
  });
}

export async function stopMcpServer(): Promise<void> {
  for (const { transport } of sessions.values()) {
    try { await transport.close(); } catch { /* ignore */ }
  }
  sessions.clear();
  if (httpServer) {
    return new Promise((resolve) => {
      httpServer!.close(() => { httpServer = null; resolve(); });
    });
  }
}
