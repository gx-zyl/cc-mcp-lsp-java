[
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 138,
    "summary": "CDKE_DB_H2_FILE_PATH 设为 pDbDir（如 ~/.jacg/{projectId}），H2 实际创建的文件是 {pDbDir}.mv.db 而非 {pDbDir}/jacg_db.mv.db",
    "failure_scenario": "scan 成功写入数据库后，/query 在 line 166 检查 {pDbDir}/jacg_db.mv.db 是否存在 → 找不到 → 返回 400 'project has no database'。所有查询功能（callers/callees/methodList）全部失效。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 249,
    "summary": "/clean 删除 {pDbDir}/ 目录，但 H2 数据库文件实际位于 {pDbDir}.mv.db（同级，不在目录内），因此清理无效",
    "failure_scenario": "用户调用 clean 后看到释放了少量空间（仅输出目录），但 .mv.db 文件残留。后续 scan 因 CKE_SKIP_WRITE_DB_WHEN_JAR_NOT_MODIFIED=true 误判 DB 已存在故跳过写入，导致残余数据污染新扫描。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 223,
    "summary": "findPath 用 new FindCallStackTrace(false)（单参数构造），忽略了前方已配好项目 H2 路径的 ConfigureWrapper，读取的是默认数据库位置",
    "failure_scenario": "用户扫描项目 A 成功后调用 findPath，由于 FindCallStackTrace 读的是默认 H2 数据库而非 {pDbDir}.mv.db，返回空路径或错误项目的数据。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 101,
    "summary": "Java /status 返回 baseDbDir 字段，但 TypeScript getStatus() 读取 result.dbDir（字段名不匹配），导致 dbDir 始终为 undefined",
    "failure_scenario": "MCP status 命令输出 'DB: undefined'，用户看到 undefined 但无法得知正确路径，诊断困难。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 43,
    "summary": "inputDirs 是普通 ArrayList（非线程安全），clear/add 操作在多线程 HTTP 处理器下存在竞态",
    "failure_scenario": "两个并发 /scan 请求同时到达，A 线程 clear() 后 B 线程也 clear()，A 的 add() 与 B 的 add() 交织 → 目录列表损坏、ArrayIndexOutOfBoundsException 或部分目录丢失。"
  },
  {
    "file": "src/jacg-bridge.ts",
    "line": 288,
    "summary": "scan() 先判断 sidecarProcess?.stdout 再访问 sidecarProcess.stdout.on()，期间 exit 回调可能置空 sidecarProcess，导致 TypeError",
    "failure_scenario": "侧车进程在 scan 请求执行期间异常退出（OOM/端口冲突），exit 回调触发设置 sidecarProcess = null。stdout.on('data', ...) 或 removeListener 时读到 null 抛 TypeError，掩盖真实失败原因。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 100,
    "summary": "scanned 是全局 boolean，不绑定 projectId。清理或切换项目后状态可能过时",
    "failure_scenario": "扫描项目 A 后 scanned=true。用户手动删除 A 的 .mv.db 文件，/status 仍返回 scanned: true → MCP 客户端发起查询 → 查询失败 'no database'，用户在状态显示正常的情况下遇到查询错误。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 212,
    "summary": "methodList 运行完整 RunnerGenAllGraph4Caller（生成全量调用边），只提取 keyset 后丢弃所有边数据，造成大量浪费",
    "failure_scenario": "万级方法的项目调用 methodList，JACG 生成完整调用图（遍历数万边），延迟 3-5 秒，而仅需一次 SELECT DISTINCT 即可在毫秒级返回方法列表。"
  },
  {
    "file": "java-sidecar/src/main/java/com/ccmcp/jacg/SidecarMain.java",
    "line": 322,
    "summary": "deleteDir() 中 f.delete() 不检查返回值，文件删除失败静默忽略",
    "failure_scenario": "/clean 时 H2 数据库文件被并发查询锁定，f.delete() 返回 false，程序继续，最终 dir.delete() 也失败。返回 500 但不知道哪个文件被锁定。"
  },
  {
    "file": "src/jacg-bridge.ts",
    "line": 283,
    "summary": "getProjectId() 无 workspace 时返回 undefined，log 输出 'Scanning ... for project undefined'",
    "failure_scenario": "用户打开单文件而非 workspace 时触发 scan，日志显示 project undefined，多个无 workspace 的扫描全部落入 'default' 数据库，互相污染且无警告。"
  }
]
