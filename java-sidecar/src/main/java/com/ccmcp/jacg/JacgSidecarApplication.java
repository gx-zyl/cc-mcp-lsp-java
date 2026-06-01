package com.ccmcp.jacg;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.ccmcp.jacg.config.JacgProperties;

/**
 * CC MCP LSP Java 侧车 — Spring Boot 启动类
 *
 * 基于 java-all-call-graph 的调用图分析服务，通过 Spring AI MCP 暴露标准 MCP 协议。
 * MCP 端点：POST /mcp/sse（Streamable HTTP 传输）
 * 健康检查：GET /actuator/health
 */
@SpringBootApplication
@EnableConfigurationProperties(JacgProperties.class)
public class JacgSidecarApplication {

    public static void main(String[] args) {
        SpringApplication.run(JacgSidecarApplication.class, args);
    }
}
