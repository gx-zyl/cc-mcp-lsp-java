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
import * as os from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';

let httpServer: http.Server | null = null;
let currentPort = 38765;

/** 服务器状态变更事件 */
const _onDidChangeStatus = new vscode.EventEmitter<ServerInfo>();
export const onDidChangeStatus = _onDidChangeStatus.event;

export interface ConnectionRecord {
  id: string;
  startTime: number;
  endTime?: number;
}

export interface ServerInfo {
  running: boolean;
  port: number;
  host: string;
  sessions: number;
  connections: ConnectionRecord[];
  restartHistory: string[];
}

/** sid → { transport } */
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();
/** 连接历史 */
const connectionHistory = new Map<string, ConnectionRecord>();
/** 重启历史 */
const restartHistory: string[] = [];

function getHostIp(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const iface = ifaces[name];
    if (!iface) continue;
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}

function emitStatus() {
  const info = getServerInfo();
  _onDidChangeStatus.fire(info);
}

export function getServerInfo(): ServerInfo {
  return {
    running: httpServer !== null,
    port: currentPort,
    host: getHostIp(),
    sessions: sessions.size,
    connections: Array.from(connectionHistory.values()),
    restartHistory: [...restartHistory],
  };
}

export async function startMcpServer(
  context: vscode.ExtensionContext,
  log: (msg: string) => void,
  portOverride?: number
): Promise<void> {
  currentPort = portOverride ?? vscode.workspace
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
          connectionHistory.set(sid, { id: sid, startTime: Date.now() });
          transport.onclose = () => {
            sessions.delete(sid);
            const rec = connectionHistory.get(sid);
            if (rec) { rec.endTime = Date.now(); }
            emitStatus();
          };
          log(`Session established: ${sid.substring(0, 8)}...`);
          emitStatus();
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
    httpServer!.listen(currentPort, () => {
      log(`MCP server ready at http://localhost:${currentPort}/mcp (Streamable HTTP)`);
      vscode.window.showInformationMessage(
        `[CC MCP LSP Java] Server → http://localhost:${currentPort}/mcp`
      );
      restartHistory.push(`[${new Date().toLocaleString()}] Started on port ${currentPort}`);
      context.subscriptions.push({ dispose: () => stopMcpServer() });
      emitStatus();
      resolve();
    });

    httpServer!.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log(`Port ${currentPort} in use. Change port in settings (cc-mcp-lsp-java.port).`);
        vscode.window.showWarningMessage(`[CC MCP LSP Java] Port ${currentPort} is in use.`);
      } else {
        log(`Server error: ${err.message}`);
      }
      httpServer = null;
      emitStatus();
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
      httpServer!.close(() => { httpServer = null; emitStatus(); resolve(); });
    });
  }
}
