# CLAUDE.md

## 调试工程

- Java 调试项目路径：`D:\project\cc-github-repo\git\AIProject`
- 类型：Spring Boot 3.2.1 + Spring AI + Jimmer ORM 项目
- 端口：`9902`
- 数据库：MySQL、Redis、Neo4j
- 启动调试窗口后，在此项目中打开任意 Java 文件即可触发 JDT.LS 索引
- 用于测试插件搜索类型、获取源码等功能

## 构建

```bash
npm run build
npm run watch
```

## 本地测试

1. 在 VS Code 中按 `F5` 启动 Extension Development Host
2. 在调试窗口中打开 `D:\project\cc-github-repo\git\AIProject`
3. 等待 JDT.LS (redhat.java) 索引完成
4. 在侧边栏面板或通过 MCP Client 调用 `searchJavaTypes` / `getSourceCodeByFQN`
