import { useState, useEffect, useRef } from 'react'
import { useVscodeListener, postMessage } from '../shared/hooks'

/* ─── 类型 ─── */

interface ProjectInfo { name: string; index: number }

interface SidecarState {
  running: boolean; scanned: boolean; dbDir: string; projectId: string
  inputDirs: string[]; dbFileSize: number; classpathCount: number
  projects: ProjectInfo[]
}

interface QueryResult {
  type: 'callers' | 'callees' | 'list'
  data: { method: string; related: string[] }[]
}

interface LogEntry { time: string; text: string; level: 'info' | 'ok' | 'warn' | 'error' }

interface ClassEntry { method: string; full: string }

/* ─── 工具函数 ─── */

function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function fmtTime(): string { return new Date().toLocaleTimeString('zh-CN', { hour12: false }) }

function parseClassTree(data: { method: string }[]): Map<string, ClassEntry[]> {
  const tree = new Map<string, ClassEntry[]>()
  for (const item of data) {
    const ci = item.method.indexOf(':')
    const cls = ci > 0 ? item.method.slice(0, ci) : item.method
    if (!tree.has(cls)) tree.set(cls, [])
    tree.get(cls)!.push({ method: item.method.slice(ci + 1), full: item.method })
  }
  return tree
}

/* ─── 主组件 ─── */

