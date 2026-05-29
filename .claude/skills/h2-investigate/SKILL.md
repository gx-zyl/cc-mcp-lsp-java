# H2 数据库查询

快速查询 JACG 侧车 H2 数据库的 schema 和数据。

**TRIGGER**: 用户说"查 H2"、"查数据库"、"h2 schema"、"看 H2 表"、"h2 数据" 时触发。

## H2 连接要点

| 项目 | 值 |
|------|-----|
| 驱动 | `org.h2.Driver` |
| JDBC URL | `jdbc:h2:file:{dbPath}`（如 `jdbc:h2:file:C:/Users/l/.../jacg`） |
| 用户名 | 无（空） |
| 密码 | 无（空） |
| Schema | `jacg` |
| 表名 | 全小写，双引号引用（如 `"jacg_method_call_{projectId}"`） |
| 列名 | 全大写（未引号）或小写（双引号），建议一律用双引号 |

## 表命名规则

所有 JACG 表格式：`jacg_{table_name}_{projectId}`

关键表：

| 表 | 说明 | 关键列 |
|----|------|--------|
| `jacg_method_call_{pid}` | 方法调用关系 | `caller_full_method`, `callee_full_method` |
| `jacg_method_info_{pid}` | 方法信息 | `full_method`, `simple_class_name`, `class_name` |
| `jacg_class_name_{pid}` | 类名映射 | `class_name`, `simple_class_name` |
| `jacg_class_info_{pid}` | 类信息 | `class_name`, `simple_class_name` |
| `jacg_jar_info_{pid}` | JAR 信息 | `jar_path`, `last_modified_time` |

## 查询模板

```java
import java.sql.*;
public class H2Query {
    public static void main(String[] a) throws Exception {
        Class.forName("org.h2.Driver");
        Connection c = DriverManager.getConnection("jdbc:h2:file:" + a[0]);
        c.setSchema("jacg");
        Statement s = c.createStatement();
        // 表名和列名用小写+双引号
        ResultSet r = s.executeQuery("SELECT \"caller_full_method\" FROM \"jacg_method_call_" + a[1] + "\" LIMIT 10");
        while (r.next()) System.out.println(r.getString(1));
        r.close(); c.close();
    }
}
```

## 快速查询（查表结构）

```powershell
# 查表列表
$java -cp "$h2Jar;$tmpDir" H2Query "$dbPath" "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='JACG'"

# 查列
$java -cp "$h2Jar;$tmpDir" H2Query "$dbPath" "SELECT COLUMN_NAME, TYPE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='jacg_method_call_{projectId}'"
```

## 注意事项

- H2 默认大小写敏感（带引号时）
- 不带引号的标识符会被转为大写
- 连接字符串末尾**不带** `.mv.db` 后缀
- 连接时不要加 `;DB_CLOSE_DELAY=-1` 等参数（会与 JACG 冲突）
