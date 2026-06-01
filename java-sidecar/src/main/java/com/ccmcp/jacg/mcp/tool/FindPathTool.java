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
 * MCP 工具：搜索调用路径
 */
@Component
public class FindPathTool {

    private static final Logger log = LoggerFactory.getLogger(FindPathTool.class);

    private final CallGraphQuerier querier;
    private final H2Manager h2Manager;

    public FindPathTool(CallGraphQuerier querier, H2Manager h2Manager) {
        this.querier = querier;
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "find_path", description = "搜索包含关键词的调用路径，返回匹配的调用链文本")
    public String findPath(
            @McpToolParam(description = "项目 ID") String projectId,
            @McpToolParam(description = "搜索关键词") String keyword) {
        if (projectId == null || !h2Manager.projectExists(projectId)) {
            return "{\"success\":false,\"error\":\"项目不存在或未扫描: " + projectId + "\"}";
        }
        if (keyword == null || keyword.isBlank()) {
            return "{\"success\":false,\"error\":\"keyword is required\"}";
        }
        try {
            List<String> paths = querier.findPath(projectId, h2Manager.projectDbPath(projectId), keyword);
            String pathsJson = paths.stream()
                    .map(p -> "\"" + QueryCallersTool.jsonEscape(p) + "\"")
                    .collect(Collectors.joining(","));
            return "{\"success\":true,\"totalPaths\":" + paths.size() + ",\"paths\":[" + pathsJson + "]}";
        } catch (Exception e) {
            log.error("find_path error: {}", e.getMessage());
            return "{\"success\":false,\"error\":\"" + QueryCallersTool.jsonEscape(e.getMessage()) + "\"}";
        }
    }
}
