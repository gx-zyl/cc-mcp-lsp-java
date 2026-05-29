package com.ccmcp.jacg;

import com.adrninistrator.jacg.conf.ConfigureWrapper;
import com.adrninistrator.jacg.conf.enums.ConfigDbKeyEnum;
import com.adrninistrator.jacg.conf.enums.ConfigKeyEnum;
import com.adrninistrator.jacg.conf.enums.OtherConfigFileUseSetEnum;
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
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * java-all-call-graph 侧车进程
 *
 * 端点：
 *   POST /scan       — 阶段1：解析字节码 → H2（支持超时、JAR 数限制、并发控制）
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

    // 用于超时后强制关闭 JACG 的 DataSource（反射访问 AbstractRunner.dbOperator）
    private static volatile Object runningRunner;
    private static volatile ExecutorService scanExecutor;

    public static void main(String[] args) throws Exception {
        int port = 38766;
        int maxConcurrentRequests = 1;
        baseDbDir = System.getProperty("user.home") + "/.cc-mcp-lsp-java/jacg";

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port": port = Integer.parseInt(args[++i]); break;
                case "--db-dir": baseDbDir = args[++i]; break;
                case "--input": inputDirs.add(args[++i]); break;
                case "--max-requests": maxConcurrentRequests = Integer.parseInt(args[++i]); break;
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/health", SidecarMain::handleHealth);
        server.createContext("/status", SidecarMain::handleStatus);
        server.createContext("/scan", SidecarMain::handleScan);
        server.createContext("/query", SidecarMain::handleQuery);
        server.createContext("/clean", SidecarMain::handleClean);
        server.createContext("/clean-all", SidecarMain::handleCleanAll);
        // maxConcurrentRequests=1 防止 H2 文件锁冲突
        server.setExecutor(new ThreadPoolExecutor(
            maxConcurrentRequests, maxConcurrentRequests, 0L, TimeUnit.MILLISECONDS,
            new LinkedBlockingQueue<>(1),
            new ThreadPoolExecutor.AbortPolicy()));
        scanExecutor = Executors.newCachedThreadPool();
        server.start();

        log("Sidecar on http://127.0.0.1:" + port + " baseDb:" + baseDbDir
            + " maxRequests=" + maxConcurrentRequests);
    }

    /* ───────── 工具方法 ───────── */

    private static int intParam(JsonObject body, String key, int def) {
        return body.has(key) ? body.get(key).getAsInt() : def;
    }

    /* ───────── 项目隔离 ───────── */

    private static String extractProjectId(JsonObject body) {
        String pid = body.has("projectId") ? body.get("projectId").getAsString() : "default";
        if (pid.contains("..") || pid.contains("/") || pid.contains("\\")) return "default";
        return pid;
    }

    private static String projectOutDir(String projectId) { return baseDbDir + "/" + projectId; }
    private static String projectDbPath(String projectId) { return baseDbDir + "/" + projectId; }
    private static String projectDbFile(String projectId) { return baseDbDir + "/" + projectId + ".mv.db"; }

    /* ───────── 扫描前清理 ───────── */

    /** 每次 /scan 前清理 H2 残留锁文件 */
    private static void cleanupH2Locks(String projectId) {
        String base = baseDbDir + "/" + projectId;
        for (String ext : new String[]{".lock.db", ".trace.db"}) {
            File f = new File(base + ext);
            if (f.exists()) { f.delete(); log("Cleaned stale: " + f.getName()); }
        }
    }

    /* ───────── JAR 文件计数 ───────── */

    /** 统计 inputDirs 中的 .jar/.class 文件数，支持 maxJars 上限 */
    private static List<String> resolveJarFiles(List<String> dirs, int maxJars) {
        List<String> result = new ArrayList<>();
        int count = 0;
        for (String dir : dirs) {
            File f = new File(dir);
            if (f.isFile() && (f.getName().endsWith(".jar") || f.getName().endsWith(".class"))) {
                result.add(dir);
                count++;
                if (maxJars > 0 && count >= maxJars) break;
            } else if (f.isDirectory()) {
                File[] files = f.listFiles();
                if (files == null) continue;
                for (File child : files) {
                    if (maxJars > 0 && count >= maxJars) break;
                    if (child.isFile() && (child.getName().endsWith(".jar") || child.getName().endsWith(".class"))) {
                        result.add(child.getAbsolutePath());
                        count++;
                    }
                }
            }
            if (maxJars > 0 && count >= maxJars) break;
        }
        return result;
    }

    /* ───────── 超时后强制关闭 JACG ───────── */

    /** 反射调用 AbstractRunner 的 closeDs 关闭 Druid 连接池 */
    private static void forceCloseRunner(Object runner) {
        if (runner == null) return;
        try {
            java.lang.reflect.Field dbOpField = runner.getClass().getSuperclass().getDeclaredField("dbOperator");
            dbOpField.setAccessible(true);
            Object dbOp = dbOpField.get(runner);
            if (dbOp != null) {
                java.lang.reflect.Method closeDs = dbOp.getClass().getMethod("closeDs", Object.class);
                closeDs.invoke(dbOp, runner);
                log("Forced close JACG datasource");
            }
        } catch (Exception e) {
            log("forceCloseRunner error: " + e);
        }
    }

    /* ───────── 端点处理 ───────── */

    private static void handleHealth(HttpExchange ex) throws IOException {
        ok(ex, "{\"ok\":true}");
    }

    private static void handleStatus(HttpExchange ex) throws IOException {
        String pid = currentProjectId.isEmpty() ? "" : currentProjectId;
        boolean dbExists = !pid.isEmpty() && new File(projectDbFile(pid)).exists();
        JsonObject o = new JsonObject();
        o.addProperty("scanned", scanned && dbExists);
        o.addProperty("baseDbDir", baseDbDir);
        o.addProperty("projectId", currentProjectId);
        JsonArray dirs = new JsonArray();
        synchronized (inputDirs) { for (String d : inputDirs) dirs.add(d); }
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
                for (int i = 0; i < arr.size(); i++) inputDirs.add(arr.get(i).getAsString());
            }
        }
        if (inputDirs.isEmpty()) { error(ex, 400, "no input directories set"); return; }

        // 读取控制参数
        int maxJars = intParam(body, "maxJars", 0);
        if (maxJars > 5000) maxJars = 5000;
        int scanTimeoutSec = intParam(body, "scanTimeout", 600);
        int threads = intParam(body, "threads", 2);
        if (threads < 1) threads = 1;
        if (threads > 16) threads = 16;

        long startMs = System.currentTimeMillis();
        cleanupH2Locks(projectId);
        currentProjectId = projectId;

        // 解析 JAR 文件列表（含上限控制）
        List<String> resolvedDirs = resolveJarFiles(inputDirs, maxJars);
        if (resolvedDirs.isEmpty()) { error(ex, 400, "no jar/class files found in input directories"); return; }
        log("Scan project=" + projectId + " files=" + resolvedDirs.size()
            + " timeout=" + scanTimeoutSec + "s threads=" + threads + " maxJars=" + maxJars);

        emitProgress("preparing", "Found " + resolvedDirs.size() + " files to scan");
        new File(pOutDir).mkdirs();

        JavaCG2ConfigureWrapper cg2Cw = new JavaCG2ConfigureWrapper(true);
        cg2Cw.setOtherConfigList(JavaCG2OtherConfigFileUseListEnum.OCFULE_JAR_DIR, resolvedDirs);
        ConfigureWrapper cw = new ConfigureWrapper(true);
        cw.setMainConfig(ConfigKeyEnum.CKE_SKIP_WRITE_DB_WHEN_JAR_NOT_MODIFIED, "false");
        cw.setMainConfig(ConfigKeyEnum.CKE_APP_NAME, projectId);
        cw.setMainConfig(ConfigKeyEnum.CKE_OUTPUT_DIR_NAME, pOutDir + "/output");
        cw.setMainConfig(ConfigKeyEnum.CKE_THREAD_NUM, String.valueOf(threads));
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_USE_H2, Boolean.TRUE.toString());
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_H2_FILE_PATH, pDbPath);

        emitProgress("scanning", "Parsing bytecode...");

        try {
            Future<Boolean> future = scanExecutor.submit(() -> {
                RunnerWriteDb runner = new RunnerWriteDb(cg2Cw, cw);
                runningRunner = runner;
                try {
                    return runner.run();
                } finally {
                    runningRunner = null;
                }
            });

            boolean ok;
            boolean timedOut = false;
            try {
                ok = future.get(scanTimeoutSec, TimeUnit.SECONDS);
            } catch (TimeoutException te) {
                timedOut = true;
                ok = false;
                log("Scan TIMEOUT after " + scanTimeoutSec + "s, forcing cleanup");
                future.cancel(true);
                forceCloseRunner(runningRunner);
                cleanupH2Locks(projectId);
            }

            long elapsedMs = System.currentTimeMillis() - startMs;

            if (ok) {
                scanned = true;
                lastConfig = cw;
                JsonObject resp = new JsonObject();
                resp.addProperty("ok", true);
                resp.addProperty("status", "ok");
                resp.addProperty("phase", "scan");
                resp.addProperty("fileCount", resolvedDirs.size());
                resp.addProperty("elapsedMs", elapsedMs);
                emitProgress("complete", "Scan complete (" + elapsedMs + "ms)");
                ok(ex, GSON.toJson(resp));
            } else {
                String status = timedOut ? "timeout" : "failed";
                emitProgress("error", "Scan " + status);
                JsonObject resp = new JsonObject();
                resp.addProperty("ok", false);
                resp.addProperty("status", status);
                resp.addProperty("fileCount", resolvedDirs.size());
                resp.addProperty("elapsedMs", elapsedMs);
                resp.addProperty("error", "scan " + status + " after " + elapsedMs + "ms");
                ok(ex, GSON.toJson(resp));
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

        if (!new File(pDbFile).exists()) {
            error(ex, 400, "project " + projectId + " has no database. Run /scan first.");
            return;
        }

        String cmd = body.has("cmd") ? body.get("cmd").getAsString() : "";
        currentProjectId = projectId;
        long startMs = System.currentTimeMillis();

        ConfigureWrapper cw = new ConfigureWrapper(true);
        cw.setMainConfig(ConfigKeyEnum.CKE_APP_NAME, projectId);
        cw.setMainConfig(ConfigKeyEnum.CKE_CALL_GRAPH_RETURN_IN_MEMORY, "true");
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_USE_H2, Boolean.TRUE.toString());
        cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_H2_FILE_PATH, pDbPath);

        String filterClass = body.has("className") ? body.get("className").getAsString() : "";
        String filterMethod = body.has("methodName") ? body.get("methodName").getAsString() : "";
        Set<String> filterClasses = queryClassNames(pDbPath, projectId, filterClass);
        if (!filterClasses.isEmpty()) {
            cw.setOtherConfigSet(OtherConfigFileUseSetEnum.OCFUSE_METHOD_CLASS_4CALLER, filterClasses);
        }
        int queryTimeoutSec = intParam(body, "queryTimeout", 60);

        java.util.function.Predicate<String> keyFilter = key -> {
            if (!filterClasses.isEmpty()) {
                int ci = key.indexOf(':');
                if (ci < 0) return false;
                if (!filterClasses.contains(key.substring(0, ci))) return false;
            }
            if (!filterMethod.isEmpty()) {
                int ci = key.indexOf(':');
                if (ci < 0) return false;
                String mp = key.substring(ci + 1);
                if (!mp.startsWith(filterMethod + "(")) return false;
            }
            return true;
        };

        JsonObject result = new JsonObject();
        result.addProperty("cmd", cmd);

        try {
            switch (cmd) {
                case "callers": {
                    executeQueryWithTimeout(cw, c -> {
                        RunnerGenAllGraph4Caller r = new RunnerGenAllGraph4Caller(c);
                        r.run();
                        return r.getAllMethodCallLineData4ErMap();
                    }, result, "data", queryTimeoutSec, startMs,
                    data -> callerMapToJson(filterMap((Map<String, List<MethodCallLineData4Er>>) data, keyFilter)));
                    break;
                }
                case "callees": {
                    executeQueryWithTimeout(cw, c -> {
                        RunnerGenAllGraph4Callee r = new RunnerGenAllGraph4Callee(c);
                        r.run();
                        return r.getAllMethodCallLineData4EeMap();
                    }, result, "data", queryTimeoutSec, startMs,
                    data -> calleeMapToJson(filterMap((Map<String, List<MethodCallLineData4Ee>>) data, keyFilter)));
                    break;
                }
                case "methodList": {
                    executeQueryWithTimeout(cw, c -> {
                        RunnerGenAllGraph4Caller r = new RunnerGenAllGraph4Caller(c);
                        r.run();
                        Map<String, List<MethodCallLineData4Er>> all = r.getAllMethodCallLineData4ErMap();
                        JsonArray methods = new JsonArray();
                        if (all != null) all.keySet().stream().filter(keyFilter).forEach(methods::add);
                        return methods;
                    }, result, "methods", queryTimeoutSec, startMs, null);
                    break;
                }
                case "findPath": {
                    String keyword = body.has("keyword") ? body.get("keyword").getAsString() : "";
                    FindCallStackTrace fst = new FindCallStackTrace(false, cw);
                    CallStackFileResult fsr = fst.find();
                    JsonArray paths = new JsonArray();
                    if (fsr.isSuccess() && fsr.getStackFilePathList() != null) {
                        for (String fp : fsr.getStackFilePathList()) {
                            try {
                                String content = new String(Files.readAllBytes(Paths.get(fp)), StandardCharsets.UTF_8);
                                if (keyword.isEmpty() || content.contains(keyword)) paths.add(content);
                            } catch (IOException ignored) {}
                        }
                    }
                    result.add("paths", paths);
                    long elapsed = System.currentTimeMillis() - startMs;
                    result.addProperty("elapsedMs", elapsed);
                    ok(ex, GSON.toJson(result));
                    return;
                }
                default:
                    error(ex, 400, "unknown cmd: " + cmd); return;
            }
            result.addProperty("elapsedMs", System.currentTimeMillis() - startMs);
            ok(ex, GSON.toJson(result));
        } catch (Throwable e) {
            result.addProperty("elapsedMs", System.currentTimeMillis() - startMs);
            log("query error: " + e);
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            e.printStackTrace(pw);
            log("query stacktrace: " + sw);
            error(ex, 500, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> void executeQueryWithTimeout(ConfigureWrapper cw, QueryRunner<T> runner,
            JsonObject result, String resultKey, int timeoutSec, long startMs, ResultMapper<T> mapper) {
        try {
            Future<T> future = scanExecutor.submit(() -> runner.run(cw));
            T data;
            try {
                data = future.get(timeoutSec, TimeUnit.SECONDS);
            } catch (TimeoutException te) {
                future.cancel(true);
                result.addProperty("status", "timeout");
                result.addProperty("elapsedMs", System.currentTimeMillis() - startMs);
                result.add(resultKey, new JsonArray());
                return;
            }
            if (mapper != null) {
                result.add(resultKey, mapper.map(data));
            } else {
                result.add(resultKey, (JsonArray) data);
            }
        } catch (Exception e) {
            log("query runner error: " + e);
            result.add(resultKey, new JsonArray());
        }
    }

    @FunctionalInterface interface QueryRunner<T> { T run(ConfigureWrapper cw) throws Exception; }
    @FunctionalInterface interface ResultMapper<T> { JsonArray map(T data); }

    /* ───────── 清理 ───────── */

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

        deleteDir(outDir);
        boolean dbDeleted = !dbFile.exists() || dbFile.delete();
        if (!dbDeleted && dbFile.exists()) {
            try { Thread.sleep(100); } catch (InterruptedException ignored) {}
            dbDeleted = dbFile.delete();
        }
        boolean outDeleted = !outDir.exists() || deleteDir(outDir);

        if (outDeleted && dbDeleted) {
            if (projectId.equals(currentProjectId)) { scanned = false; lastConfig = null; }
            String freed = formatSize(sizeBefore);
            log("Cleaned project " + projectId + " freed " + freed);
            JsonObject o = new JsonObject();
            o.addProperty("ok", true); o.addProperty("freed", freed); o.addProperty("projectId", projectId);
            ok(ex, GSON.toJson(o));
        } else {
            log("Clean failed for " + projectId);
            error(ex, 500, "failed to clean project " + projectId);
        }
    }

    private static void handleCleanAll(HttpExchange ex) throws IOException {
        File dir = new File(baseDbDir);
        long sizeBefore = dirSize(dir);
        if (deleteDir(dir)) {
            scanned = false; lastConfig = null; currentProjectId = "";
            String freed = formatSize(sizeBefore);
            log("Cleaned all projects, freed " + freed);
            JsonObject o = new JsonObject();
            o.addProperty("ok", true); o.addProperty("freed", freed);
            ok(ex, GSON.toJson(o));
        } else { error(ex, 500, "failed to clean all caches"); }
    }

    /* ───────── JSON 工具 ───────── */

    private static <V> Map<String, V> filterMap(Map<String, V> map, java.util.function.Predicate<String> filter) {
        if (map == null) return new LinkedHashMap<>();
        Map<String, V> result = new LinkedHashMap<>();
        for (Map.Entry<String, V> e : map.entrySet()) {
            if (filter.test(e.getKey())) result.put(e.getKey(), e.getValue());
        }
        return result;
    }

    private static JsonArray callerMapToJson(Map<String, List<MethodCallLineData4Er>> data) {
        JsonArray arr = new JsonArray(); int count = 0;
        for (Map.Entry<String, List<MethodCallLineData4Er>> e : data.entrySet()) {
            if (count++ > 200) { arr.add("[truncated]"); break; }
            JsonObject node = new JsonObject(); node.addProperty("caller", e.getKey());
            JsonArray callees = new JsonArray();
            if (e.getValue() != null) for (MethodCallLineData4Er mc : e.getValue()) callees.add(mc.getActualFullMethod());
            node.add("callees", callees); arr.add(node);
        }
        return arr;
    }

    private static JsonArray calleeMapToJson(Map<String, List<MethodCallLineData4Ee>> data) {
        JsonArray arr = new JsonArray(); int count = 0;
        for (Map.Entry<String, List<MethodCallLineData4Ee>> e : data.entrySet()) {
            if (count++ > 200) { arr.add("[truncated]"); break; }
            JsonObject node = new JsonObject(); node.addProperty("callee", e.getKey());
            JsonArray callers = new JsonArray();
            if (e.getValue() != null) for (MethodCallLineData4Ee mc : e.getValue()) callers.add(mc.getActualFullMethod());
            node.add("callers", callers); arr.add(node);
        }
        return arr;
    }

    private static Set<String> queryClassNames(String dbPath, String projectId, String filterClass) {
        Set<String> classes = new HashSet<>();
        String table = "\"jacg_method_info_" + projectId + "\"";
        try {
            Class.forName("org.h2.Driver");
            try (Connection conn = DriverManager.getConnection("jdbc:h2:file:" + dbPath);
                 Statement st = conn.createStatement()) {
                conn.setSchema("jacg");
                String cond = filterClass.isEmpty() ? "" : " WHERE \"full_method\" LIKE '" + filterClass + "%'";
                try (ResultSet rs = st.executeQuery("SELECT \"full_method\" FROM " + table + cond)) {
                    while (rs.next()) {
                        String fm = rs.getString(1); if (fm == null) continue;
                        int ci = fm.indexOf(':'); classes.add(ci > 0 ? fm.substring(0, ci) : fm);
                    }
                }
            }
        } catch (Exception e) { log("queryClassNames error: " + e); }
        return classes;
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
        ex.getResponseBody().write(b); ex.close();
    }

    private static void error(HttpExchange ex, int code, String msg) throws IOException {
        JsonObject o = new JsonObject(); o.addProperty("error", msg);
        ok(ex, GSON.toJson(o));
    }

    /* ───────── 工具 ───────── */

    static void emitProgress(String phase, String message) {
        JsonObject p = new JsonObject();
        p.addProperty("type", "progress");
        p.addProperty("phase", phase); p.addProperty("message", message);
        p.addProperty("timestamp", System.currentTimeMillis());
        System.out.println(GSON.toJson(p)); System.out.flush();
    }

    static boolean deleteDir(File dir) {
        if (!dir.exists()) return true;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) deleteDir(f);
                else if (!f.delete() && f.exists()) {
                    log("Failed to delete: " + f.getAbsolutePath());
                    try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                    if (!f.delete() && f.exists()) log("Retry also failed: " + f.getAbsolutePath());
                }
            }
        }
        return dir.delete();
    }

    static long dirSize(File dir) {
        if (!dir.exists()) return 0;
        long size = 0; File[] files = dir.listFiles();
        if (files != null) { for (File f : files) { if (f.isDirectory()) size += dirSize(f); else size += f.length(); } }
        return size;
    }

    static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        return String.format("%.1f MB", bytes / (1024.0 * 1024));
    }

    static void log(String s) { System.err.println("[jacg-sidecar] " + s); }
}
