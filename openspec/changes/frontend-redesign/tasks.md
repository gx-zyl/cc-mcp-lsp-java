## 1. State Hook 重构

- [x] 1.1 重写 `useCallGraphState.ts` — 精简状态，去掉 phase/progress/logs
- [x] 1.2 合并 showBrowser + hasResult 为统一 loaded 状态
- [x] 1.3 保留核心功能：状态轮询、扫描触发、类树加载、调用链查询

## 2. UI 组件重写

- [x] 2.1 重写 App.tsx Header — 标题 + [扫描] [刷新] 两个按钮
- [x] 2.2 重写 SummaryBar — 状态点 + 统计
- [x] 2.3 重写 FilterInput — 搜索框过滤
- [x] 2.4 重写 ClassTree — 类 → 方法 → 调用链 三级内联
- [x] 2.5 扫描完成自动加载类树

## 3. 样式

- [x] 3.1 移除旧的进度条/日志/Tab 样式
- [x] 3.2 新样式：紧凑、VS Code 原生配色
- [x] 3.3 统一按钮、输入框、类树节点样式

## 4. 验证

- [x] 4.1 `vite build` 通过（callgraph bundle 8KB）
- [x] 4.2 `npm run build` 通过
- [ ] 4.3 调试窗口打开，扫描后自动显示类树
- [ ] 4.4 搜索过滤正常工作
- [ ] 4.5 点击方法展开/收起调用链
