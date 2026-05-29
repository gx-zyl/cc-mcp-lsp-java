# 集成 bug 优先排查原则

遇到第三方库的异常时，**先检查自己代码的配置和过滤逻辑**，再怀疑库本身。

## 核心原则

1. **配置缺失优先于库缺陷** — 第三方库需要正确配置才能工作。先查自己有没有漏传必要参数
2. **过滤条件错误优先于数据损坏** — 返回空结果通常不是库写崩了，而是查询/过滤条件不对
3. **Key 命名/格式优先于内部 NPE** — 很多 NPE 是接口层传了 null 或错误格式的参数

## 排查清单

- [ ] 确认所有必要配置参数已设置（`CKE_APP_NAME`, `CKE_OUTPUT_DIR_NAME` 等）
- [ ] 确认配置值与被操作的数据库/数据一致（表后缀、文件路径等）
- [ ] 确认过滤条件与数据格式匹配（`startsWith` vs 精确匹配 vs LIKE）
- [ ] 确认前后端参数命名一致
- [ ] 只有以上都确认后，再考虑升级库版本或打补丁

## 本次对话案例

| 现象 | 初始怀疑 | 实际原因 |
|------|---------|---------|
| JACG NPE (Map.getClass) | JACG 内部 bug | `CKE_APP_NAME` 没设 → 表后缀错 → `preHandle` 因输出目录已存在而失败 → map 未初始化 |
| 2 classes 返回 0 方法 | JACG 多 class 不支持 | 过滤条件用 `startsWith("className:")`，前缀 `Annotation` 不匹配完整的 `AnnotationVisitor:` |
| 扫描失败 | JDK 25 不兼容 | `classes-javacg2_merged.jar` 在输入目录中导致 java-callgraph2 循环解析 |
