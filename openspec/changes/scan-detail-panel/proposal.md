## Why

当前扫描进度只显示 "1/3 文件 5秒"，用户看不到具体在做什么。

## What Changes

- **修改** `ScanState` — 添加 `currentFile` 字段（当前处理的 JAR 文件名）
- **修改** `JacgScanner` — 逐个 JAR 处理时，更新 `currentFile` 并回调
- **修改** `McpController.qss` — 返回 `currentFile`
- **修改** `bridge` — 轮询时提取 `currentFile` 传给 webview
- **修改** `webview/callgraph/` — 右侧或下方添加扫描细节面板，显示当前处理的 JAR 名
