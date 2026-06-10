## 1. Java 侧车：异步扫描 + SSE

- [x] 1.1 创建 `model/ScanState.java`
- [x] 1.2 创建 `scanner/ScanManager.java`
- [x] 1.3 修改 `scanner/JacgScanner.java` — Consumer 回调
- [x] 1.4 修改 `scanner/JacgScanner.java` — 异步不阻塞
- [x] 1.5 修改 `scanner/JacgScanner.java` — 重复检测
- [x] 1.6 新建 `controller/ScanProgressController.java`
- [x] 1.7 ScanManager 绑定回调 → SSE 事件
- [x] 2.1 修改 `mcp/tool/ScanProjectTool.java` — 异步返回 execId
- [x] 2.2 编译验证 ✅

## 3. TypeScript 侧：轮询进度

- [x] 3.1 修改 `src/jacg-bridge.ts` — 异步触发 + 轮询 query_scan_status
- [x] 3.2 修改 `src/extension.ts` — withProgress + onProgress 实时更新
- [x] 3.3 验证 TS 编译通过

## 4. Panel webview：按钮禁用

- [ ] 4.1 panel 扫描按钮 disabled（后续面板改造时做）
- [ ] 4.2 面板显示进度（后续面板改造时做）

## 5. 集成验证（已完成）

- [x] 5.1 MCP scan_project 立即返回 execId ✅
- [x] 5.2 query_scan_status 轮询返回进度 ✅
- [x] 5.3 后台扫描 6.4 秒完成 ✅
- [x] 5.4 withProgress 显示实时进度消息 ✅
