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
```

### 构建架构

- **扩展端**：`src/*.ts` → tsup → `dist/extension.js`
- **Webview 端**：`src/webview/*` → Vite + React 19 → `dist-webview/`
  - 4 个独立入口：management / test / doc / result
  - 出口为自包含 HTML（`dist-webview/<name>/index.html`），asset 路径由扩展运行时自动转换
- 面板通过 `panel.ts` 中 `resolveWebviewHtml()` 读取并注入 webview

### Webview 开发注意事项

- 所有面板 UI 用 React + TSX，`src/webview/` 下每个子目录一个独立应用
- 新建视图时需：创建入口目录（`index.html` + `main.tsx` + `App.tsx`）、在 `vite.config.ts` 添加入口
- 扩展端与 webview 通信：统一 `postMessage` 协议 `{ type: string, ... }`
- 共享模块位于 `src/webview/shared/`：`hooks.ts`（useVscodeListener, postMessage）、`types.ts`、`vscode-api.ts`
- CSS 目前合并输出，类名注意避免跨视图冲突

## 本地测试

1. 在 VS Code 中按 `F5` 启动 Extension Development Host
2. 在调试窗口中打开 `D:\project\cc-github-repo\git\AIProject`
3. 等待 JDT.LS (redhat.java) 索引完成
4. 在侧边栏面板或通过 MCP Client 调用 `searchJavaTypes` / `getSourceCodeByFQN`
