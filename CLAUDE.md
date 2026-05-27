# CLAUDE.md

## 调试工程

- Java 调试项目路径：`D:\project\cc-github-repo\git\AIProject`
- 类型：Spring Boot 3.2.1 + Spring AI + Jimmer ORM 项目
- 端口：`9902`
- 数据库：MySQL、Redis、Neo4j
- 启动调试窗口后，在此项目中打开任意 Java 文件即可触发 JDT.LS 索引
- 用于测试插件搜索类型、获取源码等功能

## 构建

```bash
npm run build          # vite build + tsup（先构建 webview，再构建扩展）
npm run watch          # tsup --watch（扩展端热更）
npm run watch:webview  # vite build --watch（webview 端热更）

# Java 侧车（调用图分析 — 修改后需手动构建）
cd java-sidecar && mvn package -DskipTests
```

### 构建架构

- **扩展端**：`src/*.ts` → tsup → `dist/extension.js`
- **Webview 端**：`src/webview/*` → Vite + React 19 → `dist-webview/`
  - 4 个独立入口：management / test / doc / result
  - 出口为自包含 HTML（`dist-webview/<name>/index.html`），asset 路径由扩展运行时自动转换
- **Java 侧车**：`java-sidecar/**/*.java` → Maven → `java-sidecar/target/jacg-sidecar-0.1.0-jar-with-dependencies.jar`
  - 扩展激活时通过 `jacg-bridge.ts` 以子进程方式启动
  - 提供 HTTP JSON-RPC（localhost:38766）供扩展查询调用图
- 面板通过 `panel.ts` 中 `resolveWebviewHtml()` 读取并注入 webview

### Webview 开发注意事项

- 所有面板 UI 用 React + TSX，`src/webview/` 下每个子目录一个独立应用
- 新建视图时需：创建入口目录（`index.html` + `main.tsx` + `App.tsx`）、在 `vite.config.ts` 添加入口
- 扩展端与 webview 通信：统一 `postMessage` 协议 `{ type: string, ... }`
- 共享模块位于 `src/webview/shared/`：`hooks.ts`（useVscodeListener, postMessage）、`types.ts`、`vscode-api.ts`
- CSS 目前合并输出，类名注意避免跨视图冲突

### java-all-call-graph 侧车

- **用途**：字节码级方法调用图分析（谁调了谁）
- **依赖**：`java-all-call-graph:4.0.6` + `java-callgraph2:4.0.4` + H2 + BCEL
- **Maven**：`D:\apache-maven-3.9.16\apache-maven-3.9.16\bin\mvn.cmd`
- **源码**：Maven dependency-plugin 已配置自动下载 sources.jar
- **数据库**：`~/.cc-mcp-lsp-java/jacg/jacg_db.h2.db`（H2 文件模式）
- **阶段1**：解析 .class / JAR → 填充 H2。`skipWhenNotModified=true` 缓存
- **阶段2**：查询调用图，内存模式返回 Java 对象，桥接层转 JSON
- **MCP 工具**：`analyzeCallGraph { command: scan|callers|callees|list|status }`

### 项目结构

```
cc-mcp-lsp-java/
├── src/
│   ├── extension.ts         # 插件入口
│   ├── server.ts            # MCP HTTP 服务器
│   ├── tools.ts             # MCP 工具（含 analyzeCallGraph）
│   ├── panel.ts             # Webview 面板管理
│   └── jacg-bridge.ts       # Java 侧车桥接（HTTP 客户端 + 进程管理）
├── src/webview/             # React 面板源码
├── java-sidecar/            # Java 侧车（Maven 项目）
├── docs/                    # 项目文档
├── dist/                    # 扩展构建产物
└── dist-webview/            # Webview 构建产物
```

## 本地测试

1. 在 VS Code 中按 `F5` 启动 Extension Development Host
2. 在调试窗口中打开 `D:\project\cc-github-repo\git\AIProject`
3. 等待 JDT.LS (redhat.java) 索引完成
4. 在侧边栏面板或通过 MCP Client 调用 `searchJavaTypes` / `getSourceCodeByFQN`

## 发布到 VS Code Marketplace

### 流程

```pwsh
# 1. 构建
npm run build

# 2. 打包 .vsix
npx @vscode/vsce package
```

### 方式 A：网页上传（推荐）

1. 打开 https://marketplace.visualstudio.com/manage/publishers/gx-zyl
2. 点右上角 **...** → **Upload Extension**
3. 选生成的 `.vsix` 文件

### 方式 B：CLI 发布

```pwsh
# 1. 查看 Azure DevOps 账号名
#    打开 https://dev.azure.com → 登录 → 浏览器地址栏显示的即是账号名（如 mozhuanzuojing2020）

# 2. 生成 PAT
#    打开 https://dev.azure.com/<账号名>/_usersSettings/tokens
#    + New Token → Organization: "All accessible organizations" → Scope: "Marketplace (Acquire)"

# 3. 发布
npx @vscode/vsce publish --pat <粘贴PAT>
```

> 上传前确保 `package.json` 中 `publisher` 字段与 Marketplace 注册的 publisher ID 一致（当前：`gx-zyl`）。
> 大于 100MB 的 vsix 会触发警告，当前约 42MB 在限制内。
