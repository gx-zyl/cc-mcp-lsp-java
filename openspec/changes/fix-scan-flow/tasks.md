## 1. 注解修正

- [x] 1.1 ScanProjectTool: maxJars/scanTimeout/threads → required=false
- [x] 1.2 QueryCallersTool: className/methodName/keyword → required=false
- [x] 1.3 QueryCalleesTool: className/methodName/keyword → required=false
- [x] 1.4 ListMethodsTool: className/methodName → required=false

## 2. 逻辑修正

- [x] 2.1 ScanManager: 允许新扫描覆盖旧的

## 3. 验证

- [x] 3.1 mvn package 编译通过
- [x] 3.2 npm run build 编译通过
