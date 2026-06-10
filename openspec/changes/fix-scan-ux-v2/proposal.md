## Why

扫描流程经过多轮修复后，核心功能（异步触发 + 轮询 + SSE）已可用，但交互体验仍然很差：

1. **扫描失败时没有错误详情** — bridge 返回 `success: false` 但没有把侧车的具体错误传给用户
2. **面板按钮未禁用** — webview 面板的扫描按钮在扫描期间可重复点击
3. **无扫描进度条** — VS Code 通知区域的 `withProgress` 可用但面板内的进度未同步
4. **版本落后** — 当前 v0.2.0，多轮修改后需要发布新版本

## What Changes

- **修改** `src/jacg-bridge.ts` — `scan()` 失败时把错误原因通过 `onProgress` 回传，extension 展示给用户
- **修改** `src/webview/callgraph/` — 扫描按钮在扫描期间 disabled，显示进度文字
- **修改** `java-sidecar/pom.xml` — `<version>0.2.0</version>` → `0.3.0`
- **修改** `src/jacg-bridge.ts` — `SIDECAR_JAR_REL` 路径更新为 `0.3.0`
- **修改** `java-sidecar/src/main/resources/application.yml` — `version: 0.2.0` → `0.3.0`

## Impact

- `src/jacg-bridge.ts` — scan 返回错误消息
- `src/webview/callgraph/` — React 组件，按钮禁用 + 进度
- `java-sidecar/pom.xml` — 版本号
- `java-sidecar/src/main/resources/application.yml` — 版本号
