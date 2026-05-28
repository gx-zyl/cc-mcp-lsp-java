package com.ccmcp.jacg;

import com.adrninistrator.jacg.conf.ConfigureWrapper;
import com.adrninistrator.jacg.conf.enums.ConfigDbKeyEnum;
import com.adrninistrator.jacg.conf.enums.ConfigKeyEnum;
import com.adrninistrator.jacg.runner.RunnerWriteDb;
import com.adrninistrator.jacg.runner.RunnerGenAllGraph4Caller;
import com.adrninistrator.jacg.runner.RunnerGenAllGraph4Callee;
import com.adrninistrator.jacg.findstack.FindCallStackTrace;
import com.adrninistrator.jacg.dto.callstack.CallStackFileResult;
import com.adrninistrator.jacg.dto.methodcall.MethodCallLineData4Er;
import com.adrninistrator.jacg.dto.methodcall.MethodCallLineData4Ee;
import com.adrninistrator.javacg2.conf.JavaCG2ConfigureWrapper;
import com.adrninistrator.javacg2.conf.enums.JavaCG2OtherConfigFileUseListEnum;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonArray;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * java-all-call-graph 侧车进程
 *
 * 数据库按 projectId 隔离。
 * H2 文件：{baseDbDir}/{projectId}.mv.db（CDKE_DB_H2_FILE_PATH 设为目录路径时不带后缀，H2 自动追加 .mv.db）
 * 输出目录：{baseDbDir}/{projectId}/output/
 *
 * 端点：
 *   POST /scan       — 阶段1：解析字节码 → H2
 *   POST /query      — 阶段2：查询调用图
 *   POST /clean      — 清理当前项目数据库
 *   POST /clean-all  — 清理所有项目数据库
 *   GET  /status     — 当前状态
 *   GET  /health     — 存活检查
 */
public class SidecarMain {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static volatile String baseDbDir;
    private static volatile String currentProjectId = "";
    private static volatile List<String> inputDirs = Collections.synchronizedList(new ArrayList<>());
    private static volatile boolean scanned;
    private static volatile ConfigureWrapper lastConfig;

    public static void main(String[] args) throws Exception {
        int port = 38766;
        baseDbDir = System.getProperty("user.home") + "/.cc-mcp-lsp-java/jacg";

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port": port = Integer.parseInt(args[++i]); break;
                case "--db-dir": baseDbDir = args[++i]; break;
                case "--input": inputDirs.add(args[++i]); break;
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/health", SidecarMain::handleHealth);
        server.createContext("/status", SidecarMain::handleStatus);
        server.createContext("/scan", SidecarMain::handleScan);
        server.createContext("/query", SidecarMain::handleQuery);
        server.createContext("/clean", SidecarMain::handleClean);
        server.createContext("/clean-all", SidecarMain::handleCleanAll);
        server.setExecutor(null);
        server.start();

        log("Sidecar on http://127.0.0.1:" + port + " baseDb:" + baseDbDir);
    }

    /* ───────── 项目隔离 ───────── */

    private static String extractProjectId(JsonObject body) {
        String pid = body.has("projectId") ? body.get("projectId").getAsString() : "default";
        if (pid.contains("..") || pid.contains("/") || pid.contains("\\")) return "default";
        return pid;
    }

    /** project 输出目录 */
    private static String projectOutDir(String projectId) {
        return baseDbDir + "/" + projectId;
    }

    /** H2 数据库文件路径（不含 .mv.db 后缀，H2 自动追加） */
    private static String projectDbPath(String projectId) {
        return baseDbDir + "/" + projectId;
    }

    /** H2 数据库文件（含后缀） */
    private static String projectDbFile(String projectId) {
        return baseDbDir + "/" + projectId + ".mv.db";
    }

    /* ───────── 端点处理 ───────── */

    private static void handleHealth(HttpExchange ex) throws IOException {
        ok(ex, "{\"ok\":true}");
    }

    private static void handleStatus(HttpExchange ex) throws IOException {
        // scanned 按当前项目数据库文件实际存在来判断
        String pid = currentProjectId.isEmpty() ? "" : currentProjectId;
        boolean dbExists = !pid.isEmpty() && new File(projectDbFile(pid)).exists();

        JsonObject o = new JsonObject();
        o.addProperty("scanned", scanned && dbExists);
        o.addProperty("baseDbDir", baseDbDir);
        o.addProperty("projectId", currentProjectId);
        JsonArray dirs = new JsonArray();
        synchronized (inputDirs) {
            for (String d : inputDirs) dirs.add(d);
        }
        o.add("inputDirs", dirs);
        ok(ex, GSON.toJson(o));
    }

