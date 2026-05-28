# 子进程管理三暗坑

启动任何子进程（`child_process.spawn` / `exec`）时必须检查以下三项：

## 1. 依赖存在性

二进制 / JAR / 脚本不存在时：
- **MUST** `reject()` 或返回错误状态
- **MUST** 弹窗提示用户（`showWarningMessage`）
- **MUST NOT** 静默 `resolve()`（用户以为功能正常，实际不可用）

```typescript
// ❌ 错误
if (!fs.existsSync(bin)) { return Promise.resolve(); }

// ✅ 正确
if (!fs.existsSync(bin)) {
  showWarningMessage('构建指南');
  return Promise.reject(new Error('not found'));
}
```

## 2. 超时处理

health check 超时后：
- **MUST** `reject()` — 虚假就绪比失败更糟糕
- **MUST** 设置明确的状态和错误原因
- **MUST NOT** `resolve()`（用户看到绿色指标但操作失败）

```typescript
// ❌ 错误
setTimeout(() => { resolve(); }, 15000);

// ✅ 正确
setTimeout(() => {
  setStatus('timeout');
  reject(new Error('start timeout after 15s'));
}, 15000);
```

## 3. 崩溃恢复

进程意外退出时：
- **MUST** 区分主动停止（`stopSidecar()`）和非预期退出
- **MUST** 实现自动重启（指数退避，上限 3 次）
- **MUST** 追踪 `restartCount` 并在 UI 展示
- **MUST** 存储定时器 ID 以便入口处取消

```typescript
// ✅ 正确模式
let _restartTimer: Timer | null = null;

function _doSpawn() {
  process.on('exit', (code) => {
    if (status === 'starting' || status === 'ready') {
      if (restartCount < MAX_RESTARTS) {
        _restartTimer = setTimeout(() => _doSpawn(), delay);
      } else {
        setStatus('crashed');
        onFailed();
      }
    } else {
      setStatus('stopped');
    }
  });
}

function startSidecar() {
  clearTimers();        // 取消待处理重启
  // ...
}
```

## 检查清单

- [ ] 依赖文件存在性检查 → 失败时 reject + 弹窗
- [ ] health check 超时 → reject，不 resolve
- [ ] exit handler 区分主动/非预期退出
- [ ] 自动重启有上限（≤3 次）
- [ ] 重启定时器 ID 可取消（防竞态）
- [ ] 重启次数可在 UI 或日志中查看
