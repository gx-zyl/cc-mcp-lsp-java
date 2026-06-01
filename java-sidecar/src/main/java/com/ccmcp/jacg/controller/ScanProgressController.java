package com.ccmcp.jacg.controller;

import com.ccmcp.jacg.scanner.ScanManager;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 扫描进度 SSE 推送端点
 *
 * 提供 GET /scan/progress/{execId} 端点，客户端通过 EventSource 订阅扫描进度。
 * 进度事件由 ScanManager 的 SseEmitter 通过 JacgScanner 回调实时推送。
 */
@RestController
public class ScanProgressController {

    private final ScanManager scanManager;

    public ScanProgressController(ScanManager scanManager) {
        this.scanManager = scanManager;
    }

    @GetMapping(value = "/scan/progress/{execId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamProgress(@PathVariable String execId) {
        SseEmitter emitter = scanManager.getEmitter(execId);
        if (emitter == null) {
            // execId 不存在或扫描已结束
            SseEmitter dead = new SseEmitter(0L);
            try {
                dead.send(SseEmitter.event().name("error").data("{\"error\":\"execId not found\"}"));
            } catch (Exception ignored) {}
            dead.complete();
            return dead;
        }
        return emitter;
    }
}
