package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.db.H2Manager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

/**
 * MCP 工具：清理指定项目的缓存
 */
@Component
public class CleanCacheTool {

    private static final Logger log = LoggerFactory.getLogger(CleanCacheTool.class);

    private final H2Manager h2Manager;

    public CleanCacheTool(H2Manager h2Manager) {
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "clean_cache", description = "清理指定项目的 H2 数据库文件和输出目录，释放磁盘空间")
    public String cleanCache(
            @McpToolParam(description = "项目 ID") String projectId) {
        if (projectId == null) {
            return "{\"success\":false,\"error\":\"projectId is required\"}";
        }
        try {
            long freed = h2Manager.cleanProject(projectId);
            if (freed >= 0) {
                return "{\"success\":true,\"freed\":\"" + H2Manager.formatSize(freed) + "\",\"projectId\":\"" + projectId + "\"}";
            }
            return "{\"success\":false,\"error\":\"清理项目缓存失败: " + projectId + "\"}";
        } catch (Exception e) {
            log.error("clean_cache error: {}", e.getMessage());
            return "{\"success\":false,\"error\":\"" + QueryCallersTool.jsonEscape(e.getMessage()) + "\"}";
        }
    }
}
