package com.ccmcp.jacg.query;

import com.adrninistrator.jacg.conf.ConfigureWrapper;
import com.adrninistrator.jacg.conf.enums.ConfigDbKeyEnum;
import com.adrninistrator.jacg.conf.enums.ConfigKeyEnum;
import com.adrninistrator.jacg.conf.enums.OtherConfigFileUseSetEnum;
import com.adrninistrator.jacg.dto.methodcall.MethodCallLineData4Ee;
import com.adrninistrator.jacg.dto.methodcall.MethodCallLineData4Er;
import com.adrninistrator.jacg.findstack.FindCallStackTrace;
import com.adrninistrator.jacg.runner.RunnerGenAllGraph4Callee;
import com.adrninistrator.jacg.runner.RunnerGenAllGraph4Caller;
import com.ccmcp.jacg.model.CallGraphNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 调用链查询器
 *
 * 封装 JACG 的方法调用查询操作：callers、callees、methodList、findPath。
 */
@Component
public class CallGraphQuerier {

    private static final Logger log = LoggerFactory.getLogger(CallGraphQuerier.class);
    private static final int MAX_RESULT_ITEMS = 200;
    private static boolean h2DriverLoaded = false;

    static { try { Class.forName("org.h2.Driver"); h2DriverLoaded = true; } catch (Exception e) { log.warn("H2 driver not found: {}", e.getMessage()); } }

    /**
     * 查询向上调用链（谁调用了指定方法）
     */
    public List<CallGraphNode> queryCallers(String projectId, String dbPath,
                                             String className, String methodName, String keyword) {
        ConfigureWrapper cw = buildCw(projectId, dbPath);
        Set<String> filterClasses = queryClassNames(dbPath, projectId, className);
        if (!filterClasses.isEmpty()) {
            cw.setOtherConfigSet(OtherConfigFileUseSetEnum.OCFUSE_METHOD_CLASS_4CALLER, filterClasses);
        }

        java.util.function.Predicate<String> keyFilter = buildKeyFilter(filterClasses, methodName);

        RunnerGenAllGraph4Caller runner = new RunnerGenAllGraph4Caller(cw);
        runner.run();
        Map<String, List<MethodCallLineData4Er>> all = runner.getAllMethodCallLineData4ErMap();
        if (all == null) return Collections.emptyList();

        return all.entrySet().stream()
                .filter(e -> keyFilter.test(e.getKey()))
                .limit(MAX_RESULT_ITEMS)
                .map(e -> {
                    List<String> callees = e.getValue() == null ? Collections.emptyList()
                            : e.getValue().stream().map(MethodCallLineData4Er::getActualFullMethod).collect(Collectors.toList());
                    return new CallGraphNode(e.getKey(), callees);
                })
                .collect(Collectors.toList());
    }

    /**
     * 查询向下调用链（指定方法调用了谁）
     */
    public List<CallGraphNode> queryCallees(String projectId, String dbPath,
                                             String className, String methodName, String keyword) {
        ConfigureWrapper cw = buildCw(projectId, dbPath);
        Set<String> filterClasses = queryClassNames(dbPath, projectId, className);
        if (!filterClasses.isEmpty()) {
            cw.setOtherConfigSet(OtherConfigFileUseSetEnum.OCFUSE_METHOD_CLASS_4CALLEE, filterClasses);
        }

        java.util.function.Predicate<String> keyFilter = buildKeyFilter(filterClasses, methodName);

        RunnerGenAllGraph4Callee runner = new RunnerGenAllGraph4Callee(cw);
        runner.run();
        Map<String, List<MethodCallLineData4Ee>> all = runner.getAllMethodCallLineData4EeMap();
        if (all == null) return Collections.emptyList();

        return all.entrySet().stream()
                .filter(e -> keyFilter.test(e.getKey()))
                .limit(MAX_RESULT_ITEMS)
                .map(e -> {
                    List<String> callers = e.getValue() == null ? Collections.emptyList()
                            : e.getValue().stream().map(MethodCallLineData4Ee::getActualFullMethod).collect(Collectors.toList());
                    return new CallGraphNode(e.getKey(), callers);
                })
                .collect(Collectors.toList());
    }

