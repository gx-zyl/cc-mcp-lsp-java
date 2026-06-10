## 流程

```
点击扫描
  ↓
弹出 JAR 选择对话框（webview 内模态）
  ├── 🔍 搜索 JAR 文件名...     ← 新增搜索框，实时过滤列表
  ├── ☑ target/classes
  ├── ☐ HikariCP-7.0.2.jar
  ├── ☐ HdrHistogram-2.2.2.jar
  ├── ... (最多 3 个勾，搜索时动态隐藏不匹配项)
  └── [开始扫描] [取消]
  ↓
传入选中列表 → 调用 scan_project
```

## 数据流

- `discoverProjectClasspath()` 返回 `compileOutput + dependencyJars`
- webview 存储这些路径供用户选择
- 用户确认后 `doScan()` 用选中路径调用 `scan_project`
- `maxJars` 自动设为用户选择的数量（≤3）
