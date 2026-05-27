import { useState, useEffect, useCallback } from 'react'
import { useVscodeListener, postMessage } from '../shared/hooks'

interface SidecarState {
  running: boolean
  scanned: boolean
  dbDir: string
  projectId: string
}

interface QueryResult {
  type: 'callers' | 'callees'
  data: { method: string; related: string[] }[]
}

export default function CallGraphPanel() {
  const [state, setState] = useState<SidecarState>({ running: false, scanned: false, dbDir: '', projectId: '' })
  const [progress, setProgress] = useState('')
  const [query, setQuery] = useState('')
  const [queryType, setQueryType] = useState<'callers' | 'callees'>('callers')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    postMessage({ type: 'requestSidecarStatus' })
  }, [])

  useVscodeListener((msg: any) => {
    if (msg.type === 'sidecarStatus') { setState(msg.data); setBusy(false); setProgress(''); }
    if (msg.type === 'sidecarProgress') setProgress(msg.message || '')
    if (msg.type === 'queryResult') {
      setResult({ type: msg.queryType, data: msg.data || [] })
      setBusy(false)
    }
  })

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <span className={`status-dot ${state.running ? 'running' : 'stopped'}`} />
        <h1>调用图分析</h1>
      </div>

      {/* Status */}
      <div className="status-bar">
        {state.running
          ? <span>{state.scanned ? '已扫描' : '待扫描'}</span>
          : <span className="dim">侧车未运行</span>}
        {state.projectId && <span className="dim" style={{ marginLeft: 8, fontSize: 10 }}>#{state.projectId.substring(0, 8)}</span>}
      </div>

      {/* Scan / Clean */}
      <div className="section-title">数据管理</div>
      <div className="btn-row">
        <button className="btn primary" disabled={!state.running || busy} onClick={() => doScan()}>扫描</button>
        <button className="btn danger" disabled={!state.running || busy} onClick={() => doClean()}>清理</button>
        <button className="btn" disabled={!state.running} onClick={() => postMessage({ type: 'requestSidecarStatus' })}>刷新</button>
      </div>
      {progress && <div className="progress">{progress}</div>}

      {/* Query */}
      <div className="section-title">查询</div>
      <div className="query-row">
        <select value={queryType} onChange={e => { setQueryType(e.target.value as any); setResult(null) }}>
          <option value="callers">谁调了该方法</option>
          <option value="callees">该方法调了谁</option>
        </select>
        <input
          type="text" value={query} placeholder="com.example.MyService:getUserById"
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doQuery() }}
        />
        <button className="btn primary" disabled={!state.scanned || busy || !query.trim()} onClick={doQuery}>
          {busy ? '...' : '查询'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="result-section">
          <div className="section-title">
            {result.type === 'callers' ? '↑ 调用方' : '↓ 被调用方'}
            <span className="count">{result.data.length} 条</span>
          </div>
          {result.data.length === 0
            ? <div className="empty">无结果</div>
            : result.data.map((n, i) => (
                <div key={i} className="method-node">
                  <div className="method-name">{n.method}</div>
                  {n.related.length > 0 && (
                    <div className="method-related">
                      {n.related.map((r, j) => <div key={j} className="method-call">{r}</div>)}
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}

      {/* Quick commands */}
      <div className="section-title">快速命令</div>
      <div className="quick-cmds">
        <button className="btn" onClick={() => { setQuery('Controller'); doQuery() }}>查找 Controller</button>
        <button className="btn" onClick={() => { setQuery('Service'); doQuery() }}>查找 Service</button>
        <button className="btn" onClick={() => { setQuery('Mapper'); doQuery() }}>查找 Mapper</button>
        <button className="btn" onClick={() => { setQuery('Repository'); doQuery() }}>查找 Repository</button>
      </div>
    </div>
  )

  function doScan() {
    setBusy(true); setProgress('正在启动扫描...'); setResult(null)
    postMessage({ type: 'startSidecarScan' })
  }

  function doClean() {
    setBusy(true); setProgress('清理中...')
    postMessage({ type: 'cleanSidecarCache' })
  }

  function doQuery() {
    if (!query.trim()) return
    setBusy(true); setResult(null)
    postMessage({ type: 'sidecarQuery', queryType, query: query.trim() })
  }
}
