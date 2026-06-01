package com.ccmcp.jacg.mcp.tool;

import com.ccmcp.jacg.model.ScanState;
import com.ccmcp.jacg.scanner.JacgScanner;
import com.ccmcp.jacg.scanner.ScanManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * MCP 工具：扫描项目字节码（异步）
 *
 * 立即返回 execId，进度通过 SSE /scan/progress/{execId} 推送。
 */
@Component
public class ScanProjectTool {

    private static final Logger log = LoggerFactory.getLogger(ScanProjectTool.class);

    private final JacgScanner scanner;
    private final ScanManager scanManager;

    public ScanProjectTool(JacgScanner scanner, ScanManager scanManager) {
        this.scanner = scanner;
        this.scanManager = scanManager;
    }

    @McpTool(name = "scan_project", description = "扫描项目的字节码/JAR 文件，构建调用关系数据库。异步执行，返回 execId，通过 SSE /scan/progress/{execId} 接收进度")
    public String scanProject(
            @McpToolParam(description = "项目 ID") String projectId,
            @McpToolParam(description = "待扫描的目录或 JAR 路径列表") List<String> inputDirs,
            @McpToolParam(required = false, description = "最大处理的 JAR/class 文件数（0 不限制，默认 3）") Integer maxJars,
            @McpToolParam(required = false, description = "超时秒数（默认 600）") Integer scanTimeout,
            @McpToolParam(required = false, description = "并行线程数（默认 2）") Integer threads
    ) {
        if (projectId == null || projectId.isBlank()) {
            return "{\"success\":false,\"error\":\"projectId is required\"}";
        }
        if (inputDirs == null || inputDirs.isEmpty()) {
            return "{\"success\":false,\"error\":\"inputDirs is required\"}";
        }

        // 解析文件数用于进度显示
        List<String> files = JacgScanner.resolveJarFiles(inputDirs, maxJars != null ? maxJars : 3);
        int fileCount = files.size();

        // 创建扫描任务（含重复检测）
        String execId = scanManager.createScan(projectId, fileCount);
        if (execId == null) {
            return "{\"success\":false,\"error\":\"scan already running for this project\"}";
        }

        log.info("scan_project: projectId={}, dirs={}, execId={}", projectId, inputDirs.size(), execId);

        // 异步执行扫描（ScanManager 的 progressCallback 负责推送 SSE）
        scanner.scanAsync(projectId, inputDirs, maxJars, scanTimeout, threads,
                scanManager.progressCallback(execId));

        return String.format(
                "{\"success\":true,\"execId\":\"%s\",\"status\":\"running\",\"fileCount\":%d}",
                execId, fileCount);
    }
}