    /**
     * 列出所有已分析方法
     */
    public List<String> listMethods(String projectId, String dbPath,
                                     String className, String methodName) {
        ConfigureWrapper cw = buildCw(projectId, dbPath);
        java.util.function.Predicate<String> keyFilter = buildKeyFilter(
                queryClassNames(dbPath, projectId, className), methodName);

        RunnerGenAllGraph4Caller runner = new RunnerGenAllGraph4Caller(cw);
        runner.run();
        Map<String, List<MethodCallLineData4Er>> all = runner.getAllMethodCallLineData4ErMap();
        if (all == null) return Collections.emptyList();

        return all.keySet().stream()
                .filter(keyFilter)
                .limit(MAX_RESULT_ITEMS)
                .collect(Collectors.toList());
    }

    /**
     * 搜索调用路径
     */
    public List<String> findPath(String projectId, String dbPath, String keyword) {
        ConfigureWrapper cw = buildCw(projectId, dbPath);
        FindCallStackTrace fst = new FindCallStackTrace(false, cw);
        var fsr = fst.find();

        if (!fsr.isSuccess() || fsr.getStackFilePathList() == null) {
            return Collections.emptyList();
        }

        List<String> paths = new ArrayList<>();
        for (String fp : fsr.getStackFilePathList()) {
            try {
                String content = new String(Files.readAllBytes(Paths.get(fp)), StandardCharsets.UTF_8);
                if (keyword == null || keyword.isEmpty() || content.contains(keyword)) {
                    paths.add(content);
                }
            } catch (IOException ignored) {
                // skip unreadable files
            }
        }
        return paths;
    }

    /**
     * 构造 JACG ConfigureWrapper
     */
    private ConfigureWrapper buildCw(String projectId, String dbPath) {
        ConfigureWrapper cw = new ConfigureWrapper(true);
        cw.setMainConfig(ConfigKeyEnum.CKE_APP_NAME, projectId);
        cw.setMainConfig(ConfigKeyEnum.CKE_CALL_GRAPH_RETURN_IN_MEMORY, "true");
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_USE_H2, Boolean.TRUE.toString());
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_H2_FILE_PATH, dbPath);
        return cw;
    }

    /**
     * 从 H2 数据库查询类名（用于过滤）
     */
    private Set<String> queryClassNames(String dbPath, String projectId, String filterClass) {
        Set<String> classes = new HashSet<>();
        if (filterClass == null || filterClass.isEmpty()) return classes;

        try {
            if (!h2DriverLoaded) return classes;
            try (var conn = java.sql.DriverManager.getConnection("jdbc:h2:file:" + dbPath);
                 var st = conn.createStatement()) {
                conn.setSchema("jacg");
                String sql = "SELECT \"full_method\" FROM \"jacg_method_info_" + projectId
                        + "\" WHERE \"full_method\" LIKE '" + filterClass + "%'";
                try (var rs = st.executeQuery(sql)) {
                    while (rs.next()) {
                        String fm = rs.getString(1);
                        if (fm == null) continue;
                        int ci = fm.indexOf(':');
                        classes.add(ci > 0 ? fm.substring(0, ci) : fm);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("queryClassNames error: {}", e.getMessage());
        }
        return classes;
    }

    /**
     * 构造方法键过滤谓词
     */
    private java.util.function.Predicate<String> buildKeyFilter(Set<String> filterClasses, String methodName) {
        return key -> {
            if (!filterClasses.isEmpty()) {
                int ci = key.indexOf(':');
                if (ci < 0) return false;
                if (!filterClasses.contains(key.substring(0, ci))) return false;
            }
            if (methodName != null && !methodName.isEmpty()) {
                int ci = key.indexOf(':');
                if (ci < 0) return false;
                String mp = key.substring(ci + 1);
                if (!mp.startsWith(methodName + "(")) return false;
            }
            return true;
        };
    }
}
