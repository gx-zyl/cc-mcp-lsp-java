package com.ccmcp.jacg.scanner;

import com.adrninistrator.jacg.conf.ConfigureWrapper;
import com.adrninistrator.jacg.conf.enums.ConfigDbKeyEnum;
import com.adrninistrator.jacg.conf.enums.ConfigKeyEnum;
import com.adrninistrator.jacg.runner.RunnerWriteDb;
import com.adrninistrator.javacg2.conf.JavaCG2ConfigureWrapper;
import com.adrninistrator.javacg2.conf.enums.JavaCG2OtherConfigFileUseListEnum;
import com.ccmcp.jacg.config.JacgProperties;
import com.ccmcp.jacg.db.H2Manager;
import com.ccmcp.jacg.model.ScanState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.function.Consumer;

/**
 * JACG 扫描执行器
 *
 * 封装 RunnerWriteDb 的异步扫描逻辑，通过 Consumer<ScanState> 回调报告进度。
 */
@Component
public class JacgScanner {

    private static final Logger log = LoggerFactory.getLogger(JacgScanner.class);

    private final JacgProperties properties;
    private final H2Manager h2Manager;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private volatile Object runningRunner;

    public JacgScanner(JacgProperties properties, H2Manager h2Manager) {
        this.properties = properties;
        this.h2Manager = h2Manager;
    }

    /**
     * 提交异步扫描任务，不阻塞。
     *
     * @param onProgress 进度回调（每次文件完成 + 终态时调用）
     */
    public void scanAsync(String projectId, List<String> inputDirs,
                           Integer maxJars, Integer scanTimeout, Integer threads,
                           Consumer<ScanState> onProgress) {
        executor.submit(() -> doScan(projectId, inputDirs, maxJars, scanTimeout, threads, onProgress));
    }

    /**
     * 执行扫描（在后台线程运行）
     */
    private void doScan(String projectId, List<String> inputDirs,
                         Integer maxJars, Integer scanTimeout, Integer threads,
                         Consumer<ScanState> onProgress) {
        long startMs = System.currentTimeMillis();
        int effectiveMaxJars = maxJars != null ? Math.min(maxJars, properties.getScan().getMaxJars()) : properties.getScan().getMaxJars();
        int effectiveTimeout = scanTimeout != null ? scanTimeout : properties.getScan().getDefaultTimeout();
        int effectiveThreads = threads != null ? Math.min(threads, properties.getScan().getMaxThreads()) : 2;
        if (effectiveThreads < 1) effectiveThreads = 1;

        h2Manager.cleanupH2Locks(projectId);

        List<String> resolved = resolveJarFiles(inputDirs, effectiveMaxJars);
        if (resolved.isEmpty()) {
            ScanState err = new ScanState("", projectId, "failed");
            err.setErrorMessage("no jar/class files found in input directories");
            onProgress.accept(err);
            return;
        }

        log.info("Scan project={} files={} timeout={}s threads={}", projectId, resolved.size(), effectiveTimeout, effectiveThreads);

        String pOutDir = h2Manager.projectOutDir(projectId);
        String pDbPath = h2Manager.projectDbPath(projectId);
        new File(pOutDir).mkdirs();

        int totalFiles = resolved.size();
        int processedCount = 0;
        boolean overallSuccess = true;

        // 逐个处理 JAR 文件，每完成一个更新进度
        for (int i = 0; i < totalFiles; i++) {
            String jarFile = resolved.get(i);
            List<String> singleJar = List.of(jarFile);
            long jarStartMs = System.currentTimeMillis();
            int perJarTimeout = Math.max(effectiveTimeout / Math.max(totalFiles, 1), 30);

            // 报告当前进度
            ScanState ss = new ScanState("", projectId, "running",
                    i, // 已处理数
                    System.currentTimeMillis() - startMs);
            String fname = jarFile.replace('\\', '/');
            fname = fname.substring(fname.lastIndexOf('/') + 1);
            ss.setCurrentFile(fname);
            onProgress.accept(ss);

            JavaCG2ConfigureWrapper cg2Cw = new JavaCG2ConfigureWrapper(true);
            cg2Cw.setOtherConfigList(JavaCG2OtherConfigFileUseListEnum.OCFULE_JAR_DIR, singleJar);
            ConfigureWrapper cw = new ConfigureWrapper(true);
            cw.setMainConfig(ConfigKeyEnum.CKE_SKIP_WRITE_DB_WHEN_JAR_NOT_MODIFIED, "false");
            cw.setMainConfig(ConfigKeyEnum.CKE_APP_NAME, projectId);
            cw.setMainConfig(ConfigKeyEnum.CKE_OUTPUT_ROOT_PATH, pOutDir);
            cw.setMainConfig(ConfigKeyEnum.CKE_OUTPUT_DIR_NAME, "output");
            cw.setMainConfig(ConfigKeyEnum.CKE_THREAD_NUM, String.valueOf(effectiveThreads));
            cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_USE_H2, Boolean.TRUE.toString());
            cw.setMainConfig(ConfigDbKeyEnum.CDKE_DB_H2_FILE_PATH, pDbPath);

            Future<Boolean> future = executor.submit(() -> {
                RunnerWriteDb runner = new RunnerWriteDb(cg2Cw, cw);
                runningRunner = runner;
                try {
                    return runner.run();
                } finally {
                    runningRunner = null;
                }
            });

            try {
                boolean ok = future.get(perJarTimeout, TimeUnit.SECONDS);
                if (ok) {
                    processedCount++;
                    log.info("JAR {} done: {} ({}/{} elapsed={}ms)", i + 1, jarFile, processedCount, totalFiles,
                            System.currentTimeMillis() - jarStartMs);
                } else {
                    log.error("JAR {} failed: {}", i + 1, jarFile);
                    overallSuccess = false;
                    processedCount++;
                }
            } catch (TimeoutException e) {
                log.warn("JAR {} timeout after {}s: {}", i + 1, perJarTimeout, jarFile);
                future.cancel(true);
                forceCloseRunner(runningRunner);
                h2Manager.cleanupH2Locks(projectId);
                overallSuccess = false;
                processedCount++;
            } catch (Exception e) {
                log.error("JAR {} error: {}", i + 1, e.getMessage());
                overallSuccess = false;
                processedCount++;
            }
        }

