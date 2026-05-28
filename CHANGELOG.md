# Changelog

## 0.2.1 (2026-05-28)

- **JDK 25 兼容修复**: 侧车升级 JACG 4.0.6→4.0.9，覆盖 BCEL 6.10.0→6.12.0 支持 class file version 69
- **SQL 直查回退**: JACG 4.0.9 对 JDK 25 类存在 NPE（`Cannot invoke getClass() because m is null`），新增 H2 SQL 回退路径绕过此缺陷
  - JACG 查询抛异常时自动降级为 SQL
  - 表位于 `jacg` schema 下，列名按双引号引用
  - 支持 className/methodName 过滤
- **异常处理加固**: `catch(Exception)` → `catch(Throwable)` 在 scan/query 处理中捕获 Error 类型
- **可靠重扫**: `CKE_SKIP_WRITE_DB_WHEN_JAR_NOT_MODIFIED=false` 确保每次重扫完整解析
- **侧车版本**: 0.1.0→0.1.2，Maven source/target 8→25
- **skill 修复**: 新增 `skill.json` 触发清单，调试启动 skill 可被关键词自动触发
- **文档修正**: CLAUDE.md Maven 路径修复、依赖版本更新

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
