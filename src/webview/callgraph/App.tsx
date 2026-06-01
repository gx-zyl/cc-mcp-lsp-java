import { useState } from 'react'
import { useCallGraphState, statusLabel, statusColor, type SidecarState, type ChainData } from './hooks/useCallGraphState'

/* ─── Header ─── */

function Header({ scanning, onScan, onRefresh }: { scanning: boolean; onScan: () => void; onRefresh: () => void }) {
  return (
    <div className="cg-header">
      <span className="cg-title">调用图分析</span>
      <div className="cg-header-actions">
        <button className="cg-btn cg-btn-primary" disabled={scanning} onClick={onScan}>{scanning ? '扫描中…' : '▶ 扫描'}</button>
        <button className="cg-btn" disabled={scanning} onClick={onRefresh} title="刷新状态">↻</button>
      </div>
    </div>
  )
}

/* ─── Summary ─── */

function Summary({ state, totalMethods, scanning, loaded }: { state: SidecarState; totalMethods: number; scanning: boolean; loaded: boolean }) {
  const dot = statusColor(state)
  const label = statusLabel(state)
  const stats = state.scanned ? ` · ${totalMethods.toLocaleString()} 方法` : ''
  const scanMsg = scanning ? '扫描中…' : !loaded ? '点击扫描开始分析' : ''

  return (
    <div className="cg-summary">
      <span className="cg-dot" style={{ background: dot }} title={state.detail} />
      <span className="cg-status">{label}</span>
      <span className="cg-stats">{stats}</span>
      {scanMsg && <span className="cg-scan-msg">{scanMsg}</span>}
    </div>
  )
}

/* ─── Filter ─── */

function Filter({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="cg-filter">
      <span className="cg-filter-icon">🔍</span>
      <input
        className="cg-filter-input"
        type="text"
        placeholder="搜索类或方法…"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      />
      {value && <span className="cg-filter-clear" onClick={() => onChange('')}>✕</span>}
    </div>
  )
}

/* ─── Class Tree ─── */

