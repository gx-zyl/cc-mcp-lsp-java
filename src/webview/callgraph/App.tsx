import { useState } from 'react'
import { useCallGraphState, fmtSize, type SidecarState } from './hooks/useCallGraphState'
import { postMessage } from '../shared/hooks'

/* ─── 状态横幅组件 ─── */

function StatusBanner({ state }: { state: SidecarState }) {
  return (
    <div className={`status-banner ${state.status}`}>
      {state.status === 'jar_missing' && <span>⚠ Java 侧车 JAR 未构建。终端执行：<code>cd java-sidecar && mvn package -DskipTests</code></span>}
      {state.status === 'timeout' && <span>⏱ 侧车启动超时：{state.detail}</span>}
      {state.status === 'crashed' && <span>💥 侧车已崩溃（重启 {state.restartCount} 次后失败）：{state.detail}</span>}
      {state.status === 'starting' && <span>⟳ 侧车启动中…</span>}
      {state.status === 'error' && <span>✕ {state.detail}</span>}
      {state.status === 'stopped' && state.restartCount > 0 && <span>⏹ 侧车已停止（已自动重启 {state.restartCount} 次）</span>}
      {state.status === 'not_started' && <span>侧车尚未启动。等待扩展激活…</span>}
      {state.status === 'stopped' && state.restartCount === 0 && <span>侧车已停止。点击<b>扫描</b>重新开始分析</span>}
    </div>
  )
}

/* ─── Badge 栏组件 ─── */