export default function CallGraphPanel() {
  const [isSidebar, setIsSidebar] = useState(true)
  const [state, setState] = useState<SidecarState>({
    running: false, scanned: false, dbDir: '', projectId: '',
    inputDirs: [], dbFileSize: 0, classpathCount: 0, projects: [],
  })
  const [progress, setProgress] = useState('')
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'scanning' | 'complete'>('idle')
  const [query, setQuery] = useState('')
  const [queryType, setQueryType] = useState<'callers' | 'callees'>('callers')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())
  const [classTree, setClassTree] = useState<Map<string, ClassEntry[]>>(new Map())
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [classFilter, setClassFilter] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)

  /* 日志（上限 500 条） */
  const LOG_MAX = 500
  function addLog(text: string, level: LogEntry['level'] = 'info') {
    setLogs(prev => prev.length >= LOG_MAX ? [...prev.slice(1), { time: fmtTime(), text, level }] : [...prev, { time: fmtTime(), text, level }])
  }

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  /* 挂载后轮询侧车状态 */
  useEffect(() => {
    postMessage({ type: 'requestSidecarStatus' })
    const timer = setInterval(() => postMessage({ type: 'requestSidecarStatus' }), 5000)
    return () => clearInterval(timer)
  }, [])

  useVscodeListener((msg: any) => {
    if (msg.type === 'panelConfig') {
      setIsSidebar(msg.isSidebar === true)
    }
    if (msg.type === 'sidecarStatus') {
      setState(msg.data)
      setBusy(false)
      setProgress('')
      if (msg.data.running && msg.data.scanned) setPhase('complete')
      else if (msg.data.running) setPhase('idle')
    }
    if (msg.type === 'sidecarProgress') {
      const m = msg.message || ''
      setProgress(m)
      if (m.includes('preparing') || m.includes('Initializing')) setPhase('preparing')
      else if (m.includes('scanning') || m.includes('Parsing')) setPhase('scanning')
      else if (m.includes('complete') || m.includes('Scan complete')) {
        setPhase('complete')
        addLog('✓ 扫描完成！正在加载类结构…', 'ok')
        // 扫描完成自动加载类树（仅一次）
        postMessage({ type: 'sidecarQuery', queryType: 'list', query: '' })
      }
      addLog(m)
    }
    if (msg.type === 'queryResult') {
      if (msg.queryType === 'list') {
        const tree = parseClassTree(msg.data || [])
        setClassTree(tree)
        setShowBrowser(true)
        addLog(`发现 ${tree.size} 个类，${(msg.data || []).length} 个方法`, 'ok')
      } else {
        setResult({ type: msg.queryType, data: msg.data || [] })
        addLog(`查询完成: ${(msg.data || []).length} 条结果`, 'ok')
      }
      setBusy(false)
    }
  })

  /* ─── 操作函数 ─── */

  function doScan() {
    setBusy(true); setProgress('正在启动扫描…'); setResult(null)
    setPhase('preparing'); setShowBrowser(false)
    setClassTree(new Map()); setClassFilter('')
    addLog('开始扫描', 'info')
    postMessage({ type: 'startSidecarScan' })
  }

  function doClean() {
    setBusy(true); setProgress('清理中…'); setResult(null)
    setPhase('idle'); setShowBrowser(false)
    setClassTree(new Map()); setClassFilter('')
    addLog('清理缓存', 'warn')
    postMessage({ type: 'cleanSidecarCache' })
  }

  function doQuery() {
    if (!query.trim()) return
    setBusy(true); setResult(null); setShowBrowser(false)
    addLog(`查询 ${queryType}: ${query.trim()}`, 'info')
    postMessage({ type: 'sidecarQuery', queryType, query: query.trim() })
  }

  function quickQuery(full: string, tp: 'callers' | 'callees' = 'callers') {
    setQuery(full); setQueryType(tp); setShowBrowser(false)
    setBusy(true); setResult(null)
    addLog(`查询 ${tp}: ${full}`, 'info')
    postMessage({ type: 'sidecarQuery', queryType: tp, query: full })
  }

  function toggleExpand(idx: number) {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function toggleClass(cls: string) {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(cls)) next.delete(cls); else next.add(cls)
      return next
    })
  }

  function switchProject(index: number) {
    addLog(`切换到项目: ${state.projects.find(p => p.index === index)?.name || index}`, 'info')
    postMessage({ type: 'switchProject', index })
  }

  /* ─── 进度百分比估算 ─── */
  const progressPct = phase === 'idle' ? 0 : phase === 'preparing' ? 15 : phase === 'scanning' ? 55 : 100
  const totalMethods = Array.from(classTree.values()).reduce((sum, m) => sum + m.length, 0)

  /* ─── 共享渲染 ─── */

  function renderStatusCards() {
    return (
      <div className="card-grid">
        <div className="card">
          <div className="card-label">侧车状态</div>
          <div className="card-value">
            <span className={`status-dot-sm ${state.running ? 'running' : 'stopped'}`} />
            {state.running ? '运行中' : '未运行'}
          </div>
          <div className="card-detail">
            端口 38766
            {state.projects.length > 1
              ? <span className="project-select-wrap"> · 项目:
                  <select className="project-select" value={-1} onChange={e => switchProject(Number(e.target.value))}>
                    {state.projects.map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
                  </select>
                </span>
              : state.projectId ? ` · #${state.projectId.slice(0, 8)}` : ''}
          </div>
        </div>
        <div className="card">
          <div className="card-label">扫描状态</div>
          <div className="card-value" style={state.scanned ? { color: 'var(--green)' } : {}}>
            {state.scanned ? `${totalMethods > 0 ? totalMethods.toLocaleString() : '?'} 方法` : '等待扫描'}
          </div>
          <div className="card-detail">
            {state.scanned ? `共 ${classTree.size} 个类` : '点击扫描开始分析'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">数据库</div>
          <div className="card-value">{state.dbFileSize > 0 ? fmtSize(state.dbFileSize) : '空'}</div>
          <div className="card-detail">{state.dbDir ? state.dbDir.split(/[/\\]/).slice(-2).join('/') : '-'}</div>
        </div>
        <div className="card">
          <div className="card-label">输入路径</div>
          <div className="card-value">{state.classpathCount > 0 ? `${state.classpathCount} 个` : '未发现'}</div>
          <div className="card-detail">
            {state.inputDirs.length > 0
              ? state.inputDirs.slice(0, 2).map(d => d.split(/[/\\]/).pop()).join(', ') + (state.inputDirs.length > 2 ? ` +${state.inputDirs.length - 2}` : '')
              : '需执行扫描'}
          </div>
        </div>
      </div>
    )
  }

  function renderClassBrowser() {
    if (!showBrowser || classTree.size === 0) return null
    const filtered = classFilter
      ? Array.from(classTree.entries()).filter(([cls]) => cls.toLowerCase().includes(classFilter.toLowerCase()))
      : Array.from(classTree.entries())
    return (
      <div className="result-section">
        <div className="result-header">
          <span className="result-title">类结构浏览</span>
          <span className="count">{classTree.size} 个类 · {totalMethods.toLocaleString()} 个方法</span>
        </div>
        <div className="browser-filter">
          <input type="text" placeholder="过滤类名..." value={classFilter} onChange={e => setClassFilter(e.target.value)} />
        </div>
        {filtered.length === 0
          ? <div className="empty">无匹配类名</div>
          : filtered.map(([cls, methods]) => (
              <div key={cls} className="class-node">
                <div className="class-name" onClick={() => toggleClass(cls)}>
                  <span className={`arrow ${expandedClasses.has(cls) ? 'expanded' : ''}`}>▶</span>
                  <span className="class-label">{cls}</span>
                  <span className="count">{methods.length} 方法</span>
                </div>
                {expandedClasses.has(cls) && (
                  <div className="class-methods">
                    {methods.map((m, i) => (
                      <div key={i} className="method-item">
                        <span className="method-name" onClick={() => quickQuery(m.full, 'callers')} title="查谁调了它">↑ {m.method}</span>
                        <span className="method-name callee" onClick={() => quickQuery(m.full, 'callees')} title="查它调了谁">↓ {m.method}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
        }
      </div>
    )
  }

  function renderResults(maxItems?: number) {
    if (!result) return null
    const items = maxItems ? result.data.slice(0, maxItems) : result.data
    return (
      <div className="result-section">
        <div className="result-header">
          <span className="result-title">{result.type === 'callers' ? '↑ 调用方' : '↓ 被调用方'}</span>
          <span className="count">{result.data.length} 条结果</span>
        </div>
        {result.data.length === 0
          ? <div className="empty">无匹配结果</div>
          : items.map((n, i) => (
              <div key={i} className="method-node" onClick={() => toggleExpand(i)}>
                <div className="method-name-root">
                  {n.related.length > 0 && <span className={`arrow ${expandedNodes.has(i) ? 'expanded' : ''}`}>▶</span>}
                  <span className="method-label">{n.method}</span>
                  <span className="method-actions">
                    <span className="action-btn" onClick={e => { e.stopPropagation(); quickQuery(n.method, 'callers') }} title="查谁调了它">↑</span>
                    <span className="action-btn" onClick={e => { e.stopPropagation(); quickQuery(n.method, 'callees') }} title="查它调了谁">↓</span>
                  </span>
                </div>
                {expandedNodes.has(i) && n.related.length > 0 && (
                  <div className="method-related">
                    {n.related.map((r, j) => (
                      <div key={j} className="method-call" onClick={() => quickQuery(r, result.type === 'callers' ? 'callers' : 'callees')}>{r}</div>
                    ))}
                  </div>
                )}
              </div>
            ))
        }
        {maxItems && result.data.length > maxItems && <div className="empty">… 仅显示前 {maxItems} 条</div>}
      </div>
    )
  }

  /* ── 侧边栏模式 ── */
  if (isSidebar) {
    return (
      <div className="app">
        <div className="header">
          <span className={`status-dot ${state.running ? 'running' : 'stopped'}`} />
          <h1>调用图分析</h1>
        </div>
        <button className="btn-open-editor" onClick={() => postMessage({ type: 'openInEditor' })}>
          在编辑器标签页中打开完整版 →
        </button>
        {renderStatusCards()}

        {phase === 'complete' && showBrowser && classTree.size > 0 && !result && (
          <div className="done-banner">
            ✓ 扫描完成！点击类名展开 → 点击 <span className="action-btn-sm">↑</span>查调用方 / <span className="action-btn-sm">↓</span>查被调方
          </div>
        )}

        <div className="section-title">数据管理</div>
        <div className="actions-bar">
          <button className="btn primary" disabled={!state.running || busy} onClick={doScan}>扫描</button>
          <button className="btn danger" disabled={!state.running || busy} onClick={doClean}>清理</button>
          <button className="btn" disabled={busy} onClick={() => postMessage({ type: 'requestSidecarStatus' })}>刷新</button>
          {state.scanned && <button className="btn" disabled={busy} onClick={() => { postMessage({ type: 'sidecarQuery', queryType: 'list', query: '' }); setBusy(true) }}>浏览类结构</button>}
        </div>
        {busy && progress && <div className="progress-bar"><div className="progress-text">{progress}</div></div>}
        {busy && phase !== 'idle' && (
          <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPct}%` }} /><span className="progress-label">{progressPct}%</span></div>
        )}

        {renderClassBrowser()}
        {renderResults(50)}

        {!showBrowser && !result && (<>
          <div className="section-title">快速查询</div>
          <div className="query-row">
            <select value={queryType} onChange={e => { setQueryType(e.target.value as any); setResult(null) }}>
              <option value="callers">↑ 谁调了</option>
              <option value="callees">↓ 调了谁</option>
            </select>
            <input type="text" value={query} placeholder="类名:方法" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doQuery() }} />
            <button className="btn primary" disabled={!state.scanned || busy || !query.trim()} onClick={doQuery}>查</button>
          </div>
        </>)}
      </div>
    )
  }

  /* ── 编辑器模式 ── */
  return (
    <div className="app">
      <div className="header">
        <span className={`status-dot ${state.running ? 'running' : 'stopped'}`} />
        <h1>调用图分析</h1>
        <span className={`status-badge ${state.running ? (state.scanned ? 'scanned' : 'ready') : 'stopped'}`}>
          {state.running ? (state.scanned ? `已扫描${totalMethods > 0 ? ` · ${totalMethods.toLocaleString()} 方法` : ''}` : '待扫描') : '侧车停止'}
        </span>
      </div>

      {renderStatusCards()}

      {/* ── 扫描完成引导 ── */}
      {phase === 'complete' && showBrowser && classTree.size > 0 && !result && (
        <div className="done-banner">
          ✓ 扫描完成。在下方<b>类结构浏览</b>中点击类名展开方法，点击方法旁的
          <span className="action-btn-sm">↑</span>查谁调了它 或 <span className="action-btn-sm">↓</span>查它调了谁
        </div>
      )}

      {/* ── 数据管理 ── */}
      <div className="section-title">数据管理</div>
      <div className="actions-bar">
        <button className="btn primary" disabled={!state.running || busy} onClick={doScan}>扫描</button>
        <button className="btn danger" disabled={!state.running || busy} onClick={doClean}>清理</button>
        <button className="btn" disabled={busy} onClick={() => postMessage({ type: 'requestSidecarStatus' })}>刷新状态</button>
        {state.scanned && <button className="btn" disabled={busy} onClick={() => { postMessage({ type: 'sidecarQuery', queryType: 'list', query: '' }); setBusy(true) }}>浏览类结构</button>}
      </div>
      {busy && phase !== 'idle' && (
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPct}%` }} /><span className="progress-label">{progressPct}%</span></div>
      )}
      {progress && <div className="progress-bar"><div className="progress-text">{progress}</div></div>}

      {/* ── 日志 ── */}
      <div className="section-title">
        分析日志
        {logs.length > 0 && <span className="count">{logs.length} 条</span>}
      </div>
      <div className="log-panel">
        {logs.length === 0
          ? <div className="empty-log">暂无日志</div>
          : logs.map((entry, i) => (
              <div key={i} className={`log-line log-${entry.level}`}>
                <span className="log-time">{entry.time}</span>
                <span className="log-text">{entry.text}</span>
              </div>
            ))
        }
        <div ref={logEndRef} />
      </div>

      {/* ── 类结构浏览 ── */}
      {renderClassBrowser()}

      {/* ── 查询结果 ── */}
      {renderResults()}

      {/* ── 查询输入 ── */}
      {!showBrowser && !result && (
        <div className="section-title">调用图查询</div>
      )}
      {!showBrowser && !result && (
        <>
          <div className="query-row">
            <select value={queryType} onChange={e => { setQueryType(e.target.value as any); setResult(null) }}>
              <option value="callers">↑ 谁调了该方法</option>
              <option value="callees">↓ 该方法调了谁</option>
            </select>
            <input type="text" value={query} placeholder="输入类名或 类名:方法" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doQuery() }} />
            <button className="btn primary" disabled={!state.scanned || busy || !query.trim()} onClick={doQuery}>查询</button>
          </div>
          <div className="quick-cmds">
            <button className="btn-tag" disabled={!state.scanned || busy} onClick={() => { setQuery('Controller'); doQuery() }}>Controller</button>
            <button className="btn-tag" disabled={!state.scanned || busy} onClick={() => { setQuery('Service'); doQuery() }}>Service</button>
            <button className="btn-tag" disabled={!state.scanned || busy} onClick={() => { setQuery('Mapper'); doQuery() }}>Mapper</button>
            <button className="btn-tag" disabled={!state.scanned || busy} onClick={() => { setQuery('Repository'); doQuery() }}>Repository</button>
          </div>
        </>
      )}

      {/* ── 操作说明（仅首次） ── */}
      {!showBrowser && !result && (<>
        <div className="section-title">操作说明</div>
        <ul className="help-list">
          <li>先点击 <strong>扫描</strong> 分析项目字节码，然后点击 <strong>浏览类结构</strong></li>
          <li>在类树中点击类名展开方法，点击 ↑ 查谁调了它，点击 ↓ 查它调了谁</li>
          <li>也支持直接输入 <code>类名:方法</code> 查询（如 <code>com.example.MyService:getUserById</code>）</li>
          <li>查询结果中的方法也可继续点击 ↑ ↓ 追溯</li>
        </ul>
      </>)}
    </div>
  )
}
