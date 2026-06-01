package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.db.H2Manager;
import com.ccmcp.jacg.model.CallGraphNode;
import com.ccmcp.jacg.query.CallGraphQuerier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * MCP 工具：查询向上调用链
 */
@Component
public class QueryCallersTool {

    private static final Logger log = LoggerFactory.getLogger(QueryCallersTool.class);
    private static final String ERROR_PREFIX = "{\"success\":false,\"error\":\"";

    private final CallGraphQuerier querier;
    private final H2Manager h2Manager;

    public QueryCallersTool(CallGraphQuerier querier, H2Manager h2Manager) {
        this.querier = querier;
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "query_callers",
             description = "查询指定方法的向上调用链（谁调用了它）。通过 className/methodName/keyword 过滤结果")
    public String queryCallers(
            @McpToolParam(description = "项目 ID") String projectId,
            @McpToolParam(required = false, description = "按类名过滤（支持前缀匹配）") String className,
            @McpToolParam(required = false, description = "按方法名精确过滤") String methodName,
            @McpToolParam(required = false, description = "在方法名中搜索关键词") String keyword) {
        if (projectId == null || !h2Manager.projectExists(projectId)) {
            return ERROR_PREFIX + "项目不存在或未扫描: " + projectId + "\"}";
        }
        try {
            List<CallGraphNode> nodes = querier.queryCallers(projectId, h2Manager.projectDbPath(projectId),
                    className, methodName, keyword);
            return toJson(nodes, "callers");
        } catch (Exception e) {
            log.error("query_callers error: {}", e.getMessage());
            return ERROR_PREFIX + e.getMessage() + "\"}";
        }
    }

    static String toJson(List<CallGraphNode> nodes, String key) {
        StringBuilder sb = new StringBuilder("{\"success\":true,\"command\":\"")
                .append(key).append("\",\"totalNodes\":").append(nodes.size()).append(",\"nodes\":[");
        for (int i = 0; i < nodes.size(); i++) {
            if (i > 0) sb.append(",");
            CallGraphNode n = nodes.get(i);
            sb.append("{\"method\":\"").append(jsonEscape(n.getMethod())).append("\",\"")
                    .append(key.equals("callers") ? "callees" : "callers").append("\":[");
            List<String> related = n.getRelated();
            for (int j = 0; j < related.size(); j++) {
                if (j > 0) sb.append(",");
                sb.append("\"").append(jsonEscape(related.get(j))).append("\"");
            }
            sb.append("]}");
        }
        sb.append("]}");
        return sb.toString();
    }

    public static String jsonEscape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
