# Promise 链与自动重试模式

## 自动重试/重启逻辑

### ❌ 错误的递归 Promise 模式

```typescript
function start() {
  return new Promise((resolve, reject) => {
    spawn();
    process.on('exit', () => {
      start()      // 递归 → 新 Promise
        .then(() => reject(new Error('superseded')))
        .catch(() => {});
    });
  });
}
```

问题：每次递归创建新 Promise，旧 Promise 的 resolve/reject 被遗弃，调用方无法追踪。

### ✅ 正确的内部重试模式

```typescript
function start(): Promise<void> {
  return new Promise((resolve, reject) => {
    _doSpawn(resolve, reject);
  });
}

function _doSpawn(onReady, onFailed) {
  const proc = spawn();
  
  proc.on('exit', (code) => {
    if (canRetry) {
      _restartTimer = setTimeout(           // 存储 timer ID
        () => _doSpawn(onReady, onFailed),  // 复用同一个回调
        delay
      );
    } else {
      onFailed('exceeded max retries');      // 最终拒绝
    }
  });

  // health check
  _healthTimer = setInterval(async () => {
    if (await healthCheck()) {
      clearTimers();
      onReady();                              // 一次解决
    }
  }, 500);
}
```

## 规则

1. **MUST NOT** 递归调用自身（`start() → exit → start()`），这会产生无法取消的 Promise 链
2. **SHOULD** 提取内部函数（`_doSpawn`），由外层 Promise 统一 resolve/reject
3. **MUST** 存储并管理所有定时器 ID（setTimeout/setInterval），入口处清除待处理定时器
4. **MUST** 统一管理状态，避免 resolve/reject 在回调中重复调用

## 定时器管理

```typescript
let _timer: Timer | null = null;

function clearAll() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

function start() {
  clearAll();  // 入口清除旧定时器
  _timer = setTimeout(() => work(), 1000);
}
```
