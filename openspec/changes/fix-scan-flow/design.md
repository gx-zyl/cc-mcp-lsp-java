## Context

扫描流程的 bug 已经定位和修复。修复涉及 5 个 Java 文件的注解和逻辑调整。

## Changes

1. **@McpToolParam required 修正**: 可选参数加 `required = false`，不再强制客户端传入
2. **ScanManager 重复覆盖**: 允许新扫描替换旧的，不拒绝

## Verification

- `mvn package` 编译通过
- 调试窗口点击扫描应有进度通知，扫描完成后提示成功
