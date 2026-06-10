## Why

当前扫描流程是同步阻塞的：`scan_project` 工具内部调用 `future.get()` 等待 JACG 扫描完成才返回 MCP 响应（耗时 7+ 秒）。导致三个问题：

1. **无 UI 反馈** — 用户点击"扫描"后，MCP 线程被阻塞，无法返回中间进度
2. **按钮可重复点击** — 面板不知道扫描状态，未禁用按钮
3. **体验差** — 用户以为操作没生效，反复点击触发多次扫描

## What Changes

- **修改** `mcp/tool/ScanProjectTool.java` — `scan_project` 立即返回 `execId` + `status: "running"`，不阻塞
- **修改** `scanner/JacgScanner.java` — scan 执行状态存入内存 Map，可被 `query_scan_status` 查询
- **新增** `mcp/tool/QueryScanStatusTool.java` — `query_scan_status` 查询扫描进度（running / complete / timeout / failed + elapsedMs + fileCount）
- **修改** `src/jacg-bridge.ts` — `scan()` 改为：触发 scan_project → 轮询 query_scan_status 直到完成
- **修改** `src/extension.ts` — `cc-mcp-lsp-java.scanCallGraph` 命令改为异步轮询 + withProgress 实时更新
- **修改** `src/webview/callgraph/` — 扫描按钮在扫描期间禁用

## Capabilities

### New Capabilities
- `async-scan-with-polling`: `scan_project` 立即返回 execId，客户端通过 `query_scan_status` 轮询进度

### Modified Capabilities
- `fine-grained-tools`: `scan_project` 的行为从「同步等待结果」改为「异步创建任务，立即返回」
- `sidecar-process-management`: TypeScript 侧的 `scan()` 函数从「单一 MCP 调用」改为「触发 → 轮询 → 完成」三步流程

## Impact

- **java-sidecar/.../mcp/tool/ScanProjectTool.java** — 核心改动：不再 `future.get()` 等待
- **java-sidecar/.../scanner/JacgScanner.java** — 新增状态追踪 Map
- **java-sidecar/.../mcp/tool/QueryScanStatusTool.java** — 新建文件
- **java-sidecar/.../model/ScanResult.java** — 可能修改（加 execId 字段）
- **src/jacg-bridge.ts** — `scan()` 函数重写，新增轮询逻辑
- **src/extension.ts** — `cc-mcp-lsp-java.scanCallGraph` 命令重写，加入 withProgress + 轮询
- **src/webview/callgraph/** — 面板 React 组件，扫描按钮禁用逻辑
