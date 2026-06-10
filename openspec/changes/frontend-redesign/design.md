## 布局

```
┌─────────────────────────────────┐
│ Header: 标题 + [扫描] [↻]       │ ← 固定顶部
├─────────────────────────────────┤
│ Summary: 状态 + 统计            │ ← 扫描后显示
├─────────────────────────────────┤
│ Filter: 🔍 搜索框               │ ← 过滤类/方法
├─────────────────────────────────┤
│ ClassTree                       │ ← 主区域，滚动
│  ├─ ClassNode                   │
│  │  ├─ MethodNode               │
│  │  │  ├─ CallerChain (↑)      │ 内联展开
│  │  │  └─ CalleeChain (↓)      │
│  │  └─ MethodNode               │
│  └─ ClassNode                   │
└─────────────────────────────────┘
```

## 组件树

```
App
├── Header (title + scan/refresh buttons)
├── SummaryBar (status dot + stats text)
├── FilterInput (search box)
└── ClassTree (scrollable main area)
    └── ClassNode[] (collapsible)
        ├── className (click to toggle)
        └── MethodNode[] (shown when expanded)
            ├── methodName (click to toggle chain)
            ├── CallerChain (↑ callers, inline)
            └── CalleeChain (↓ callees, inline)
```

## 数据流

```
组件内状态
├── sidecarState (从 extension 通过 postMessage 推送)
├── classTree (list query 结果 → parseClassTree)
├── expandedClasses (Set<string> 展开状态)
├── searchFilter (搜索文本)
└── expandedMethods (Set<string> 方法展开状态)

消息
├── mount → postMessage requestSidecarStatus
├── 每 5s → 轮询 requestSidecarStatus
├── 点扫描 → postMessage startSidecarScan
├── 收到 sidecarProgress → 更新
├── 收到 sidecarStatus → 更新状态
└── 收到 queryResult → 更新类树/调用链
```

## 样式原则

- VS Code 原生配色（CSS 变量 `--vscode-*`）
- 紧凑布局（侧边栏空间有限）
- 点击穿透（方法点击展开调用链，不整行选中）
- 颜色语义（绿=就绪，黄=进行中，红=错误）

## 不做的

- 不做动画（VS Code 侧边栏不需要）
- 不做实时进度条（7秒扫描不必要）
- 不做日志面板（移除）
- 不做 Tab 切换（统一视图）
- 不做调用链可视化图（文字树足够）
