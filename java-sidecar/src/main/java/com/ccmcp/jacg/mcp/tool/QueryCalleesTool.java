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
 * MCP 工具：查询向下调用链
 */
@Component
public class QueryCalleesTool {

    private static final Logger log = LoggerFactory.getLogger(QueryCalleesTool.class);

    private final CallGraphQuerier querier;
    private final H2Manager h2Manager;

    public QueryCalleesTool(CallGraphQuerier querier, H2Manager h2Manager) {
        this.querier = querier;
        this.h2Manager = h2Manager;
    }

    @McpTool(name = "query_callees",
             description = "查询指定方法的向下调用链（它调用了谁）。通过 className/methodName/keyword 过滤结果")
    public String queryCallees(
            @McpToolParam(description = "项目 ID") String projectId,
            @McpToolParam(required = false, description = "按类名过滤（支持前缀匹配）") String className,
            @McpToolParam(required = false, description = "按方法名精确过滤") String methodName,
            @McpToolParam(required = false, description = "在方法名中搜索关键词") String keyword) {
        if (projectId == null || !h2Manager.projectExists(projectId)) {
            return "{\"success\":false,\"error\":\"项目不存在或未扫描: " + projectId + "\"}";
        }
        try {
            List<CallGraphNode> nodes = querier.queryCallees(projectId, h2Manager.projectDbPath(projectId),
                    className, methodName, keyword);
            return QueryCallersTool.toJson(nodes, "callees");
        } catch (Exception e) {
            log.error("query_callees error: {}", e.getMessage());
            return "{\"success\":false,\"error\":\"" + QueryCallersTool.jsonEscape(e.getMessage()) + "\"}";
        }
    }
}
