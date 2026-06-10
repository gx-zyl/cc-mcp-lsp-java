## 1. 桥接层捕获日志

- [x] 1.1 `jacg-bridge.ts` — 监听 stderr，ring buffer 200 行
- [x] 1.2 `setScanLogCallback` / `getScanLogs` 导出

## 2. 显示日志

- [x] 2.1 `panel.ts` — 扫描时创建 OutputChannel("JACG 扫描日志")
- [x] 2.2 实时写入，扫描完成后断开关闭

## 3. 验证

- [ ] 3.1 点扫描，右侧 output 面板自动打开
- [ ] 3.2 日志行实时追加