    private static void handleScan(HttpExchange ex) throws IOException {
        JsonObject body = parseBody(ex);
        String projectId = extractProjectId(body);
        String pOutDir = projectOutDir(projectId);
        String pDbPath = projectDbPath(projectId);

        if (body.has("inputDirs")) {
            JsonArray arr = body.getAsJsonArray("inputDirs");
            synchronized (inputDirs) {
                inputDirs.clear();
                for (int i = 0; i < arr.size(); i++) {
                    inputDirs.add(arr.get(i).getAsString());
                }
            }
        }
        if (inputDirs.isEmpty()) { error(ex, 400, "no input directories set"); return; }

        try {
            new File(pOutDir).mkdirs();
            currentProjectId = projectId;
            log("Scan project=" + projectId + " dirs=" + String.join("; ", inputDirs) + " db=" + pDbPath);
            emitProgress("preparing", "Initializing scan for project " + projectId);

            JavaCG2ConfigureWrapper cg2Cw = new JavaCG2ConfigureWrapper(true);
            synchronized (inputDirs) {
                cg2Cw.setOtherConfigList(JavaCG2OtherConfigFileUseListEnum.OCFULE_JAR_DIR, new ArrayList<>(inputDirs));
            }
            ConfigureWrapper cw = new ConfigureWrapper(true);
            cw.setMainConfig(ConfigKeyEnum.CKE_SKIP_WRITE_DB_WHEN_JAR_NOT_MODIFIED, "false");
            cw.setMainConfig(ConfigKeyEnum.CKE_APP_NAME, projectId);
            cw.setMainConfig(ConfigKeyEnum.CKE_OUTPUT_DIR_NAME, pOutDir + "/output");
            cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_USE_H2, Boolean.TRUE.toString());
            cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_H2_FILE_PATH, pDbPath);

            emitProgress("scanning", "Parsing bytecode and writing call graph database...");
            RunnerWriteDb runner = new RunnerWriteDb(cg2Cw, cw);
            boolean ok = runner.run();

