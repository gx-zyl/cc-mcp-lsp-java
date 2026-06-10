## ADDED Requirements

### Requirement: scan_project 异步执行
`scan_project` MCP 工具调用后必须立即返回，不阻塞 MCP 协议线程。

#### Scenario: 调用后立即返回
- **WHEN** Client 调用 `scan_project` 传入 projectId 和 inputDirs
- **THEN** 立即返回 `{ "success": true, "execId": "uuid", "status": "running" }`
- **AND** 返回时间 < 500ms

### Requirement: SSE 服务端推送进度
侧车必须提供 SSE 端点 `GET /scan/progress/{execId}`，实时推送扫描进度。

#### Scenario: 监听进度
- **WHEN** 扫描开始
- **THEN** SSE 推送 `event: started`, data 含 fileCount
- **WHEN** 每处理完一个文件
- **THEN** SSE 推送 `event: progress`, data 含 fileCount 和 elapsedMs

#### Scenario: 扫描完成
- **WHEN** 扫描成功
- **THEN** SSE 推送 `event: complete`

#### Scenario: 扫描失败
- **WHEN** 扫描超时或异常
- **THEN** SSE 推送 `event: timeout` 或 `event: failed`

### Requirement: 防止重复扫描
侧车必须检查 projectId 是否已有正在运行的扫描，防止重复提交。

#### Scenario: 重复提交检测
- **WHEN** Client 调用 `scan_project`
- **AND** 该 projectId 已有 running 状态的扫描
- **THEN** 返回 `{ "success": false, "error": "scan already running for this project" }`
