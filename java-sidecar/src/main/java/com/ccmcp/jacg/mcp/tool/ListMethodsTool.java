package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.db.H2Manager;
import com.ccmcp.jacg.query.CallGraphQuerier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * MCP 工具：列出项目中所有已分析方法
 */
@Component
public class ListMethodsTool {

    private static final Logger log = LoggerFactory.getLogger(ListMethodsTool.class);

    private final CallGraphQuerier querier;
    private final H2Manager h2Manager;

    public ListMethodsTool(CallGraphQuerier querier, H2Manager h2Manager) {
        this.querier = querier;
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "list_methods", description = "列出项目中所有已分析的方法（类名和方法名）")
    public String listMethods(
            @McpToolParam(description = "项目 ID") String projectId,
            @McpToolParam(required = false, description = "按类名过滤（支持前缀匹配）") String className,
            @McpToolParam(required = false, description = "按方法名精确过滤") String methodName) {
        if (projectId == null || !h2Manager.projectExists(projectId)) {
            return "{\"success\":false,\"error\":\"项目不存在或未扫描: " + projectId + "\"}";
        }
        try {
            List<String> methods = querier.listMethods(projectId, h2Manager.projectDbPath(projectId),
                    className, methodName);
            String methodsJson = methods.stream()
                    .map(m -> "\"" + QueryCallersTool.jsonEscape(m) + "\"")
                    .collect(Collectors.joining(","));
            return "{\"success\":true,\"totalMethods\":" + methods.size() + ",\"methods\":[" + methodsJson + "]}";
        } catch (Exception e) {
            log.error("list_methods error: {}", e.getMessage());
            return "{\"success\":false,\"error\":\"" + QueryCallersTool.jsonEscape(e.getMessage()) + "\"}";
        }
    }
}
