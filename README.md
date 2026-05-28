# CC MCP LSP Java

VS Code 扩展 + MCP Server，连接 VS Code **已有的** JDT.LS，并提供字节码级调用图分析。

## 架构

```
MCP Client (Claude Desktop / Cursor / etc.)
    │  POST /mcp (JSON-RPC 2.0, Streamable HTTP)
    ▼
cc-mcp-lsp-java VS Code Extension  (http://localhost:38765)
    │                          │
    │  vscode.commands         │  HTTP JSON-RPC (localhost:38766)
    │  .executeCommand()       │
    ▼                          ▼
VS Code Extension Host ──→ JDT.LS (redhat.java)    Java Sidecar (java-all-call-graph)
    │  类型搜索 / 源码获取                               │ 字节码解析 → H2 DB
    └──────────────────────────────────────────────────┘ 调用图查询
```

两路数据源：
- **LSP 查询**：通过 `vscode.executeWorkspaceSymbolProvider` 等内置命令访问 JDT.LS，用于类型搜索和源码获取
- **调用图分析**：Java 侧车子进程（java-all-call-graph）解析编译后字节码，提供方法调用关系查询

## 前置要求

- VS Code 1.120+
- VS Code 扩展: `redhat.java`（提供 JDT.LS 支持）
- JDK 17+（redhat.java 及 Java 侧车的依赖）
- Maven（仅构建 Java 侧车时需要）

## 安装

### 扩展

```bash
npm install
npm run build          # vite build（webview）+ tsup（扩展端）
```

VS Code 中按 `F5` 启动扩展开发模式，或打包：

```bash
npx @vscode/vsce package
code --install-extension cc-mcp-lsp-java-0.2.0.vsix
```

### Java 侧车（调用图分析）

调用图分析依赖 Java 侧车，需先构建：

```bash
cd java-sidecar
mvn package -DskipTests
```

侧车在扩展激活时自动以子进程方式启动，监听 `localhost:38766`。

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

## VS Code 侧边栏面板

扩展在活动栏注册了 5 个侧边视图：

| 面板 | ID | 说明 |
|------|----|------|
| 管理面板 | `ccMcpLspJavaManagement` | 服务器状态、连接/重启历史 |
| MCP 接口说明 | `ccMcpLspJavaDoc` | 完整 MCP 工具文档 |
| Java 查询测试 | `ccMcpLspJavaTest` | 交互式测试搜索类型 / 获取源码 |
| 调用图分析 | `ccMcpLspJavaCallGraph` | 侧车状态、扫描/查询/清理操作面板 |
| 调用图 MCP 接口说明 | `ccMcpLspJavaCallGraphDoc` | analyzeCallGraph 工具文档 |

## VS Code 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `cc-mcp-lsp-java.port` | 38765 | MCP Streamable HTTP 服务器端口 |
| `cc-mcp-lsp-java.enabled` | true | 启用/禁用 MCP 服务器 |

## MCP 工具

### searchJavaTypes

搜索 Java 类型（类、接口、枚举），区分项目源码和 JAR 依赖。

参数：
- `name` (string) — 类型名称或部分名称
- `matchMode` ("strict" | "fuzzy", 默认 "strict") — 匹配模式；fuzzy 模式下自动添加通配符

### getSourceCodeByFQN

获取 Java 类型源码。

参数：
- `fullyQualifiedName` (string) — 全限定名，如 `java.util.ArrayList` 或 `com.example.MyService`
- `methodNames` (string[], 可选) — 只返回指定方法的源码

### analyzeCallGraph

方法调用图分析（需要 Java 侧车运行）。支持向上追溯调用者、向下展开被调方法、列出方法列表、触发扫描及清理缓存。

参数：
- `command` ("scan" | "callers" | "callees" | "list" | "status" | "clean" | "clean-all") — 操作命令
  - `scan` — 自动发现 classpath 并扫描字节码
  - `callers` — 查询谁调用了指定方法（向上追溯）
  - `callees` — 查询指定方法调用了谁（向下展开）
  - `list` — 列出已扫描的所有方法
  - `status` — 侧车和扫描状态
  - `clean` — 清除当前项目的 H2 缓存
  - `clean-all` — 清除所有项目的 H2 缓存
- `className` (string, 可选) — 按类名过滤
- `methodName` (string, 可选) — 按方法名过滤
- `keyword` (string, 可选) — 方法名包含关键词过滤

首次使用需先执行 `scan`：自动通过 redhat.java 发现项目编译输出目录和依赖 JAR 路径，运行字节码解析并填充 H2 数据库。

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

### 为什么用侧车做调用图而非纯 LSP

LSP 本身不提供方法调用图查询能力。调用图分析依赖字节码级别的全量扫描（java-all-call-graph），因此以独立 Java 侧车进程运行，通过 HTTP JSON-RPC 与扩展通讯，与 JDT.LS 的功能互补而非替代。

### 为什么自建 Transport 而非用 Express

- Node.js 原生 `http` + SDK 的 `StreamableHTTPServerTransport` 已满足需求
- 避免 Express 引入的额外依赖和体积
- `StreamableHTTPServerTransport` 内部通过 `@hono/node-server` 自动转换 Node.js HTTP 到 Web API

## 项目结构

```
cc-mcp-lsp-java/
├── src/
│   ├── extension.ts         # 插件入口
│   ├── server.ts            # MCP HTTP 服务器
│   ├── tools.ts             # MCP 工具（3 个工具）
│   ├── panel.ts             # Webview 面板管理（5 个视图）
│   └── jacg-bridge.ts       # Java 侧车桥接（进程管理 + HTTP 客户端）
├── src/webview/             # React 19 + TypeScript 面板源码
│   ├── management/          # 管理面板
│   ├── doc/                 # MCP 接口说明
│   ├── test/                # Java 查询测试
│   ├── callgraph/           # 调用图分析
│   ├── callgraph-doc/       # 调用图 MCP 接口说明
│   └── shared/              # 共享 hooks / types / vscode-api
├── java-sidecar/            # Java 侧车（Maven 项目）
├── dist/                    # 扩展构建产物
└── dist-webview/            # Webview 构建产物
```

## 参考

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP TypeScript SDK
- [MCP Streamable HTTP Spec](https://spec.modelcontextprotocol.io/) — MCP 协议规范
- [java-all-call-graph](https://github.com/gx-zyl/java-all-call-graph) — 调用图分析引擎
- [vsc-lsp-mcp](https://github.com/beixiyo/vsc-lsp-mcp) — VS Code Extension + MCP Streamable HTTP 设计思路参考

## License

MIT
