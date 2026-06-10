## Why

当前扫描自动选择 3 个 JAR，用户无法控制扫哪些。有时用户只关心自己项目的代码（target/classes），不需要扫依赖 JAR。给用户选择权，最多选 3 个（侧车限制）。

## What Changes

- 扫描前弹出一个 jar 选择对话框（在 webview 内）
- 列出所有可扫描的目录/JAR（target/classes + target/dependency/*.jar）
- 每个条目有 checkbox，最多选 3 个
- 点扫描时传入用户选择的列表
- 默认选中前 3 个（保持现状行为）

## Impact

- `src/webview/callgraph/App.tsx` — 新增选择对话框组件
- `src/webview/callgraph/hooks/useCallGraphState.ts` — 管理选中状态
- `src/webview/callgraph/styles.css` — 选择框样式
- bridge/panel/extension/后端 不动
