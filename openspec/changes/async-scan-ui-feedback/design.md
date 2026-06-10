## Context

当前 `scan_project` 的 Java 端实现是同步的 — `JacgScanner.doScan()` 调用 `future.get()` 阻塞等待扫描完成。MCP 工具层直接调用 `doScan()`，导致 Tomcat 线程被占用。TypeScript 桥接的 `scan()` 函数等待 HTTP 响应，期间无法给 UI 反馈。

## Goals / Non-Goals

**Goals:**
- `scan_project` 立即返回 `execId`，不阻塞 MCP 线程
- 侧车通过 SSE 实时推送扫描进度，不轮询
- VS Code 面板显示实时进度（"已处理 3 个文件"）
- 扫描期间禁用按钮，防止重复提交

**Non-Goals:**
- 不改动其他 7 个 MCP 工具
- 不改动健康检查机制
- 不做 WebSocket（SSE 足够且更简单）

## Decisions

### Decision 1: 内存状态 + SSE 服务端推送
**Choice:** 侧车维护 `Map<String, ScanState>`，扫描进度通过独立的 **SSE 端点** `GET /scan/progress/{execId}` 推送给客户端（TypeScript 用 `EventSource` 监听）。

**流程：**
```
scan_project → 返回 execId ← MCP 协议
                  ↓
EventSource 连接 /scan/progress/{execId} ← 独立 HTTP
                  ↓
进度事件: "parsing", "3 files done", "complete"
```

**Rationale:** 
- 实时推送，零延迟
- `EventSource` 浏览器/Node.js 原生支持
- SSE 单向足够，不需要双向 WebSocket
- 侧车已有 Spring Boot WebMVC，加个 Controller 端点即可

**Alternatives:**
- 轮询 — 延迟 2s，简单但不够实时
- WebSocket — 太重，双向不需要

### Decision 2: ScanState 数据结构
**Choice:**
```java
class ScanState {
    String execId;
    String projectId;
    String status;          // running | complete | timeout | failed
    int fileCount;
    long elapsedMs;
    long startTime;
    String errorMessage;
}
```
同时侧车内部维护 `Map<String, SseEmitter>`，用于向订阅者推送事件。

### Decision 3: SSE 端点设计
**端点:** `GET /scan/progress/{execId}`
**响应:** `text/event-stream`
**事件格式:**
```
event: progress
data: {"status":"running","fileCount":3,"elapsedMs":4500}

event: complete
data: {"status":"complete","fileCount":3,"elapsedMs":7148}
```

**事件列表:**
| 事件名 | 触发时机 |
|--------|---------|
| `started` | 扫描开始，含 fileCount |
| `progress` | 每处理完一个 JAR/class 文件 |
| `complete` | 扫描成功完成 |
| `timeout` | 扫描超时 |
| `failed` | 扫描失败 |

**实现:** Spring Boot `SseEmitter`，`JacgScanner` 在扫描进度回调中向 `SseEmitter` 发送事件。

### Decision 4: JacgScanner 改为可回调
**Choice:** `JacgScanner.doScan()` 接受一个 `Consumer<ScanState>` 回调参数。每次进度变化时调用。
```java
public void scanAsync(String projectId, List<String> inputDirs, 
                       Consumer<ScanState> onProgress, ...) {
    executor.submit(() -> {
        onProgress.accept(new ScanState(execId, projectId, "running"));
        // ... JACG processing ...
        onProgress.accept(new ScanState(execId, projectId, "complete", fileCount));
    });
}
```
**Rationale:** 解耦扫描逻辑和推送机制。MCP 的 `scan_project` 可以传一个空回调，SSE Controller 可以传 SseEmitter 回调。

### Decision 5: VS Code 侧 EventSource
**Choice:** TypeScript bridge 的 `scan()` 使用 Node.js `EventSource` 监听 `/scan/progress/{execId}`。

```typescript
const execId = await triggerScanViaMCP(projectId, inputDirs);
return new Promise((resolve) => {
    const es = new EventSource(`http://127.0.0.1:38766/scan/progress/${execId}`);
    es.addEventListener('progress', (e) => log(`[jacg] ${e.data}`));
    es.addEventListener('complete', (e) => { es.close(); resolve(true); });
    es.addEventListener('failed', (e) => { es.close(); resolve(false); });
});
```

**Rationale:** Node.js 18+ 原生支持 `EventSource`。VS Code Electron 的 Node 版本 ≥18。

### Decision 6: 按钮禁用
**Choice:** panel webview 通过 `postMessage` 接收扫描状态事件，按钮根据 `isScanning` 状态禁用。
**Rationale:** 不需全局状态，面板内部管理即可。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| SSE 连接意外断开 | 自动重连（EventSource 原生支持），重试 3 次后降级为轮询 |
| 用户关掉 VS Code 再打开，内存状态丢失 | 重启后状态不保留，用户重新扫描即可 |
| 同时触发多个扫描 | `scan_project` 检查 projectId 是否已有 running 状态 |
| EventSource 在 VS Code Electron 中不可用 | fallback 到轮询（已有 `query_scan_status`） |
