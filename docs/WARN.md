# 重要提醒

- 连接历史仅内存存储，扩展重启后丢失
- 端口变更仅在运行时生效，VS Code 重启后恢复配置默认值
- 依赖 `redhat.java` 扩展，未安装时 MCP 工具可能异常
- 调用图扫描需要 `redhat.java` 扩展处于活跃状态以发现 Classpath，否则扫描按钮会报"无法自动发现 Classpath"
- 调用图侧车 JAR 需手动构建：`cd java-sidecar && mvn package -DskipTests`
