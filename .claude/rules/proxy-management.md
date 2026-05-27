# 代理管理

- 默认不启用 `HTTP_PROXY` / `HTTPS_PROXY`
- 需要访问外网时临时启用：
  ```pwsh
  $env:HTTP_PROXY = 'http://127.0.0.1:9910'
  $env:HTTPS_PROXY = 'http://127.0.0.1:9910'
  ```
- 用完即时取消：
  ```pwsh
  Remove-Item Env:HTTP_PROXY, Env:HTTPS_PROXY
  ```
- 浏览器走 PAC 自动分流（`proxy.pac`），不依赖环境变量
