package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.model.ScanState;
import com.ccmcp.jacg.scanner.ScanManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

/**
 * MCP 工具：查询扫描进度
 *
 * 配合异步 scan_project 使用，通过 execId 轮询扫描状态。
 */
@Component
public class QueryScanStatusTool {

    private static final Logger log = LoggerFactory.getLogger(QueryScanStatusTool.class);

    private final ScanManager scanManager;

    public QueryScanStatusTool(ScanManager scanManager) {
        this.scanManager = scanManager;
    }

    @McpTool(name = "query_scan_status", description = "通过 execId 查询扫描进度和结果")
    public String queryScanStatus(
            @McpToolParam(description = "scan_project 返回的 execId") String execId) {
        if (execId == null || execId.isBlank()) {
            return "{\"success\":false,\"error\":\"execId is required\"}";
        }
        ScanState state = scanManager.getState(execId);
        if (state == null) {
            return "{\"success\":false,\"error\":\"execId not found\"}";
        }
        return String.format(
                "{\"status\":\"%s\",\"fileCount\":%d,\"elapsedMs\":%d%s}",
                state.getStatus(), state.getFileCount(), state.getElapsedMs(),
                state.getErrorMessage() != null ? ",\"error\":\"" + escapeJson(state.getErrorMessage()) + "\"" : ""
        );
    }

    private static String escapeJson(String s) {
        return QueryCallersTool.jsonEscape(s);
    }
}