function ClassTree({
  tree, filter, expandedClasses, expandedMethods,
  onToggleClass, onToggleMethod, getChain,
}: {
  tree: Map<string, { method: string; full: string }[]>
  filter: string
  expandedClasses: Set<string>
  expandedMethods: Set<string>
  onToggleClass: (cls: string) => void
  onToggleMethod: (full: string) => void
  getChain: (full: string, type: 'callers' | 'callees') => ChainData | null
}) {
  const entries = filter
    ? Array.from(tree.entries()).filter(([cls, methods]) =>
        cls.toLowerCase().includes(filter.toLowerCase()) ||
        methods.some(m => m.method.toLowerCase().includes(filter.toLowerCase()))
      )
    : Array.from(tree.entries())

  if (entries.length === 0) {
    return <div className="cg-empty">{filter ? '无匹配结果' : '暂无数据'}</div>
  }

  return (
    <div className="cg-tree">
      {entries.map(([cls, methods]) => (
        <div key={cls} className="cg-class">
          <div className="cg-class-name" onClick={() => onToggleClass(cls)}>
            <span className={`cg-arrow ${expandedClasses.has(cls) ? 'expanded' : ''}`}>▶</span>
            <span>{cls}</span>
            <span className="cg-count">{methods.length}</span>
          </div>
          {expandedClasses.has(cls) && (
            <div className="cg-methods">
              {methods.filter(m => !filter || m.method.toLowerCase().includes(filter.toLowerCase())).map((m, i) => (
                <MethodNode
                  key={i}
                  entry={m}
                  expanded={expandedMethods.has(m.full)}
                  onToggle={() => onToggleMethod(m.full)}
                  getChain={getChain}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Method Node ─── */

function MethodNode({
  entry, expanded, onToggle, getChain,
}: {
  entry: { method: string; full: string }
  expanded: boolean
  onToggle: () => void
  getChain: (full: string, type: 'callers' | 'callees') => ChainData | null
}) {
  const callers = getChain(entry.full, 'callers')
  const callees = getChain(entry.full, 'callees')
  const loading = expanded && !callers && !callees

  return (
    <div className="cg-method">
      <div className="cg-method-name" onClick={onToggle}>
        <span className={`cg-arrow-sm ${expanded ? 'expanded' : ''}`}>▶</span>
        <span className="cg-method-label">{entry.method}</span>
        {expanded && callers && <span className="cg-chain-count">↑{callers.items.length}</span>}
        {expanded && callees && <span className="cg-chain-count">↓{callees.items.length}</span>}
      </div>
      {expanded && (
        <div className="cg-chain">
          {loading && <div className="cg-chain-loading">查询中…</div>}
          {callers && callers.items.length > 0 && (
            <div className="cg-chain-group">
              <div className="cg-chain-label">↑ 调用方</div>
              {callers.items.slice(0, 10).map((item, i) => (
                <div key={i} className="cg-chain-item" title={item.method}>
                  <span className="cg-chain-caller">{shortMethod(item.method)}</span>
                  {item.related.length > 0 && <span className="cg-chain-path">→ {item.related.length}</span>}
                </div>
              ))}
              {callers.items.length > 10 && <div className="cg-chain-more">… 还有 {callers.items.length - 10} 条</div>}
            </div>
          )}
          {callees && callees.items.length > 0 && (
            <div className="cg-chain-group">
              <div className="cg-chain-label">↓ 被调用方</div>
              {callees.items.slice(0, 10).map((item, i) => (
                <div key={i} className="cg-chain-item" title={item.method}>
                  <span className="cg-chain-callee">{shortMethod(item.method)}</span>
                  {item.related.length > 0 && <span className="cg-chain-path">→ {item.related.length}</span>}
                </div>
              ))}
              {callees.items.length > 10 && <div className="cg-chain-more">… 还有 {callees.items.length - 10} 条</div>}
            </div>
          )}
          {callers && callees && callers.items.length === 0 && callees.items.length === 0 && (
            <div className="cg-chain-empty">无上下游调用</div>
          )}
        </div>
      )}
    </div>
  )
}

function shortMethod(full: string): string {
  const ci = full.indexOf(':')
  return ci > 0 ? full.slice(ci + 1) : full
}

/* ─── Main ─── */

/* ─── JAR 选择对话框 ─── */

const PAGE_SIZE = 50

function JarPicker({
  dirs, selected, filter, onToggle, onFilter, onConfirm, onCancel, onRefresh,
}: {
  dirs: string[]; selected: Set<number>; filter: string;
  onToggle: (i: number) => void; onFilter: (v: string) => void;
  onConfirm: () => void; onCancel: () => void;
  onRefresh?: () => void;
}) {
  const [page, setPage] = useState(0)
  const filtered = filter
    ? dirs.map((d, i) => ({ d, i })).filter(x => x.d.toLowerCase().includes(filter.toLowerCase()))
    : dirs.map((d, i) => ({ d, i }))
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="cg-overlay" onClick={onCancel}>
      <div className="cg-picker" onClick={e => e.stopPropagation()}>
        <div className="cg-picker-header">选择要扫描的 JAR（最多 3 个）</div>
        {dirs.length === 0 ? (
          <div className="cg-picker-loading">
            <p>正在获取项目 JAR 列表…</p>
            <button className="cg-btn" onClick={onRefresh} style={{ marginTop: 12 }}>🔄 重新查询</button>
          </div>
        ) : (
          <>
            <div className="cg-picker-search">
              <input type="text" placeholder="🔍 搜索 JAR 文件名…" value={filter}
                onChange={e => { onFilter(e.target.value); setPage(0) }} autoFocus />
            </div>
            <div className="cg-picker-list">
              {pageItems.map(({ d, i }) => (
                <label key={i} className={`cg-picker-item ${selected.has(i) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selected.has(i)}
                    onChange={() => onToggle(i)}
                    disabled={!selected.has(i) && selected.size >= 3} />
                  <span className="cg-picker-name">{d.replace(/.*[\\/]/, '')}</span>
                  <span className="cg-picker-path">{d}</span>
                </label>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="cg-picker-pager">
                <button className="cg-btn" disabled={page <= 0} onClick={() => setPage(page - 1)}>◀ 上一页</button>
                <span className="cg-pager-info">{page + 1}/{totalPages} 页 · {filtered.length} 项</span>
                <button className="cg-btn" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>下一页 ▶</button>
              </div>
            )}
            <div className="cg-picker-footer">
              <span className="cg-picker-count">{selected.size}/3 已选</span>
              <div className="cg-picker-actions">
                <button className="cg-btn" onClick={onCancel}>取消</button>
                <button className="cg-btn cg-btn-primary" disabled={selected.size === 0}
                  onClick={onConfirm}>开始扫描</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── 主组件 ─── */

export default function CallGraphPanel() {
  const h = useCallGraphState()

  return (
    <div className="cg-app">
      {h.showPicker && (
        <JarPicker
          dirs={h.availableDirs}
          selected={h.selectedDirs}
          filter={h.jarFilter}
          onToggle={h.toggleJar}
          onFilter={h.setJarFilter}
          onConfirm={h.confirmScan}
          onCancel={() => h.setShowPicker(false)}
          onRefresh={h.doScan}
        />
      )}
      <Header scanning={h.scanning} onScan={h.doScan} onRefresh={h.doRefresh} />

      {h.state.status !== 'not_started' && (
        <Summary state={h.state} totalMethods={h.totalMethods} scanning={h.scanning} loaded={h.loaded} />
      )}

      {h.loaded && (
        <Filter value={h.searchFilter} onChange={h.setSearchFilter} disabled={!h.loaded} />
      )}

      {h.scanning && !h.loaded && (
        <div className="cg-scanning">
          <div className="cg-spinner"></div>
          <span>{h.progressMsg || '正在扫描…'}</span>
        </div>
      )}

      {h.loaded ? (
        <ClassTree
          tree={h.filteredTree}
          filter={h.searchFilter}
          expandedClasses={h.expandedClasses}
          expandedMethods={h.expandedMethods}
          onToggleClass={h.toggleClass}
          onToggleMethod={h.toggleMethod}
          getChain={h.getChain}
        />
      ) : !h.scanning && (
        <div className="cg-empty">
          {h.state.status === 'ready' ? '点击扫描开始分析' : '等待侧车就绪…'}
        </div>
      )}
    </div>
  )
}
