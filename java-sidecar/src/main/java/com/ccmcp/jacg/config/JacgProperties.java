package com.ccmcp.jacg.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JACG 侧车配置属性
 *
 * 绑定 application.yml 中的 jacg.* 配置项。
 * yml 结构:
 *   jacg:
 *     db.base-dir: ...
 *     scan.max-jars: 3
 *     scan.default-timeout: 600
 *     scan.max-threads: 2
 */
@ConfigurationProperties(prefix = "jacg")
public class JacgProperties {

    /**
     * H2 数据库配置
     */
    private DbConfig db = new DbConfig();

    /**
     * 扫描配置
     */
    private ScanConfig scan = new ScanConfig();

    public DbConfig getDb() { return db; }
    public void setDb(DbConfig db) { this.db = db; }
    public ScanConfig getScan() { return scan; }
    public void setScan(ScanConfig scan) { this.scan = scan; }

    /**
     * H2 数据库配置
     */
    public static class DbConfig {
        /** H2 数据库基础目录 */
        private String baseDir = System.getProperty("user.home") + "/.cc-mcp-lsp-java/jacg";

        public String getBaseDir() { return baseDir; }
        public void setBaseDir(String baseDir) { this.baseDir = baseDir; }
    }

    /**
     * 扫描配置
     */
    public static class ScanConfig {
        /** 扫描默认超时时间（秒） */
        private int defaultTimeout = 600;

        /** 最大并行线程数 */
        private int maxThreads = 2;

        /** 最大 JAR 数上限（0 不限制，默认 3） */
        private int maxJars = 3;

        public int getDefaultTimeout() { return defaultTimeout; }
        public void setDefaultTimeout(int defaultTimeout) { this.defaultTimeout = defaultTimeout; }

        public int getMaxThreads() { return maxThreads; }
        public void setMaxThreads(int maxThreads) { this.maxThreads = maxThreads; }

        public int getMaxJars() { return maxJars; }
        public void setMaxJars(int maxJars) { this.maxJars = maxJars; }
    }
}