function BadgeBar({ state, totalMethods }: { state: SidecarState; totalMethods: number }) {
  const metaColor = (s: string) => {
    if (s === 'ready') return 'var(--green)'
    if (s === 'starting') return 'var(--orange)'
    return 'var(--red)'
  }
  return (
    <div className="badge-bar">
      <span className="badge-item" title={state.detail}>
        <span className="badge-dot" style={{ background: metaColor(state.status) }} />
        {state.status === 'ready'
          ? (state.scanned ? `已分析 ${totalMethods.toLocaleString()} 方法` : '待扫描')
          : state.status === 'starting' ? '启动中…'
          : state.status === 'jar_missing' ? 'JAR 缺失'
          : state.status === 'timeout' ? '启动超时'
          : state.status === 'crashed' ? '已崩溃'
          : state.status === 'error' ? '启动失败'
          : '未启动'}
      </span>
      {state.scanned && (
        <span className="badge-item" title={`数据库路径: ${state.dbDir}`}>
          📦 {state.dbFileSize > 0 ? fmtSize(state.dbFileSize) : '< 1 KB'}
        </span>
      )}
      {state.status === 'ready' && (
        <span className="badge-item" title={`端口 38766`}>
          🔌 {state.projects.length > 1 ? `${state.projects.length} 项目` : state.projectId ? `#${state.projectId.slice(0, 6)}` : '单项目'}
        </span>
      )}
      {state.projects.length > 1 && (
        <select className="badge-select" value={state.activeProjectIndex} onChange={e => postMessage({ type: 'switchProject', index: Number(e.target.value) })}>
          {state.projects.map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
        </select>
      )}
    </div>
  )
}

/* ─── 类树浏览 ─── */

function ClassBrowser({
  classTree, expandedClasses, classFilter, totalMethods,
  onToggleClass, onQuickQuery, onFilterChange,
}: {
  classTree: Map<string, { method: string; full: string }[]>
  expandedClasses: Set<string>
  classFilter: string
  totalMethods: number
  onToggleClass: (cls: string) => void
  onQuickQuery: (full: string, tp: 'callers' | 'callees') => void
  onFilterChange: (f: string) => void
}) {
  const filtered = classFilter
    ? Array.from(classTree.entries()).filter(([cls]) => cls.toLowerCase().includes(classFilter.toLowerCase()))
    : Array.from(classTree.entries())

  return (
    <div className="tab-content">
      <div className="browser-header">
        <span className="section-label">类结构浏览</span>
        <span className="count">{classTree.size} 类 · {totalMethods.toLocaleString()} 方法</span>
      </div>
      <div className="browser-filter">
        <input type="text" placeholder="过滤类名…" value={classFilter} onChange={e => onFilterChange(e.target.value)} />
      </div>
      {filtered.length === 0
        ? <div className="empty">无匹配类名</div>
        : filtered.map(([cls, methods]) => (
            <div key={cls} className="class-node">
              <div className="class-name" onClick={() => onToggleClass(cls)}>
                <span className={`arrow ${expandedClasses.has(cls) ? 'expanded' : ''}`}>▶</span>
                <span className="class-label">{cls}</span>
                <span className="count">{methods.length} 方法</span>
              </div>
              {expandedClasses.has(cls) && (
                <div className="class-methods">
                  {methods.map((m, i) => (
                    <div key={i} className="method-item">
                      <span className="method-name" onClick={() => onQuickQuery(m.full, 'callers')} title="查谁调了它">↑ {m.method}</span>
                      <span className="method-name callee" onClick={() => onQuickQuery(m.full, 'callees')} title="查它调了谁">↓ {m.method}</span>
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

/* ─── 查询结果 ─── */

function QueryResult({
  result, busy, onQuickQuery, maxItems,
}: {
  result: { type: string; data: { method: string; related: string[] }[] } | null
  busy: boolean
  onQuickQuery: (full: string, tp: 'callers' | 'callees') => void
  maxItems?: number
}) {
  if (busy) return <div className="tab-content"><div className="empty">查询中…</div></div>
  if (!result) return <div className="tab-content"><div className="empty">展开类树点击方法旁的 ↑↓ 追溯调用关系</div></div>

  const items = maxItems ? result.data.slice(0, maxItems) : result.data
  return (
    <div className="tab-content">
      <div className="browser-header">
        <span className="section-label">{result.type === 'callers' ? '↑ 调用方' : '↓ 被调用方'}</span>
        <span className="count">{result.data.length} 条结果</span>
      </div>
      {result.data.length === 0
        ? <div className="empty">无匹配结果</div>
        : items.map((n, i) => (
            <div key={i} className="method-node">
              <div className="method-name-root">
                <span className="method-label">{n.method}</span>
                <span className="method-actions">
                  <span className="action-btn" onClick={e => { e.stopPropagation(); onQuickQuery(n.method, 'callers') }} title="查谁调了它">↑</span>
                  <span className="action-btn" onClick={e => { e.stopPropagation(); onQuickQuery(n.method, 'callees') }} title="查它调了谁">↓</span>
                </span>
              </div>
              {n.related.length > 0 && (
                <div className="method-related">
                  {n.related.map((r, j) => (
                    <div key={j} className="method-call" onClick={() => onQuickQuery(r, result.type === 'callers' ? 'callers' : 'callees')}>{r}</div>
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

/* ─── 主组件 ─── */

export default function CallGraphPanel() {
  const h = useCallGraphState()
  const [activeTab, setActiveTab] = useState<'browser' | 'trace'>('browser')

  return (
    <div className="app">
      {/* ── Header ── */}
      <div className="header">
        <span className={`status-dot ${h.sm.cls}`} title={h.state.detail} />
        <h1>调用图分析</h1>
        <span className={`status-badge ${h.state.status}`}>{h.sm.label}</span>
      </div>

      {/* ── 状态横幅 ── */}
      {h.state.status !== 'ready' && <StatusBanner state={h.state} />}

      {/* ── Badge 栏 ── */}
      <BadgeBar state={h.state} totalMethods={h.totalMethods} />

      {/* ── 数据管理 ── */}
      <div className="actions-bar">
        <button className="btn primary" disabled={h.state.status !== 'ready' || h.busy} onClick={h.doScan}>扫描</button>
        <button className="btn danger" disabled={h.state.status !== 'ready' || h.busy} onClick={h.doClean}>清理</button>
        <button className="btn" disabled={h.busy} onClick={() => postMessage({ type: 'requestSidecarStatus' })}>刷新</button>
        {h.state.scanned && (
          <button className="btn" disabled={h.busy} onClick={() => { postMessage({ type: 'sidecarQuery', queryType: 'list', query: '' }); h.setShowBrowser(true); h.setClassFilter('') }}>浏览类结构</button>
        )}
        {h.isSidebar && (
          <button className="btn" onClick={h.openInEditor}>打开编辑器版</button>
        )}
      </div>

      {/* ── 扫描进度 ── */}
      {h.busy && h.phase !== 'idle' && (
        <>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${h.phase === 'preparing' ? 15 : h.phase === 'scanning' ? 55 : 100}%` }} /><span className="progress-label">{h.phase === 'preparing' ? '15' : h.phase === 'scanning' ? '55' : '100'}%</span></div>
          {h.progress && <div className="progress-text-inline">{h.progress}</div>}
        </>
      )}

      {/* ── Tabs: 类树浏览 / 调用链追溯 ── */}
      {(h.showBrowser || h.hasResult) && (
        <div className="tabs">
          <button className={`tab ${activeTab === 'browser' ? 'active' : ''}`} onClick={() => setActiveTab('browser')} disabled={!h.showBrowser}>
            类树浏览
          </button>
          <button className={`tab ${activeTab === 'trace' ? 'active' : ''}`} onClick={() => setActiveTab('trace')} disabled={!h.hasResult}>
            调用链追溯
            {h.hasResult && <span className="tab-count">{h.result!.data.length}</span>}
          </button>
        </div>
      )}

      {/* ── Tab 内容 ── */}
      {activeTab === 'browser' && h.showBrowser && (
        <ClassBrowser
          classTree={h.classTree}
          expandedClasses={h.expandedClasses}
          classFilter={h.classFilter}
          totalMethods={h.totalMethods}
          onToggleClass={h.toggleClass}
          onQuickQuery={h.quickQuery}
          onFilterChange={h.setClassFilter}
        />
      )}

      {activeTab === 'trace' && (
        <QueryResult
          result={h.result}
          busy={h.busy}
          onQuickQuery={h.quickQuery}
          maxItems={h.isSidebar ? 100 : undefined}
        />
      )}

      {/* ── 扫描完成但无操作时的引导 ── */}
      {h.phase === 'complete' && h.showBrowser && !h.hasResult && (
        <div className="done-banner">
          ✓ 扫描完成。在<b>类树浏览</b>中点击类名展开方法，点击方法旁的 ↑↓ 追溯调用关系
        </div>
      )}

      {/* ── 快速查询（无结果时显示） ── */}
      {!h.showBrowser && !h.hasResult && (
        <div className="quick-query-section">
          <div className="section-label">快速查询</div>
          <div className="query-row">
            <select value={h.queryType} onChange={e => { h.setQueryType(e.target.value as any); }}>
              <option value="callers">↑ 谁调了</option>
              <option value="callees">↓ 调了谁</option>
            </select>
            <input type="text" value={h.query} placeholder="类名:方法" onChange={e => h.setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') h.doQuery() }} />
            <button className="btn primary" disabled={!h.state.scanned || h.busy || !h.query.trim()} onClick={h.doQuery}>查</button>
          </div>
          <div className="quick-cmds">
            {['Controller', 'Service', 'Mapper', 'Repository'].map(tag => (
              <button key={tag} className="btn-tag" disabled={!h.state.scanned || h.busy} onClick={() => h.quickTagQuery(tag)}>{tag}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── 编辑器模式：日志面板 ── */}
      {!h.isSidebar && (
        <div className="editor-section">
          <div className="section-label">
            分析日志
            {h.logs.length > 0 && <span className="count">{h.logs.length} 条</span>}
          </div>
          <div className="log-panel">
            {h.logs.length === 0
              ? <div className="empty-log">暂无日志</div>
              : h.logs.map((entry, i) => (
                  <div key={i} className={`log-line log-${entry.level}`}>
                    <span className="log-time">{entry.time}</span>
                    <span className="log-text">{entry.text}</span>
                  </div>
                ))
            }
            <div ref={h.logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
