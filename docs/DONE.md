# 本周完成

- 项目初始化：cc-mcp-lsp-java VS Code 扩展 + MCP Streamable HTTP 服务器
- 项目重命名 `gx-mcp-lsp-java` → `cc-mcp-lsp-java`，引擎升级 ^1.120.0
- 管理面板：WebviewView 侧边栏 + WebviewPanel 编辑器标签页
- 服务器状态事件推送、连接/重启历史追踪、启动/停止/重启/端口变更
- MCP 接口说明：原生视图分组 + 编辑器文档标签页
- Java 查询测试：侧边栏查询 + 编辑器结果面板（过滤/排序/文件跳转）
- 克隆 AIProject (ai_project) 到本地
- GitHub skills：从 cc-kit 导入 github-repo、git-workflow
- **全量 Webview React 19 迁移**：所有面板从内联 HTML 模板迁移至 React 19 + TypeScript + Vite 构建
  - 4 个 React 应用：management / test / doc / result
  - Vite + @vitejs/plugin-react 多入口构建
  - 构建产物 `dist-webview/` 与扩展端 `dist/` 分离
  - 移除 ~900 行内联 HTML 模板代码