        long elapsedMs = System.currentTimeMillis() - startMs;
        if (overallSuccess && processedCount == totalFiles) {
            log.info("Scan complete: project={} elapsed={}ms", projectId, elapsedMs);
            onProgress.accept(new ScanState("", projectId, "complete", totalFiles, elapsedMs));
        } else {
            log.error("Scan partial failure: project={} ok={}/{}", projectId, processedCount, totalFiles);
            ScanState err = new ScanState("", projectId, "failed", processedCount, elapsedMs);
            err.setErrorMessage(processedCount < totalFiles ? "部分文件处理失败" : "处理完成但有错误");
            onProgress.accept(err);
        }
    }

    private void forceCloseRunner(Object runner) {
        if (runner == null) return;
        try {
            java.lang.reflect.Field dbOpField = runner.getClass().getSuperclass().getDeclaredField("dbOperator");
            dbOpField.setAccessible(true);
            Object dbOp = dbOpField.get(runner);
            if (dbOp != null) {
                java.lang.reflect.Method closeDs = dbOp.getClass().getMethod("closeDs", Object.class);
                closeDs.invoke(dbOp, runner);
                log.info("Forced close JACG datasource due to timeout");
            }
        } catch (Exception e) {
            log.warn("forceCloseRunner error: {}", e.getMessage());
        }
    }

    public static List<String> resolveJarFiles(List<String> dirs, int maxJars) {
        List<String> result = new ArrayList<>();
        int count = 0;
        for (String dir : dirs) {
            File f = new File(dir);
            if (f.isFile() && isJarOrClass(f) && !isJacgMerged(f)) {
                result.add(dir);
                count++;
                if (maxJars > 0 && count >= maxJars) break;
            } else if (f.isDirectory()) {
                File[] files = f.listFiles();
                if (files == null) continue;
                for (File child : files) {
                    if (maxJars > 0 && count >= maxJars) break;
                    if (child.isFile() && isJarOrClass(child) && !isJacgMerged(child)) {
                        result.add(child.getAbsolutePath());
                        count++;
                    }
                }
            }
            if (maxJars > 0 && count >= maxJars) break;
        }
        return result;
    }

    private static boolean isJarOrClass(File f) {
        return f.getName().endsWith(".jar") || f.getName().endsWith(".class");
    }

    private static boolean isJacgMerged(File f) {
        return f.getName().endsWith("-javacg2_merged.jar");
    }
}
