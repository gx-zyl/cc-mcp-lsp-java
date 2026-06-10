## MODIFIED Requirements

### Requirement: scan 函数改为异步轮询
TypeScript 侧 `scan()` 函数从「触发 MCP 工具 → 等结果」改为「触发 → 轮询 → 完成」三步。

#### Scenario: 异步扫描
- **WHEN** 用户点击「扫描」
- **THEN** `scan()` 调用 `scan_project` MCP 工具获取 `execId`
- **AND** 每 2 秒调用 `query_scan_status` 直到 `complete`
- **AND** 轮询期间通过 `log` 回调输出进度

### Requirement: UI 扫描按钮禁用扫描中
面板 / webview 在扫描期间禁用扫描按钮。

#### Scenario: 禁用按钮
- **WHEN** 扫描进行中
- **THEN** 面板扫描按钮 disabled + 显示「扫描中…」
- **AND** 用户无法再次点击

### Requirement: 扫描进度通知
VS Code 的通知区域显示进度条。

#### Scenario: 进度通知
- **WHEN** 扫描进行中
- **THEN** VS Code 右下角显示进度通知「正在扫描调用图… 已处理 N 个文件」
- **AND** 扫描完成后自动关闭通知并提示结果
