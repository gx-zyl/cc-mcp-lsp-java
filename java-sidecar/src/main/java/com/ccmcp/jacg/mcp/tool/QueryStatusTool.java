package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.db.H2Manager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

/**
 * MCP 工具：查询项目扫描状态
 */
@Component
public class QueryStatusTool {

    private static final Logger log = LoggerFactory.getLogger(QueryStatusTool.class);

    private final H2Manager h2Manager;

    public QueryStatusTool(H2Manager h2Manager) {
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "query_status", description = "查询项目扫描状态和 H2 数据库信息")
    public String queryStatus(
            @McpToolParam(description = "项目 ID") String projectId) {
        if (projectId == null) {
            return "{\"success\":false,\"error\":\"projectId is required\"}";
        }
        try {
            boolean exists = h2Manager.projectExists(projectId);
            long dbSize = exists ? h2Manager.getDbFileSize(projectId) : 0;
            return String.format(
                    "{\"success\":true,\"scanned\":%b,\"dbDir\":\"%s\",\"dbFileSize\":%d,\"projectId\":\"%s\"}",
                    exists, h2Manager.projectDbPath(projectId), dbSize, projectId
            );
        } catch (Exception e) {
            log.error("query_status error: {}", e.getMessage());
            return "{\"success\":false,\"error\":\"" + QueryCallersTool.jsonEscape(e.getMessage()) + "\"}";
        }
    }
}
