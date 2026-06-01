package com.ccmcp.jacg.scanner;

import com.ccmcp.jacg.model.ScanState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ccmcp.jacg.mcp.tool.QueryCallersTool;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * 扫描状态管理器
 *
 * 维护扫描执行状态 Map 和 SSE 推送通道 Map。
 * 每次 scan_project 调用创建一个 execId + ScanState + SseEmitter，
 * JacgScanner 进度回调通过此处向 SseEmitter 推送事件。
 */
@Component
public class ScanManager {

    private static final Logger log = LoggerFactory.getLogger(ScanManager.class);
    private static final long SSE_TIMEOUT = 600000L; // 10 min

    private final ConcurrentHashMap<String, ScanState> states = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> projectScans = new ConcurrentHashMap<>(); // projectId → execId
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    /**
     * 创建扫描任务，返回 execId。
     * 如果该项目已有进行中的扫描，先清理旧的，允许重新扫描。
     */
    public synchronized String createScan(String projectId, int fileCount) {
        // 清理同项目旧的扫描（允许重新扫描）
        String existing = projectScans.get(projectId);
        if (existing != null) {
            cleanup(existing);
        }

        String execId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        ScanState state = new ScanState(execId, projectId, "running");
        state.setFileCount(fileCount);
        states.put(execId, state);
        projectScans.put(projectId, execId);

        // 创建 SSE emitter
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        emitter.onCompletion(() -> cleanup(execId));
        emitter.onTimeout(() -> cleanup(execId));
        emitter.onError(e -> cleanup(execId));
        emitters.put(execId, emitter);

        return execId;
    }

    /** 获取扫描状态 */
    public ScanState getState(String execId) {
        return states.get(execId);
    }

    /** 获取 SSE emitter */
    public SseEmitter getEmitter(String execId) {
        return emitters.get(execId);
    }

    /** 获取进度回调（供 JacgScanner 使用） */
    public Consumer<ScanState> progressCallback(String execId) {
        return state -> {
            // 更新内存状态
            states.put(execId, state);
            // 推送 SSE
            SseEmitter emitter = emitters.get(execId);
            if (emitter != null) {
                try {
                    String eventData = String.format(
                        "{\"status\":\"%s\",\"fileCount\":%d,\"elapsedMs\":%d%s}",
                        state.getStatus(), state.getFileCount(), state.getElapsedMs(),
                        state.getErrorMessage() != null ? ",\"error\":\"" + escapeJson(state.getErrorMessage()) + "\"" : ""
                    );
                    String eventName = state.getStatus();
                    emitter.send(SseEmitter.event().name(eventName).data(eventData));
                    // 终态时自动完成
                    if ("complete".equals(state.getStatus()) || "timeout".equals(state.getStatus()) || "failed".equals(state.getStatus())) {
                        emitter.complete();
                    }
                } catch (IOException e) {
                    log.warn("SSE push failed for execId={}: {}", execId, e.getMessage());
                }
            }
        };
    }

    private void cleanup(String execId) {
        // 立即移除 emitter（SSE 连接已结束）
        emitters.remove(execId);
        // 状态延迟 2 分钟再移除，给轮询留时间
        scheduler.schedule(() -> {
            ScanState state = states.get(execId);
            if (state != null) {
                projectScans.remove(state.getProjectId());
            }
            states.remove(execId);
        }, 2, TimeUnit.MINUTES);
    }

    private static String escapeJson(String s) {
        return QueryCallersTool.jsonEscape(s);
    }
}
