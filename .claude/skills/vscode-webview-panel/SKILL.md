---
name: vscode-webview-panel
description: VS Code Extension Webview 面板开发模式 — 侧边栏/编辑器双视图、原生分组、事件同步、结果面板。当需要添加新的 Webview 面板、管理视图或结果展示页时触发。
---

# VS Code Extension Webview 面板开发

## 架构模式

```
WebviewView (sideba) ──→ 输入/控制/状态展示
                       ↘
WebviewPanel (editor) ──→ 文档/结果/富内容展示
```

## 步骤

### Step 1 — 注册视图

`package.json`:

```json
"views": {
  "myContainer": [
    { "type": "webview", "id": "viewId", "name": "显示名称" }
  ]
}
```

激活事件加 `onView:viewId`。

### Step 2 — 实现 Provider

```ts
class MyProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = getHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      // 处理消息
    });
  }
}
```

### Step 3 — 注册

```ts
vscode.window.registerWebviewViewProvider('viewId', new MyProvider(), {
  webviewOptions: { retainContextWhenHidden: true },
});
```

### Step 4 — 编辑器结果面板

侧边栏只放输入控件，结果用 `window.createWebviewPanel` 展示：

```ts
function openResultPanel(title: string, html: string) {
  const panel = vscode.window.createWebviewPanel(id, title, 
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  );
  panel.webview.html = html;
  panel.webview.onDidReceiveMessage(handler);
  return panel;
}
```

## 状态同步

用 `EventEmitter` 将后端状态推送到 Webview：

```ts
const emitter = new vscode.EventEmitter<ServerInfo>();
// 后端变更时 fire
emitter.fire(getServerInfo());
// Webview 侧订阅
emitter.event((info) => panel.webview.postMessage({ type: 'status', data: info }));
```

## 关键约定

- Webview HTML 全部用内联 `<style>` + 内联 `<script>`，不依赖外部资源
- 消息协议统一：`{ type: string, ...payload }`
- Webview 内部用 `acquireVsCodeApi()` 通信
