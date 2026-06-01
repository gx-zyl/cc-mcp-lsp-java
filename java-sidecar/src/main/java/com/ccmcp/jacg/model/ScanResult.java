package com.ccmcp.jacg.model;

/**
 * 扫描结果 VO
 */
public class ScanResult {

    private boolean success;
    private String status;       // "ok" | "timeout" | "failed"
    private int fileCount;
    private long elapsedMs;
    private String errorMessage;

    public ScanResult(boolean success, String status, int fileCount, long elapsedMs) {
        this.success = success;
        this.status = status;
        this.fileCount = fileCount;
        this.elapsedMs = elapsedMs;
    }

    public ScanResult(boolean success, String status, String errorMessage) {
        this.success = success;
        this.status = status;
        this.errorMessage = errorMessage;
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getFileCount() { return fileCount; }
    public void setFileCount(int fileCount) { this.fileCount = fileCount; }

    public long getElapsedMs() { return elapsedMs; }
    public void setElapsedMs(long elapsedMs) { this.elapsedMs = elapsedMs; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
