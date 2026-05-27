[
  {
    "file": "src/panel.ts",
    "line": 469,
    "summary": "sidecarQuery 处理函数中 await import('./jacg-bridge.js') 是冗余的——该模块已在 line 19 静态导入，getCallers/getCallees 未加入顶部 import 列表",
    "failure_scenario": "代码功能正常（ES 模块缓存返回同一实例），但绕过编译时检查：getCallers 改名或删除时动态导入处不报错。应用简单的 import 扩展替代。"
  },
  {
    "file": "src/panel.ts",
    "line": 458,
    "summary": "handleSidecarScan 是 async 函数，在 startSidecarScan 处理中未 await，返回的 Promise 被丢弃",
    "failure_scenario": "未来在 handleSidecarScan 或内部调用中引入未捕获的错误路径时，Promise 拒绝不被处理，触发 Node.js unhandledRejection。"
  },
  {
    "file": "src/panel.ts",
    "line": 501,
    "summary": "openCallGraphPanel 的 startSidecarScan 处理比 CallGraphProvider 少了一次 postSidecarStatus 调用，两个视图路径行为不一致",
    "failure_scenario": "从编辑器标签页触发扫描时，前端可能收不到扫描开始前的状态快照，状态转换（如侧车中途失败）在 UI 上无法反映。"
  },
  {
    "file": "src/panel.ts",
    "line": 542,
    "summary": "handleSidecarClean 隐式依赖模块全局 _log，而 handleSidecarScan 接受显式 log 参数，接口不一致",
    "failure_scenario": "_log 仅在 registerManagementView 中初始化。若用户只打开调用图视图而不打开管理面板，日志回退为空函数，清理操作的日志丢失。"
  },
  {
    "file": "src/panel.ts",
    "line": 454,
    "summary": "postSidecarStatus 是 async 函数，在 requestSidecarStatus 处理中未 await",
    "failure_scenario": "当前因内部有 try-catch 安全，但未来修改移除 catch 后会产生未捕获的 Promise 拒绝。"
  }
]
