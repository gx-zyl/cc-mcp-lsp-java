package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.db.H2Manager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.stereotype.Component;

/**
 * MCP 工具：清理所有项目的缓存
 */
@Component
public class CleanAllCacheTool {

    private static final Logger log = LoggerFactory.getLogger(CleanAllCacheTool.class);

    private final H2Manager h2Manager;

    public CleanAllCacheTool(H2Manager h2Manager) {
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "clean_all", description = "清理所有项目的 H2 数据库文件和输出目录，释放全部磁盘空间")
    public String cleanAll() {
        try {
            long freed = h2Manager.cleanAll();
            if (freed >= 0) {
                return "{\"success\":true,\"freed\":\"" + H2Manager.formatSize(freed) + "\"}";
            }
            return "{\"success\":false,\"error\":\"清理全部缓存失败\"}";
        } catch (Exception e) {
            log.error("clean_all error: {}", e.getMessage());
            return "{\"success\":false,\"error\":\"" + QueryCallersTool.jsonEscape(e.getMessage()) + "\"}";
        }
    }
}
