## MODIFIED Requirements

### Requirement: scan_project 返回值变化
`scan_project` 的返回值从扫描最终结果改为任务创建确认。

#### Scenario: 成功创建扫描任务
- **WHEN** 扫描任务创建成功
- **THEN** 返回 `{ "success": true, "execId": "uuid", "status": "running" }`
- **AND** `execId` 可用于后续 `query_scan_status` 查询

## ADDED Requirements

### Requirement: query_scan_status 工具
新增 `query_scan_status` 工具，取代旧 `query_status` 对扫描进度的查询。

#### Scenario: 轮询进度
- **WHEN** 前后端使用 `query_scan_status` 轮询
- **THEN** 每 2 秒返回一次最新状态
- **AND** 扫描完成后最终返回 `complete`
