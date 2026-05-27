# CC MCP LSP Java — 当前进展

## 已完成

- **管理面板**：左侧活动栏侧边视图，显示监听地址、活跃会话、连接历史、重启日志，支持启动/停止/重启/端口变更
- **MCP 接口说明**：VS Code 原生视图分组，侧边栏独立折叠区域（"MCP 接口说明"）+ 编辑器标签页完整文档（架构、LSP 映射、工具参考、使用场景、限制提醒，附官方文档链接）
- **Server 状态事件**：`onDidChangeStatus` 事件推送 + `getServerInfo()` 状态查询，自动检测本机 IP
- **连接/重启追踪**：会话建立/关闭时间、持续时间记录，重启历史日志
- **GitHub skills**：从 cc-kit 拷贝 github-repo（仓库创建）和 git-workflow（工作流规范）
- **注释保护**：增量注释 + 分层注释已落地

## 待办

- 测试 MCP 工具（`searchJavaTypes` / `getSourceCodeByFQN`）在 AIProject 上的实际效果
- 连接历史持久化（当前仅内存，重启后丢失）
- LSP 方法扩展：跳转定义、查找引用、悬停提示、代码补全（规划中）
