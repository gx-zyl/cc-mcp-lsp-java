package com.ccmcp.jacg.model;

/**
 * 扫描执行状态（内存态，非持久化）
 *
 * 用于异步扫描时追踪进度，通过 SSE 推送给客户端。
 */
public class ScanState {

    private final String execId;
    private final String projectId;
    private volatile String status;       // running | complete | timeout | failed
    private volatile int fileCount;
    private volatile long elapsedMs;
    private final long startTime;
    private volatile String errorMessage;
    private volatile String currentFile;   // 当前正在处理的 JAR 文件名

    public ScanState(String execId, String projectId, String status) {
        this.execId = execId;
        this.projectId = projectId;
        this.status = status;
        this.startTime = System.currentTimeMillis();
    }

    public ScanState(String execId, String projectId, String status, int fileCount, long elapsedMs) {
        this(execId, projectId, status);
        this.fileCount = fileCount;
        this.elapsedMs = elapsedMs;
    }

    public String getExecId() { return execId; }
    public String getProjectId() { return projectId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getFileCount() { return fileCount; }
    public void setFileCount(int fileCount) { this.fileCount = fileCount; }
    public long getElapsedMs() { return elapsedMs; }
    public void setElapsedMs(long elapsedMs) { this.elapsedMs = elapsedMs; }
    public long getStartTime() { return startTime; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public String getCurrentFile() { return currentFile; }
    public void setCurrentFile(String currentFile) { this.currentFile = currentFile; }
}
