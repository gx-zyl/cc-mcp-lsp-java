package com.ccmcp.jacg;

import com.adrninistrator.jacg.conf.ConfigureWrapper;
import com.adrninistrator.jacg.conf.enums.ConfigKeyEnum;
import com.adrninistrator.jacg.conf.enums.OtherConfigFileUseListEnum;
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
import java.util.*;
import java.util.stream.Collectors;

/**
 * java-all-call-graph 侧车进程
 * 本地 HTTP JSON-RPC 接口，供 VS Code 扩展调用。
 *
 * 端点：
 *   POST /scan      — 阶段1：解析字节码 → H2
 *   POST /query      — 阶段2：查询调用图
 *   GET  /status     — 当前状态
 *   GET  /health     — 存活检查
 */
public class SidecarMain {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static volatile String inputDir;
    private static volatile String dbDir;
    private static volatile boolean scanned;
    private static volatile ConfigureWrapper lastConfig;

    public static void main(String[] args) throws Exception {
        int port = 38766;
        dbDir = System.getProperty("user.home") + "/.cc-mcp-lsp-java/jacg";

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port": port = Integer.parseInt(args[++i]); break;
                case "--db-dir": dbDir = args[++i]; break;
                case "--input": inputDir = args[++i]; break;
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/health", SidecarMain::handleHealth);
        server.createContext("/status", SidecarMain::handleStatus);
        server.createContext("/scan", SidecarMain::handleScan);
        server.createContext("/query", SidecarMain::handleQuery);
        server.setExecutor(null);
        server.start();

        log("Sidecar on http://127.0.0.1:" + port + " db:" + dbDir);
    }

    /* ───────── 请求处理 ───────── */

    private static void handleHealth(HttpExchange ex) throws IOException {
        ok(ex, "{\"ok\":true}");
    }

    private static void handleStatus(HttpExchange ex) throws IOException {
        JsonObject o = new JsonObject();
        o.addProperty("scanned", scanned);
        o.addProperty("dbDir", dbDir);
        o.addProperty("inputDir", inputDir != null ? inputDir : "");
        ok(ex, GSON.toJson(o));
    }

    private static void handleScan(HttpExchange ex) throws IOException {
        JsonObject body = parseBody(ex);
        if (body.has("input")) inputDir = body.get("input").getAsString();
        if (body.has("dbDir")) { dbDir = body.get("dbDir").getAsString(); }

        if (inputDir == null) { error(ex, 400, "input directory not set"); return; }

        try {
            new File(dbDir).mkdirs();
            log("Phase 1 scan: " + inputDir + " db: " + dbDir);

            JavaCG2ConfigureWrapper cg2Cw = new JavaCG2ConfigureWrapper(true);
            cg2Cw.setOtherConfigList(JavaCG2OtherConfigFileUseListEnum.OCFULE_JAR_DIR, Collections.singletonList(inputDir));
            ConfigureWrapper cw = new ConfigureWrapper(true);
            cw.setMainConfig(ConfigKeyEnum.CKE_SKIP_WRITE_DB_WHEN_JAR_NOT_MODIFIED, "true");
            cw.setMainConfig(ConfigKeyEnum.CKE_APP_NAME, "cc-mcp-lsp-java");
            cw.setMainConfig(ConfigKeyEnum.CKE_OUTPUT_DIR_NAME, dbDir + "/output");

            RunnerWriteDb runner = new RunnerWriteDb(cg2Cw, cw);
            boolean ok = runner.run();

            if (ok) {
                scanned = true;
                lastConfig = cw;
                ok(ex, "{\"ok\":true,\"phase\":\"scan\"}");
                log("scan complete");
            } else {
                error(ex, 500, "scan failed");
            }
        } catch (Exception e) {
            log("scan error: " + e);
            error(ex, 500, e.getMessage());
        }
    }

    private static void handleQuery(HttpExchange ex) throws IOException {
        if (!scanned) { error(ex, 400, "not scanned yet"); return; }

        JsonObject body = parseBody(ex);
        String cmd = body.has("cmd") ? body.get("cmd").getAsString() : "";

        ConfigureWrapper cw = new ConfigureWrapper(true);
        cw.setMainConfig(ConfigKeyEnum.CKE_CALL_GRAPH_RETURN_IN_MEMORY, "true");
        // 复用数据库路径（通过系统属性或默认配置）

        JsonObject result = new JsonObject();
        result.addProperty("cmd", cmd);

        try {
            switch (cmd) {
                case "callers": {
                    RunnerGenAllGraph4Caller runner = new RunnerGenAllGraph4Caller(cw);
                    runner.run();
                    Map<String, List<MethodCallLineData4Er>> data = runner.getAllMethodCallLineData4ErMap();
                    result.add("data", callerMapToJson(data));
                    break;
                }
                case "callees": {
                    RunnerGenAllGraph4Callee runner = new RunnerGenAllGraph4Callee(cw);
                    runner.run();
                    Map<String, List<MethodCallLineData4Ee>> data = runner.getAllMethodCallLineData4EeMap();
                    result.add("data", calleeMapToJson(data));
                    break;
                }
                case "methodList": {
                    RunnerGenAllGraph4Caller runner = new RunnerGenAllGraph4Caller(cw);
                    runner.run();
                    Map<String, List<MethodCallLineData4Er>> all = runner.getAllMethodCallLineData4ErMap();
                    JsonArray methods = new JsonArray();
                    for (String s : all.keySet()) methods.add(s);
                    result.add("methods", methods);
                    break;
                }
                case "findPath": {
                    String keyword = body.has("keyword") ? body.get("keyword").getAsString() : "";
                    FindCallStackTrace fst = new FindCallStackTrace(false);
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
        } catch (Exception e) {
            log("query error: " + e);
            error(ex, 500, e.getMessage());
        }
    }

    /* ───────── JSON 工具 ───────── */

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

    static void log(String s) {
        System.err.println("[jacg-sidecar] " + s);
    }
}
