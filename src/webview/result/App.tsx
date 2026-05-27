import { useState, useMemo, useCallback, useEffect } from 'react'
import { getVscodeApi } from '../shared/vscode-api'
import type { SearchResultItem } from '../shared/types'

/* ───────── 运行时数据 ───────── */

interface SearchData {
  type: 'search'
  query: string
  items: SearchResultItem[]
}

interface SourceData {
  type: 'source'
  fqn: string
  filePath: string
  uri: string
  source: string
}

type PanelData = SearchData | SourceData

/* ───────── 主组件 ───────── */

export default function ResultPanel() {
  const [data, setData] = useState<PanelData | null>(null)

  useEffect(() => {
    // 主动请求已有结果（防 postMessage 竞态）
    getVscodeApi().postMessage({ type: 'requestResult' })

    // 监听来自扩展的消息
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'searchResult') {
        const d: SearchData = { type: 'search', query: msg.query, items: msg.items }
        setData(d)
        getVscodeApi().setState(d)
      } else if (msg.type === 'sourceResult') {
        const d: SourceData = { type: 'source', fqn: msg.fqn, filePath: msg.filePath, uri: msg.uri, source: msg.source }
        setData(d)
        getVscodeApi().setState(d)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  if (!data) {
    return <div className="empty-state">等待查询结果...</div>
  }

  return data.type === 'search' ? (
    <SearchResults data={data} />
  ) : (
    <SourceView data={data} />
  )
}

/* ───────── 搜索结果显示 ───────── */

function SearchResults({ data }: { data: SearchData }) {
  const { items, query } = data
  const totalSrc = items.filter(i => i.source === 'src').length
  const totalJar = items.filter(i => i.source === 'JAR').length
  const kinds = useMemo(() => [...new Set(items.map(i => i.kind))].sort(), [items])

  const [filterKind, setFilterKind] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [filterText, setFilterText] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [sortAsc, setSortAsc] = useState(true)
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // 点击外部关闭 tooltip
  useEffect(() => {
    const handler = () => setTooltipIdx(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const filtered = useMemo(() => {
    let result = items.filter(item =>
      (filterKind === 'all' || item.kind === filterKind) &&
      (filterSource === 'all' || item.source === filterSource) &&
      (!filterText || item.fqn.toLowerCase().includes(filterText.toLowerCase()) || item.kind.toLowerCase().includes(filterText.toLowerCase()))
    )
    if (sortKey) {
      result = [...result].sort((a, b) => {
        let va: string = (a as any)[sortKey]
        let vb: string = (b as any)[sortKey]
        if (typeof va === 'string') va = va.toLowerCase()
        if (typeof vb === 'string') vb = vb.toLowerCase()
        return va < vb ? (sortAsc ? -1 : 1) : va > vb ? (sortAsc ? 1 : -1) : 0
      })
    }
    return result
  }, [items, filterKind, filterSource, filterText, sortKey, sortAsc])

  const openFile = useCallback((uri: string, line: number) => {
    getVscodeApi().postMessage({ type: 'openFile', uri, line })
  }, [])

  const handleCopyPath = useCallback((path: string, idx: number) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    })
  }, [])

  return (
    <div className="app">
      <h1>类型搜索: {query}</h1>
      <p className="summary">
        共 <strong>{items.length}</strong> 个类型
        <span className="summary-src">&#9679; {totalSrc} 项目源码</span>
        <span className="summary-jar">&#9679; {totalJar} JAR 依赖</span>
      </p>

      <div className="filters">
        <label>种类</label>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)}>
          <option value="all">全部</option>
          {kinds.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <label>来源</label>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="all">全部</option>
          <option value="src">项目源码</option>
          <option value="JAR">JAR 依赖</option>
        </select>
        <label>搜索</label>
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="名称过滤..."
          className="filter-input"
        />
        <span className="count">显示 {filtered.length}/{items.length}</span>
      </div>

      <table>
        <thead>
          <tr>
            <Th sortKey="kind" label="种类" current={sortKey} asc={sortAsc} onSort={handleSort} />
            <Th sortKey="fqn" label="全限定名" current={sortKey} asc={sortAsc} onSort={handleSort} wide />
            <Th sortKey="source" label="来源" current={sortKey} asc={sortAsc} onSort={handleSort} />
            <th>位置</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item, i) => {
            const itemIdx = items.indexOf(item)
            return (
              <tr key={i}>
                <td><span className={`tag-kind ${item.kind}`}>{item.kind}</span></td>
                <td className="cell-fqn">{item.fqn}</td>
                <td><span className={`tag-${item.source}`}>{item.source === 'src' ? '项目源码' : 'JAR 依赖'}</span></td>
                <td className="loc">
                  {item.source === 'src' ? (
                    <span className="loc-cell">
                      <a href="#" onClick={e => { e.preventDefault(); openFile(item.uri, item.line) }}>
                        {item.relPath}
                      </a>
                      <span className="line">:{item.line}</span>
                      <button
                        className={`detail-btn ${tooltipIdx === itemIdx ? 'active' : ''}`}
                        onClick={e => { e.stopPropagation(); setTooltipIdx(tooltipIdx === itemIdx ? null : itemIdx) }}
                      >
                        详情
                      </button>
                      <div className={`loc-tooltip ${tooltipIdx === itemIdx ? 'visible' : ''}`}
                        onClick={e => e.stopPropagation()}>
                        <code className="loc-tooltip-path">{item.location}</code>
                        <span className="line">:{item.line}</span>
                        <button
                          className={`loc-copy-btn ${copiedIdx === itemIdx ? 'copied' : ''}`}
                          onClick={() => handleCopyPath(`${item.location}:${item.line}`, itemIdx)}
                        >
                          {copiedIdx === itemIdx ? '✓ 已复制' : '复制路径'}
                        </button>
                      </div>
                    </span>
                  ) : (
                    <span className="loc-cell">
                      <span className="loc-jar">{item.location}</span>
                      <button
                        className={`detail-btn ${tooltipIdx === itemIdx ? 'active' : ''}`}
                        onClick={e => { e.stopPropagation(); setTooltipIdx(tooltipIdx === itemIdx ? null : itemIdx) }}
                      >
                        详情
                      </button>
                      <div className={`loc-tooltip ${tooltipIdx === itemIdx ? 'visible' : ''}`}
                        onClick={e => e.stopPropagation()}>
                        <code className="loc-tooltip-path">{item.location}</code>
                        <button
                          className={`loc-copy-btn ${copiedIdx === itemIdx ? 'copied' : ''}`}
                          onClick={() => handleCopyPath(item.location, itemIdx)}
                        >
                          {copiedIdx === itemIdx ? '✓ 已复制' : '复制路径'}
                        </button>
                      </div>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }
}

/* ───────── 源码显示 ───────── */

function SourceView({ data }: { data: SourceData }) {
  const { fqn, filePath, uri, source } = data
  const truncated = source.length > 10000
  const body = truncated ? source.substring(0, 10000) : source

  return (
    <div className="app">
      <h1>{fqn}</h1>
      <div className="path">
        <a href="#" onClick={e => { e.preventDefault(); getVscodeApi().postMessage({ type: 'openFile', uri, line: 1 }) }}>
          {filePath}
        </a>
      </div>
      <pre>{body}</pre>
      {truncated && <div className="truncated">源码超过 10000 字符，已截断。</div>}
    </div>
  )
}

/* ───────── 子组件 / 工具 ───────── */

function Th({ sortKey, label, current, asc, onSort, wide }: {
  sortKey: string; label: string; current: string; asc: boolean; onSort: (k: string) => void; wide?: boolean
}) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={wide ? { width: '50%' } : undefined}
    >
      {label} {current === sortKey ? (asc ? '▲' : '▼') : ''}
    </th>
  )
}
