## 1. 面板消息

- [ ] 1.1 `panel.ts` — 处理 `requestClasspath` 消息，调用 `discoverProjectClasspath` 返回结果
- [ ] 1.2 webview 收到 `classpathResult` 后保存到状态

## 2. Webview 选择 UI

- [ ] 2.1 `useCallGraphState.ts` — 存 `availableDirs`, `selectedDirs`, `jarFilter`
- [ ] 2.2 `App.tsx` — 扫描按钮改为弹出选择对话框
- [ ] 2.3 选择框顶部的搜索输入框，实时过滤 JAR 列表
- [ ] 2.4 选择框中每个路径可勾选，最多 3 个
- [ ] 2.5 确认后调用 `doScan(selectedDirs)`

## 3. 扫描

- [ ] 3.1 更新 `doScan` 接受可选的 `dirs` 参数
- [ ] 3.2 未选择时保持原有自动发现行为