            if (ok) {
                scanned = true;
                lastConfig = cw;
                emitProgress("complete", "Scan complete");
                ok(ex, "{\"ok\":true,\"phase\":\"scan\"}");
            } else {
                emitProgress("error", "Scan failed");
                error(ex, 500, "scan failed");
            }
        } catch (Throwable e) {
            log("scan error: " + e);
            emitProgress("error", e.getMessage());
            error(ex, 500, e.getMessage());
        }
    }

    private static void handleQuery(HttpExchange ex) throws IOException {
        JsonObject body = parseBody(ex);
        String projectId = extractProjectId(body);
        String pDbPath = projectDbPath(projectId);
        String pDbFile = projectDbFile(projectId);

        // 检查实际 H2 文件是否存在
        if (!new File(pDbFile).exists()) {
            error(ex, 400, "project " + projectId + " has no database. Run /scan first.");
            return;
        }

        String cmd = body.has("cmd") ? body.get("cmd").getAsString() : "";
        currentProjectId = projectId;

        ConfigureWrapper cw = new ConfigureWrapper(true);
        cw.setMainConfig(ConfigKeyEnum.CKE_CALL_GRAPH_RETURN_IN_MEMORY, "true");
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_USE_H2, Boolean.TRUE.toString());
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_H2_FILE_PATH, pDbPath);

        // 过滤参数
        String filterClass = body.has("className") ? body.get("className").getAsString() : "";
        String filterMethod = body.has("methodName") ? body.get("methodName").getAsString() : "";
        java.util.function.Predicate<String> keyFilter = key -> {
            if (!filterClass.isEmpty() && !key.startsWith(filterClass + ":")) return false;
            if (!filterMethod.isEmpty()) {
                int colonIdx = key.indexOf(':');
                if (colonIdx < 0) return false;
                String methodPart = key.substring(colonIdx + 1);
                if (!methodPart.startsWith(filterMethod + "(")) return false;
            }
            return true;
        };

        JsonObject result = new JsonObject();
        result.addProperty("cmd", cmd);

        try {
            switch (cmd) {
                case "callers": {
                    try {
                        RunnerGenAllGraph4Caller runner = new RunnerGenAllGraph4Caller(cw);
                        runner.run();
                        Map<String, List<MethodCallLineData4Er>> data = runner.getAllMethodCallLineData4ErMap();
                        result.add("data", callerMapToJson(filterMap(data, keyFilter)));
                    } catch (Throwable e) {
                        log("JACG caller query failed, fallback to SQL: " + e);
                        result.add("data", queryCallersSql(pDbPath, projectId, filterClass, filterMethod));
                    }
                    break;
                }
                case "callees": {
                    try {
                        RunnerGenAllGraph4Callee runner = new RunnerGenAllGraph4Callee(cw);
                        runner.run();
                        Map<String, List<MethodCallLineData4Ee>> data = runner.getAllMethodCallLineData4EeMap();
                        result.add("data", calleeMapToJson(filterMap(data, keyFilter)));
                    } catch (Throwable e) {
                        log("JACG callee query failed, fallback to SQL: " + e);
                        result.add("data", queryCalleesSql(pDbPath, projectId, filterClass, filterMethod));
                    }
                    break;
                }
                case "methodList": {
                    try {
                        // 注意：JACG API 不提供纯键查询，只能全量生成后取 keyset
                        RunnerGenAllGraph4Caller runner = new RunnerGenAllGraph4Caller(cw);
                        runner.run();
                        Map<String, List<MethodCallLineData4Er>> all = runner.getAllMethodCallLineData4ErMap();
                        JsonArray methods = new JsonArray();
                        all.keySet().stream().filter(keyFilter).forEach(methods::add);
                        result.add("methods", methods);
                    } catch (Throwable e) {
                        log("JACG methodList query failed, fallback to SQL: " + e);
                        result.add("methods", queryMethodsSql(pDbPath, projectId, filterClass, filterMethod));
                    }
                    break;
                }
                case "findPath": {
                    String keyword = body.has("keyword") ? body.get("keyword").getAsString() : "";
                    // 必须传入 cw 以绑定项目数据库路径
                    FindCallStackTrace fst = new FindCallStackTrace(false, cw);
                    CallStackFileResult fsr = fst.find();
                    JsonArray paths = new JsonArray();
                    if (fsr.isSuccess() && fsr.getStackFilePathList() != null) {
                        for (String fp : fsr.getStackFilePathList()) {
                            try {
                                String content = new String(Files.readAllBytes(Paths.get(fp)), StandardCharsets.UTF_8);
                                if (keyword.isEmpty() || content.contains(keyword)) {
                                    paths.add(content);
                                }
                            } catch (IOException ignored) {}
                        }
                    }
                    result.add("paths", paths);
                    break;
                }
                default:
                    error(ex, 400, "unknown cmd: " + cmd); return;
            }
            ok(ex, GSON.toJson(result));
        } catch (Throwable e) {
            log("query error: " + e);
            error(ex, 500, e.getMessage());
        }
    }

    /** 清理当前项目数据库 */
    private static void handleClean(HttpExchange ex) throws IOException {
        JsonObject body = parseBody(ex);
        String projectId = extractProjectId(body);
        String pOutDir = projectOutDir(projectId);
        String pDbFile = projectDbFile(projectId);

        long sizeBefore = 0;
        File outDir = new File(pOutDir);
        File dbFile = new File(pDbFile);
        sizeBefore += dirSize(outDir);
        sizeBefore += dbFile.exists() ? dbFile.length() : 0;

        // 删除输出目录和 .mv.db 文件
        deleteDir(outDir);
        boolean dbDeleted = !dbFile.exists() || dbFile.delete();
        // 二次尝试：Windows 锁延迟释放
        if (!dbDeleted && dbFile.exists()) {
            try { Thread.sleep(100); } catch (InterruptedException ignored) {}
            dbDeleted = dbFile.delete();
        }
        // 输出目录也可能有残留
        boolean outDeleted = !outDir.exists() || deleteDir(outDir);

        if (outDeleted && dbDeleted) {
            if (projectId.equals(currentProjectId)) {
                scanned = false;
                lastConfig = null;
            }
            String freed = formatSize(sizeBefore);
            log("Cleaned project " + projectId + " freed " + freed);
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("freed", freed);
            o.addProperty("projectId", projectId);
            ok(ex, GSON.toJson(o));
        } else {
            String detail = "outDir=" + outDeleted + " dbFile=" + dbDeleted;
            log("Clean failed for " + projectId + ": " + detail);
            error(ex, 500, "failed to clean project " + projectId + " (" + detail + ")");
        }
    }

    /** 清理所有项目数据库 */
    private static void handleCleanAll(HttpExchange ex) throws IOException {
        File dir = new File(baseDbDir);
        long sizeBefore = dirSize(dir);

        if (deleteDir(dir)) {
            scanned = false;
            lastConfig = null;
            currentProjectId = "";
            String freed = formatSize(sizeBefore);
            log("Cleaned all projects, freed " + freed);
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("freed", freed);
            ok(ex, GSON.toJson(o));
        } else {
            error(ex, 500, "failed to clean all caches");
        }
    }

    /* ───────── JSON 工具 ───────── */

    /** 按 key 过滤 Map */
    private static <V> Map<String, V> filterMap(Map<String, V> map, java.util.function.Predicate<String> filter) {
        Map<String, V> result = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, V> e : map.entrySet()) {
            if (filter.test(e.getKey())) {
                result.put(e.getKey(), e.getValue());
            }
        }
        return result;
    }

    private static JsonArray callerMapToJson(Map<String, List<MethodCallLineData4Er>> data) {
        JsonArray arr = new JsonArray();
        int count = 0;
        for (Map.Entry<String, List<MethodCallLineData4Er>> e : data.entrySet()) {
            if (count++ > 200) { arr.add("[truncated]"); break; }
            JsonObject node = new JsonObject();
            node.addProperty("caller", e.getKey());
            JsonArray callees = new JsonArray();
            if (e.getValue() != null) {
                for (MethodCallLineData4Er mc : e.getValue()) {
                    callees.add(mc.getActualFullMethod());
                }
            }
            node.add("callees", callees);
            arr.add(node);
        }
        return arr;
    }

    private static JsonArray calleeMapToJson(Map<String, List<MethodCallLineData4Ee>> data) {
        JsonArray arr = new JsonArray();
        int count = 0;
        for (Map.Entry<String, List<MethodCallLineData4Ee>> e : data.entrySet()) {
            if (count++ > 200) { arr.add("[truncated]"); break; }
            JsonObject node = new JsonObject();
            node.addProperty("callee", e.getKey());
            JsonArray callers = new JsonArray();
            if (e.getValue() != null) {
                for (MethodCallLineData4Ee mc : e.getValue()) {
                    callers.add(mc.getActualFullMethod());
                }
            }
            node.add("callers", callers);
            arr.add(node);
        }
        return arr;
    }

    /* ───────── SQL 回退查询（绕过 JACG 4.0.9 的 JDK 25 NPE 缺陷） ───────── */

    /** 获取 H2 JDBC 连接，表在 jacg schema 下 */
    private static Connection getH2Connection(String dbPath) throws SQLException {
        try { Class.forName("org.h2.Driver"); } catch (ClassNotFoundException e) { throw new SQLException(e); }
        Connection conn = DriverManager.getConnection("jdbc:h2:file:" + dbPath);
        conn.setSchema("jacg");
        return conn;
    }

    private static String q(String s) { return '"' + s + '"'; }

    /** SQL 回退：查询方法列表 */
    private static JsonArray queryMethodsSql(String dbPath, String projectId, String filterClass, String filterMethod) {
        JsonArray arr = new JsonArray();
        String table = q("jacg_method_info_" + projectId);
        try (Connection conn = getH2Connection(dbPath);
             Statement st = conn.createStatement()) {
            StringBuilder sql = new StringBuilder("SELECT ").append(q("full_method"))
                .append(" FROM ").append(table).append(" ORDER BY 1");
            log("SQL fallback: " + sql);
            try (ResultSet rs = st.executeQuery(sql.toString())) {
                while (rs.next()) {
                    String method = rs.getString(1);
                    if (method == null) continue;
                    if (!filterClass.isEmpty() && !method.startsWith(filterClass + ":")) continue;
                    if (!filterMethod.isEmpty() && !method.split(":")[1].startsWith(filterMethod + "(")) continue;
                    arr.add(method);
                }
            }
        } catch (SQLException e) {
            log("SQL methodList fallback error: " + e);
        }
        return arr;
    }

    /** SQL 回退：查询调用方 */
    private static JsonArray queryCallersSql(String dbPath, String projectId, String filterClass, String filterMethod) {
        JsonArray arr = new JsonArray();
        String table = q("jacg_method_call_" + projectId);
        try (Connection conn = getH2Connection(dbPath);
             Statement st = conn.createStatement()) {
            String sql = "SELECT " + q("caller_full_method") + "," + q("callee_full_method")
                + " FROM " + table + " WHERE " + q("enabled") + "=1 ORDER BY " + q("caller_full_method");
            log("SQL fallback: " + sql);
            Map<String, List<String>> callerMap = new LinkedHashMap<>();
            try (ResultSet rs = st.executeQuery(sql)) {
                while (rs.next()) {
                    String caller = rs.getString(1);
                    String callee = rs.getString(2);
                    if (caller == null) continue;
                    if (!filterClass.isEmpty() && !caller.startsWith(filterClass + ":")) continue;
                    if (!filterMethod.isEmpty() && !caller.contains(filterMethod + "(")) continue;
                    callerMap.computeIfAbsent(caller, k -> new ArrayList<>());
                    if (callee != null && !callerMap.get(caller).contains(callee)) {
                        callerMap.get(caller).add(callee);
                    }
                }
            }
            int count = 0;
            for (Map.Entry<String, List<String>> e : callerMap.entrySet()) {
                if (count++ > 200) { arr.add("[truncated]"); break; }
                JsonObject node = new JsonObject();
                node.addProperty("caller", e.getKey());
                JsonArray callees = new JsonArray();
                for (String c : e.getValue()) callees.add(c);
                node.add("callees", callees);
                arr.add(node);
            }
        } catch (SQLException e) {
            log("SQL callers fallback error: " + e);
        }
        return arr;
    }

    /** SQL 回退：查询被调用方 */
    private static JsonArray queryCalleesSql(String dbPath, String projectId, String filterClass, String filterMethod) {
        JsonArray arr = new JsonArray();
        String table = q("jacg_method_call_" + projectId);
        try (Connection conn = getH2Connection(dbPath);
             Statement st = conn.createStatement()) {
            String sql = "SELECT " + q("callee_full_method") + "," + q("caller_full_method")
                + " FROM " + table + " WHERE " + q("enabled") + "=1 ORDER BY " + q("callee_full_method");
            log("SQL fallback: " + sql);
            Map<String, List<String>> calleeMap = new LinkedHashMap<>();
            try (ResultSet rs = st.executeQuery(sql)) {
                while (rs.next()) {
                    String callee = rs.getString(1);
                    String caller = rs.getString(2);
                    if (callee == null) continue;
                    if (!filterClass.isEmpty() && !callee.startsWith(filterClass + ":")) continue;
                    if (!filterMethod.isEmpty() && !callee.contains(filterMethod + "(")) continue;
                    calleeMap.computeIfAbsent(callee, k -> new ArrayList<>());
                    if (caller != null && !calleeMap.get(callee).contains(caller)) {
                        calleeMap.get(callee).add(caller);
                    }
                }
            }
            int count = 0;
            for (Map.Entry<String, List<String>> e : calleeMap.entrySet()) {
                if (count++ > 200) { arr.add("[truncated]"); break; }
                JsonObject node = new JsonObject();
                node.addProperty("callee", e.getKey());
                JsonArray callers = new JsonArray();
                for (String c : e.getValue()) callers.add(c);
                node.add("callers", callers);
                arr.add(node);
            }
        } catch (SQLException e) {
            log("SQL callees fallback error: " + e);
        }
        return arr;
    }

    private static JsonObject parseBody(HttpExchange ex) throws IOException {
        String s = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        if (s.isEmpty()) return new JsonObject();
        return GSON.fromJson(s, JsonObject.class);
    }

    private static void ok(HttpExchange ex, String json) throws IOException {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.sendResponseHeaders(200, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }

    private static void error(HttpExchange ex, int code, String msg) throws IOException {
        JsonObject o = new JsonObject();
        o.addProperty("error", msg);
        ok(ex, GSON.toJson(o));
    }

    /* ───────── 工具 ───────── */

    /** 向 stdout 输出 JSON 进度行 */
    static void emitProgress(String phase, String message) {
        JsonObject p = new JsonObject();
        p.addProperty("type", "progress");
        p.addProperty("phase", phase);
        p.addProperty("message", message);
        p.addProperty("timestamp", System.currentTimeMillis());
        System.out.println(GSON.toJson(p));
        System.out.flush();
    }

    /** 递归删除目录（在 Windows 上可能因锁而失败） */
    static boolean deleteDir(File dir) {
        if (!dir.exists()) return true;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) {
                    deleteDir(f);
                } else if (!f.delete() && f.exists()) {
                    log("Failed to delete file: " + f.getAbsolutePath());
                    // 重试一次
                    try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                    if (!f.delete() && f.exists()) {
                        log("Retry also failed: " + f.getAbsolutePath());
                    }
                }
            }
        }
        return dir.delete();
    }

    /** 计算目录大小 */
    static long dirSize(File dir) {
        if (!dir.exists()) return 0;
        long size = 0;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) size += dirSize(f);
                else size += f.length();
            }
        }
        return size;
    }

    static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        return String.format("%.1f MB", bytes / (1024.0 * 1024));
    }

    static void log(String s) {
        System.err.println("[jacg-sidecar] " + s);
    }
}
