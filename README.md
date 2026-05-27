# CC MCP LSP Java

VS Code 扩展 + MCP Server，连接 VS Code **已有的** JDT.LS。

## 架构

```
MCP Client (Claude Desktop / Cursor)
    │  POST /mcp (JSON-RPC 2.0, Streamable HTTP)
    ▼
cc-mcp-lsp-java VS Code Extension  (http://localhost:38765)
    │  vscode.commands.executeCommand()
    ▼
VS Code Extension Host → JDT.LS (redhat.java)
```

关键设计：
- **不启动**第二个 JDT.LS 进程，复用 VS Code 已有的
- 通过 `vscode.executeWorkspaceSymbolProvider` 等内置命令访问 JDT.LS
- 使用 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`
- 单端点 `POST /mcp`，MCP + JSON-RPC 2.0
- 无 Express 依赖，使用原生 Node.js http

## 前置要求

- VS Code 1.85+
- VS Code 扩展: `redhat.java`（提供 JDT.LS 支持）
- JDK 17+（redhat.java 的依赖）

## 安装

```bash
npm install
npm run build
```

VS Code 中按 `F5` 启动扩展开发模式，或打包：

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension cc-mcp-lsp-java-0.1.0.vsix
```

### MCP 客户端配置

```json
{
  "mcpServers": {
    "cc-mcp-lsp-java": {
      "url": "http://localhost:38765/mcp"
    }
  }
}
```

## VS Code 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `cc-mcp-lsp-java.port` | 38765 | MCP Streamable HTTP 服务器端口 |
| `cc-mcp-lsp-java.enabled` | true | 启用/禁用 MCP 服务器 |

## MCP 工具

### searchJavaTypes

搜索 Java 类型（类、接口、枚举），区分项目源码和 JAR 依赖。

参数：
- `name` (string) — 类型名称
- `matchMode` ("strict" | "fuzzy", 默认 "strict") — 匹配模式

### getSourceCodeByFQN

获取 Java 类型源码。

参数：
- `fullyQualifiedName` (string) — 全限定名
- `methodNames` (string[], 可选) — 只返回指定方法的源码

## 协议规范

### 传输层

- **协议**: MCP + JSON-RPC 2.0
- **传输**: Streamable HTTP（`@modelcontextprotocol/sdk` 内置 `StreamableHTTPServerTransport`）
- **端点**: `POST /mcp`
- **端口**: 38765（可通过 `cc-mcp-lsp-java.port` 配置）
- **会话标识**: `Mcp-Session-Id` HTTP 请求头

### 会话生命周期

```
客户端                                    服务端
  │                                         │
  │  POST /mcp (initialize, 无 sessionId)    │
  │ ───────────────────────────────────────→ │  创建新 Transport + McpServer
  │                                         │  调用 handleRequest()
  │  ←────────────────────────────────────── │  响应含 Mcp-Session-Id header
  │                                         │  服务端保存 { sessionId → transport }
  │                                         │
  │  POST /mcp (tools/list, sessionId=xxx)  │
  │ ───────────────────────────────────────→ │  按 sessionId 复用已有 Transport
  │  ←────────────────────────────────────── │  普通 JSON 响应
  │                                         │
  │  POST /mcp (tools/call, sessionId=xxx)  │
  │ ───────────────────────────────────────→ │
  │  ←── SSE stream ─────────────────────── │  Accept: text/event-stream 时发 SSE
```

### JSON-RPC 消息格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "searchJavaTypes",
    "arguments": {
      "name": "ArrayList",
      "matchMode": "fuzzy"
    }
  }
}
```

响应（同步完成时）：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 type(s) matching \"ArrayList\"..."
      }
    ]
  }
}
```

## 架构决策记录

### 为什么选 Streamable HTTP 而非 SSE

| 特性 | SSE（双端点） | Streamable HTTP（单端点） |
|------|-------------|------------------------|
| 端点数量 | `GET /sse` + `POST /message` | `POST /mcp` 一个 |
| 会话管理 | 手动实现 | SDK 内置 |
| MCP 客户端兼容 | Claude Desktop / Cursor | 同左（Streamable HTTP 是 MCP 标准） |
| SDK 支持 | `SSEServerTransport` | `StreamableHTTPServerTransport` |
| 长连接 | 始终 SSE | 按需流式（Accept header 决定） |

### 为什么复用 VS Code 的 JDT.LS 而非独立启动

| 方案 | 内存 | 冷启动 | 索引一致性 |
|------|------|--------|-----------|
| 独立启动 JDT.LS | +500MB~1GB | 10-30s | 可能不同步 |
| 复用 VS Code JDT.LS | 0 | 0 | 与编辑器一致 |

### 为什么自建 Transport 而非用 Express

- Node.js 原生 `http` + SDK 的 `StreamableHTTPServerTransport` 已满足需求
- 避免 Express 引入的额外依赖和体积
- `StreamableHTTPServerTransport` 内部通过 `@hono/node-server` 自动转换 Node.js HTTP 到 Web API

## 参考

- [vsc-lsp-mcp](https://github.com/beixiyo/vsc-lsp-mcp) — VS Code Extension + MCP Streamable HTTP 的设计思路来源
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP TypeScript SDK
- [MCP Streamable HTTP Spec](https://spec.modelcontextprotocol.io/) — MCP 协议规范
- [mcp-server-for-java](https://github.com/saikaNya/mcp-server-for-java) — 原始参考项目

## License

MIT
