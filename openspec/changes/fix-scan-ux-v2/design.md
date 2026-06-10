## Changes

### 1. 错误详情透传
bridge 的 `scan()` 在失败时通过 `onProgress` 回调把错误信息传给 extension。

```
scan() → scan_project returns {success:false, error:"..."}
       → onProgress("失败: ...")
       → extension 的 withProgress 显示具体错误
```

### 2. 面板按钮禁用
修改 `src/webview/callgraph/` 的 React 组件，监听扫描状态，扫描期间禁用按钮。

### 3. 版本号更新
- pom.xml 0.2.0 → 0.3.0
- SIDECAR_JAR_REL 0.1.3 → 0.3.0
- application.yml 版本号更新
