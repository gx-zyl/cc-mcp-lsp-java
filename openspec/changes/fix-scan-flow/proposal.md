## Why

扫描流程有多个 bug 导致用户点击「扫描」后失败或无反馈：

1. **`@McpToolParam` 把可选参数标记为 required** — `scan_project` 的 `maxJars`/`scanTimeout`/`threads` 被标记为必填，bridge 不传这些值时 MCP 协议层直接拒绝调用
2. **`ScanManager` 重复检测过于严格** — 旧扫描残留 `running` 状态时，新扫描被拒绝，返回 `"scan already running"` → bridge 报错
3. **进程残留** — 旧侧车进程未清除时，Spring Boot repackage 因 JAR 被锁而失败，用户跑的还是旧版

## What Changes

- **修改** `mcp/tool/ScanProjectTool.java` — `maxJars`/`scanTimeout`/`threads` 加 `required = false`
- **修改** `mcp/tool/QueryCallersTool.java` — `className`/`methodName`/`keyword` 加 `required = false`
- **修改** `mcp/tool/QueryCalleesTool.java` — 同上
- **修改** `mcp/tool/ListMethodsTool.java` — `className`/`methodName` 加 `required = false`
- **修改** `scanner/ScanManager.java` — 允许新扫描覆盖旧的，不拒绝

## Impact

- `java-sidecar/.../mcp/tool/ScanProjectTool.java` — 修改注解
- `java-sidecar/.../mcp/tool/QueryCallersTool.java` — 修改注解
- `java-sidecar/.../mcp/tool/QueryCalleesTool.java` — 修改注解
- `java-sidecar/.../mcp/tool/ListMethodsTool.java` — 修改注解
- `java-sidecar/.../scanner/ScanManager.java` — 修改重复检测

## Capabilities

### Modified Capabilities
- `fine-grained-tools`: 所有工具的 @McpToolParam required 设为合理值
- `async-scan-with-polling`: ScanManager 允许新扫描覆盖旧扫描
