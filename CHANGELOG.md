# Changelog

## 0.2.0 (2026-05-28)

- **进程管理重构**: 引入 `SidecarStatusCode` 枚举替代简单 boolean，侧车状态透明化
  - JAR 缺失时弹窗提示 + 构建指南，不再静默跳过
  - 启动超时后 reject 而非虚假就绪
  - 崩溃后自动重启（指数退避，最多 3 次）
- **UI 重构**: 调用图分析面板全面升级
  - Badge 栏替代 4 张状态卡片，释放侧边栏垂直空间
  - Tabs 切换 [类树浏览] / [调用链追溯]，告别滚动焦虑
  - 状态横幅按 7 种状态显示不同文案和颜色
- **逻辑分离**: 提取 `useCallGraphState` Hook，App.tsx 从 445 行减至 240 行
- **MCP 结构化输出**: 所有 `analyzeCallGraph` 命令返回 JSON，LLM 可解析
  - 错误返回 `{ ok, error, reason, action }`，LLM 可主动指导用户
- **MCP 工具增强**: 状态错误按具体原因精准提示
- 修复 panel.ts 预存 bug（handleSidecarClean 多余的 log 参数）

## 0.1.0 (2025-05-27)

- Initial release
- MCP Streamable HTTP server for Java LSP integration
- Search Java types (searchJavaTypes)
- Get source code by fully qualified name (getSourceCodeByFQN)
- Call graph analysis with java-all-call-graph sidecar
- Webview panels: Management, MCP Doc, Test, Call Graph, Call Graph Doc
- 5 sidecar views in sidebar
