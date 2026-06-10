## 1. 后端

- [x] 1.1 `ScanState.java` — 加 `currentFile` 字段
- [x] 1.2 `JacgScanner.java` — 逐个 JAR 时设 `currentFile` + 回调
- [x] 1.3 `McpController.java` — `qss()` 返回 `currentFile`

## 2. 桥接层

- [x] 2.1 `jacg-bridge.ts` — 轮询时提取 `currentFile`，追加到进度文本

## 3. Webview

- [x] 3.1 进度文本已包含 `currentFile`（内联显示）
