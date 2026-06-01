package com.ccmcp.jacg.db;

import com.ccmcp.jacg.config.JacgProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

/**
 * H2 数据库文件管理器
 *
 * 管理 JACG 分析生成的 H2 数据库文件：路径解析、存在性检查、清理。
 */
@Component
public class H2Manager {

    private static final Logger log = LoggerFactory.getLogger(H2Manager.class);

    private final JacgProperties properties;

    public H2Manager(JacgProperties properties) {
        this.properties = properties;
    }

    /**
     * 获取基础数据库目录
     */
    public String getBaseDbDir() {
        return properties.getDb().getBaseDir();
    }

    /**
     * 获取项目数据库文件路径（不含扩展名）
     */
    public String projectDbPath(String projectId) {
        return getBaseDbDir() + "/" + projectId;
    }

    /**
     * 获取项目数据库文件路径（含 .mv.db 扩展名）
     */
    public String projectDbFile(String projectId) {
        return getBaseDbDir() + "/" + projectId + ".mv.db";
    }

    /**
     * 获取项目输出目录
     */
    public String projectOutDir(String projectId) {
        return getBaseDbDir() + "/" + projectId;
    }

    /**
     * 检查项目数据库是否存在
     */
    public boolean projectExists(String projectId) {
        return new File(projectDbFile(projectId)).exists();
    }

    /**
     * 获取数据库文件大小
     */
    public long getDbFileSize(String projectId) {
        File dbFile = new File(projectDbFile(projectId));
        return dbFile.exists() ? dbFile.length() : 0;
    }

    /**
     * 获取数据库文件信息（一次 stat 返回存在性和大小）
     */
    public java.util.AbstractMap.SimpleEntry<Boolean, Long> getDbFileInfo(String projectId) {
        File dbFile = new File(projectDbFile(projectId));
        boolean exists = dbFile.exists();
        return new java.util.AbstractMap.SimpleEntry<>(exists, exists ? dbFile.length() : 0L);
    }

    /**
     * 清理 H2 残留锁文件
     */
    public void cleanupH2Locks(String projectId) {
        String base = getBaseDbDir() + "/" + projectId;
        for (String ext : new String[]{".lock.db", ".trace.db"}) {
            File f = new File(base + ext);
            if (f.exists()) {
                if (f.delete()) {
                    log.info("Cleaned stale lock file: {}", f.getName());
                } else {
                    log.warn("Failed to delete lock file: {}", f.getName());
                }
            }
        }
    }

    /**
     * 清理单项目的 H2 数据库和输出目录
     *
     * @return 释放的空间大小（字节），或 -1 表示失败
     */
    public long cleanProject(String projectId) {
        String pDbFile = projectDbFile(projectId);
        String pOutDir = projectOutDir(projectId);

        File outDir = new File(pOutDir);
        File dbFile = new File(pDbFile);

        long sizeBefore = 0;
        sizeBefore += dirSize(outDir);
        sizeBefore += dbFile.exists() ? dbFile.length() : 0;

        boolean outDeleted = deleteDir(outDir);
        boolean dbDeleted = !dbFile.exists() || deleteWithRetry(dbFile);

        if (outDeleted && dbDeleted) {
            log.info("Cleaned project {}, freed {}", projectId, formatSize(sizeBefore));
            return sizeBefore;
        }
        log.warn("Clean failed for project {}", projectId);
        return -1;
    }

    /**
     * 清理所有项目的数据库
     *
     * @return 释放的空间大小（字节），或 -1 表示失败
     */
    public long cleanAll() {
        File dir = new File(getBaseDbDir());
        long sizeBefore = dirSize(dir);
        if (deleteDir(dir)) {
            log.info("Cleaned all projects, freed {}", formatSize(sizeBefore));
            return sizeBefore;
        }
        log.warn("Clean all failed");
        return -1;
    }

    /**
     * 格式化字节数为可读字符串
     */
    public static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024));
        return String.format("%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }

    private static boolean deleteDir(File dir) {
        if (!dir.exists()) return true;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) {
                    deleteDir(f);
                } else {
                    deleteWithRetry(f);
                }
            }
        }
        return dir.delete();
    }

    private static boolean deleteWithRetry(File f) {
        if (!f.exists()) return true;
        if (f.delete()) return true;
        try {
            Thread.sleep(100);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return f.delete();
    }

    private static long dirSize(File dir) {
        if (!dir.exists()) return 0;
        try (Stream<Path> paths = Files.walk(Paths.get(dir.toURI()))) {
            return paths.filter(p -> p.toFile().isFile())
                    .mapToLong(p -> p.toFile().length())
                    .sum();
        } catch (IOException e) {
            return 0;
        }
    }
}
