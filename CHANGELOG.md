# Changelog

## 0.3.1 (2026-06-10)

- **IP 显示修复**: 管理面板主机 IP 始终显示 127.0.0.1，不再暴露局域网 IP
- 移除 `os.networkInterfaces()` 和 `node:os` 依赖

## 0.3.0 (2026-06-10)

- **移除 java-all-call-graph 侧车**: 删除 Java 侧车全套件（java-sidecar/、jacg-bridge.ts、callgraph/callgraph-doc 面板）
- **清理引用**: extension.ts、panel.ts、package.json、vite.config.ts 全面清理侧车相关代码
- **文档清理**: docs/ 和 openspec/ 侧车相关文档和归档删除
- **VS Code 引擎**: ^1.120.0 → ^1.100.0
- **配置精简**: 移除 maxJars/scanTimeout/threads/queryTimeout 等侧车专用配置项

## 0.2.1 (2026-05-28)

- **JDK 25 兼容修复**: 侧车升级 JACG 4.0.6→4.0.9，覆盖 BCEL 6.10.0→6.12.0 支持 class file version 69
- **SQL 直查回退**: JACG 4.0.9 对 JDK 25 类存在 NPE，新增 H2 SQL 回退路径绕过此缺陷
- **异常处理加固**: catch(Exception) → catch(Throwable) 在 scan/query 处理中捕获 Error 类型

## 0.2.0 (2026-05-28)

- **进程管理重构**: 引入 SidecarStatusCode 枚举替代简单 boolean，侧车状态透明化
- **UI 重构**: 调用图分析面板全面升级（Badge 栏、Tabs 切换）
- **逻辑分离**: 提取 useCallGraphState Hook
- **MCP 结构化输出**: 所有 analyzeCallGraph 命令返回 JSON

## 0.1.0 (2025-05-27)

- Initial release
- MCP Streamable HTTP server for Java LSP integration
- Search Java types and Get source code tools
- Call graph analysis with java-all-call-graph sidecar
- Webview panels: Management, MCP Doc, Test, Call Graph, Call Graph Doc
