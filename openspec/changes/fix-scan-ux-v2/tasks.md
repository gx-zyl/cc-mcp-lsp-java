## 1. 错误详情透传

- [x] 1.1 bridge scan() 失败时传错误消息给 onProgress
- [x] 1.2 extension withProgress 显示具体错误原因

## 2. 面板交互

- [ ] 2.1 面板按钮 disabled + 进度文字（webview React 改造，后续做）
- [ ] 2.2 面板 postMessage 接收扫描状态（webview React 改造）

## 3. 版本号更新

- [x] 3.1 pom.xml 0.2.0 → 0.3.0
- [x] 3.2 jacg-bridge.ts SIDECAR_JAR_REL → 0.3.0
- [x] 3.3 application.yml version → 0.3.0

## 4. 验证

- [x] 4.1 mvn package 通过 (73MB)
- [x] 4.2 npm run build 通过
- [ ] 4.3 调试窗口扫描测试
