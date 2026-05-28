# SQL 回退模式：第三方库 API 异常时直查数据库

当第三方库的查询 API 抛出不可修复的异常（如 NPE）时，不要尝试修补库代码，优先用 SQL 直查数据库替代。

## 适用场景

- 第三方库的读取/查询方法抛出 `NullPointerException` 等非受检异常
- 库的版本升级也没有修复该问题
- 数据库（H2/SQLite/等）文件存在于本地且 schema 已知
- 需要返回与原 API **同构**的数据结构（调用方无感知）

## 模式

```java
// ❌ 错误：只查日志，用户看到空结果
try {
    return libraryApi.queryData();
} catch (Exception e) {
    log.error("query failed", e);
    return emptyResult();
}

// ✅ 正确：JACG API 抛异常 → SQL 降级
try {
    return libraryApi.queryData();
} catch (Throwable e) {
    log.warn("API query failed, fallback to SQL: " + e);
    return queryViaSql(dbPath, projectId);
}
```

## 规则

1. **MUST NOT** 尝试打补丁或 fork 第三方库 — 维护成本高，升级即覆盖
2. **MUST** 确保 SQL 查询返回的数据结构与原 API 完全一致（字段名、类型、嵌套层次）
3. **MUST** 处理数据库 schema 差异（如表名大小写、schema/owner 前缀、列名引用方式）
4. **SHOULD** 用 `catch(Throwable)` 兜住 Error 类型，防止线程静默死亡
5. **SHOULD** 记录降级日志（`warn` 级别），便于后期排查

## 案例：JACG 4.0.9 JDK 25 NPE

- 问题：`RunnerGenAllGraph4Caller.run()` 处理 JDK 25 class 数据时空 Map 导致 NPE
- 数据库：H2 文件模式，表在 `jacg` schema 下，列名需双引号引用
- 降级：直接 SQL 查询 `jacg_method_call_{projectId}` 和 `jacg_method_info_{projectId}` 表
- 结果：1018 方法、202 调用者节点，数据与原 JACG API 同构
