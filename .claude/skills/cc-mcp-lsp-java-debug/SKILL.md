# CC MCP LSP Java — 调试启动

启动 VS Code Extension Development Host，加载 AIProject 作为测试工作区。

**TRIGGER**: 用户说"启动调试"、"测试插件"、"F5"、"debug extension"、"run extension"、"启动测试"、"打开调试" 时触发。

## 流程

### 方式 A：CLI 直接启动（推荐）

```pwsh
# 1. 先构建确保最新
cd D:\project\cc-mcp-lsp-java
npm run build

# 2. 启动 Extension Dev Host，加载 AIProject 作为测试工作区
code --extensionDevelopmentPath=D:\project\cc-mcp-lsp-java D:\project\cc-github-repo\git\AIProject
```

### 方式 B：VS Code F5

1. 在 VS Code 中打开 `D:\project\cc-mcp-lsp-java`
2. 按 `F5`
3. 弹出 Extension Dev Host 窗口，自动加载 AIProject（launch.json args 已配好）

## 启动后操作

在新窗口中：

1. **触发 JDT.LS 索引** — 打开任意 `.java` 文件（如 `src/main/java/io/...`）
2. 等待索引完成（右下角 redhat.java 状态变为 ✓）
3. 测试功能：
   - 左侧活动栏 → 5 个面板（管理 / 接口说明 / 查询测试 / 调用图分析 / 调用图接口说明）
   - MCP Client → `http://localhost:38765/mcp`
   - 调用图面板 → 点"扫描" → 等待完成 → 浏览类结构 → 追溯调用关系

## 前置条件

- VS Code 已安装 `redhat.java` 扩展
- AIProject 存在：`D:\project\cc-github-repo\git\AIProject`
- 扩展已构建：`npm run build`
- Java 侧车（可选，仅调用图功能需要）：`cd java-sidecar && mvn package -DskipTests`
