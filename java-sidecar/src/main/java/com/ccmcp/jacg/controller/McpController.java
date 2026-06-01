package com.ccmcp.jacg.controller;

import com.ccmcp.jacg.db.H2Manager;
import com.ccmcp.jacg.query.CallGraphQuerier;
import com.ccmcp.jacg.scanner.JacgScanner;
import com.ccmcp.jacg.scanner.ScanManager;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 手写 MCP JSON-RPC Controller
 *
 * 实现 MCP 协议：initialize、tools/list、tools/call、ping。
 * 和 java-all-call-graph-server 一样的方式 — 不用 Spring AI transport。
 */
@RestController
public class McpController {

    private static final Logger log = LoggerFactory.getLogger(McpController.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private final Map<String, Boolean> sessions = new ConcurrentHashMap<>();

    private final JacgScanner scanner;
    private final ScanManager scanManager;
    private final H2Manager h2Manager;
    private final CallGraphQuerier querier;

    public McpController(JacgScanner scanner, ScanManager scanManager,
                          H2Manager h2Manager, CallGraphQuerier querier) {
        this.scanner = scanner;
        this.scanManager = scanManager;
        this.h2Manager = h2Manager;
        this.querier = querier;
    }

    @PostMapping("/mcp")
    public String handle(@RequestBody String body) {
        try {
            JsonNode r = JSON.readTree(body);
            String method = r.has("method") ? r.get("method").asText() : "";
            JsonNode id = r.get("id");
            JsonNode params = r.get("params");

            switch (method) {
                case "initialize":
                    sessions.put("s1", true);
                    return ok(id, "{\"protocolVersion\":\"2024-11-05\","
                            + "\"serverInfo\":{\"name\":\"cc-jacg-sidecar\",\"version\":\"0.3.0\"},"
                            + "\"capabilities\":{\"tools\":{}}}");
                case "notifications/initialized":
                    return null; // no-op, avoid deadlock
                case "tools/list":
                    return list(id);
                case "tools/call":
                    return call(id, params);
                case "ping":
                    return ok(id, "{}");
                default:
                    return err(id, -32601, "Unknown method: " + method);
            }
        } catch (Exception e) {
            log.error("MCP error: {}", e.getMessage(), e);
            return err(null, -32603, e.getMessage());
        }
    }

    private String list(JsonNode id) throws Exception {
        ArrayNode t = JSON.createArrayNode();
        t.add(td("scan_project", "扫描字节码/JAR，构建调用图数据库"));
        t.add(td("query_scan_status", "查询扫描进度"));
        t.add(td("query_callers", "查询向上调用链"));
        t.add(td("query_callees", "查询向下调用链"));
        t.add(td("list_methods", "列出已分析方法"));
        t.add(td("find_path", "搜索调用路径"));
        t.add(td("query_status", "查询项目状态"));
        t.add(td("clean_cache", "清理项目缓存"));
        t.add(td("clean_all", "清理全部缓存"));
        ObjectNode result = JSON.createObjectNode();
        result.set("tools", t);
        return ok(id, JSON.writeValueAsString(result));
    }

    private ObjectNode td(String name, String desc) {
        ObjectNode t = JSON.createObjectNode();
        t.put("name", name);
        t.put("description", desc);
        t.set("inputSchema", JSON.createObjectNode().put("type", "object"));
        return t;
    }

    private String call(JsonNode id, JsonNode params) throws Exception {
        String name = params != null && params.has("name") ? params.get("name").asText() : "";
        JsonNode args = params != null && params.has("arguments") ? params.get("arguments") : JSON.createObjectNode();
        String result;
        try {
            result = switch (name) {
                case "scan_project" -> scan(args);
                case "query_scan_status" -> qss(args);
                case "query_callers" -> qcallers(args);
                case "query_callees" -> qcallees(args);
                case "list_methods" -> lmethods(args);
                case "find_path" -> fpath(args);
                case "query_status" -> qstatus(args);
                case "clean_cache" -> cclean(args);
                case "clean_all" -> "{\"success\":true}";
                default -> "{\"success\":false,\"error\":\"unknown tool\"}";
            };
        } catch (Exception e) {
            log.error("Tool {} error: {}", name, e.getMessage());
            result = "{\"success\":false,\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
        }
        String escaped = result.replace("\\", "\\\\").replace("\"", "\\\"");
        return ok(id, "{\"content\":[{\"type\":\"text\",\"text\":\"" + escaped + "\"}]}");
    }

    // === Tool implementations ===

    private String scan(JsonNode a) {
        String pid = str(a, "projectId");
        List<String> dirs = a.has("inputDirs")
            ? JSON.convertValue(a.get("inputDirs"), new TypeReference<List<String>>() {})
            : List.of();
        int mj = a.has("maxJars") ? a.get("maxJars").asInt() : 3;
        int to = a.has("scanTimeout") ? a.get("scanTimeout").asInt() : 600;
        int th = a.has("threads") ? a.get("threads").asInt() : 2;
        if (pid == null) return "{\"success\":false,\"error\":\"projectId required\"}";
        if (dirs.isEmpty()) return "{\"success\":false,\"error\":\"inputDirs required\"}";
        List<String> files = JacgScanner.resolveJarFiles(dirs, mj);
        String eid = scanManager.createScan(pid, files.size());
        if (eid == null) return "{\"success\":false,\"error\":\"scan already running\"}";
        scanner.scanAsync(pid, dirs, mj, to, th, scanManager.progressCallback(eid));
        return "{\"success\":true,\"execId\":\"" + eid + "\",\"status\":\"running\",\"fileCount\":" + files.size() + "}";
    }

    private String qss(JsonNode a) {
        String eid = str(a, "execId");
        if (eid == null) return "{\"success\":false,\"error\":\"execId required\"}";
        var s = scanManager.getState(eid);
        if (s == null) return "{\"success\":false,\"error\":\"execId not found\"}";
        // 实时计算已耗时（初始状态的 elapsedMs 只是 snapshot）
        long realElapsed = System.currentTimeMillis() - s.getStartTime();
        String cf = s.getCurrentFile();
        String extra = cf != null ? ",\"currentFile\":\"" + cf + "\"" : "";
        return "{\"status\":\"" + s.getStatus() + "\",\"fileCount\":" + s.getFileCount()
                + ",\"elapsedMs\":" + realElapsed + extra + "}";
    }

    private String qcallers(JsonNode a) throws Exception {
        String pid = str(a, "projectId");
        if (pid == null || !h2Manager.projectExists(pid)) return "{\"success\":false,\"error\":\"project not found\"}";
        var nodes = querier.queryCallers(pid, h2Manager.projectDbPath(pid), str(a,"className"), str(a,"methodName"), null);
        return "{\"success\":true,\"totalNodes\":" + nodes.size() + ",\"nodes\":" + JSON.writeValueAsString(nodes) + "}";
    }

    private String qcallees(JsonNode a) throws Exception {
        String pid = str(a, "projectId");
        if (pid == null || !h2Manager.projectExists(pid)) return "{\"success\":false,\"error\":\"project not found\"}";
        var nodes = querier.queryCallees(pid, h2Manager.projectDbPath(pid), str(a,"className"), str(a,"methodName"), null);
        return "{\"success\":true,\"totalNodes\":" + nodes.size() + ",\"nodes\":" + JSON.writeValueAsString(nodes) + "}";
    }

    private String lmethods(JsonNode a) throws Exception {
        String pid = str(a, "projectId");
        if (pid == null || !h2Manager.projectExists(pid)) return "{\"success\":false,\"error\":\"project not found\"}";
        var methods = querier.listMethods(pid, h2Manager.projectDbPath(pid), str(a,"className"), null);
        return "{\"success\":true,\"totalMethods\":" + methods.size() + ",\"methods\":" + JSON.writeValueAsString(methods) + "}";
    }

    private String fpath(JsonNode a) throws Exception {
        String pid = str(a, "projectId");
        String kw = str(a, "keyword");
        if (pid == null || kw == null) return "{\"success\":false,\"error\":\"projectId and keyword required\"}";
        if (!h2Manager.projectExists(pid)) return "{\"success\":false,\"error\":\"project not found\"}";
        return "{\"success\":true,\"paths\":" + JSON.writeValueAsString(querier.findPath(pid, h2Manager.projectDbPath(pid), kw)) + "}";
    }

    private String qstatus(JsonNode a) {
        String pid = str(a, "projectId");
        if (pid == null) return "{\"success\":false,\"error\":\"projectId required\"}";
        boolean ex = h2Manager.projectExists(pid);
        return "{\"success\":true,\"scanned\":" + ex + ",\"dbFileSize\":" + (ex ? h2Manager.getDbFileSize(pid) : 0) + "}";
    }

    private String cclean(JsonNode a) {
        String pid = str(a, "projectId");
        if (pid == null) return "{\"success\":false,\"error\":\"projectId required\"}";
        long f = h2Manager.cleanProject(pid);
        return "{\"success\":true,\"freed\":\"" + (f >= 0 ? H2Manager.formatSize(f) : "0 B") + "\"}";
    }

    private String str(JsonNode a, String k) { return a.has(k) ? a.get(k).asText() : null; }
    private String ok(JsonNode id, String r) { return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":" + r + "}"; }
    private String err(JsonNode id, int c, String m) {
        String e = "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"error\":{\"code\":" + c + ",\"message\":\"" + m + "\"}}";
        return e;
    }
}
