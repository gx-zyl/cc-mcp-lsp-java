import { useState } from 'react'
import { postMessage } from '../shared/hooks'

type Tab = 'search' | 'source'

export default function TestPanel() {
  const [tab, setTab] = useState<Tab>('search')
  const [searchName, setSearchName] = useState('')
  const [searchMode, setSearchMode] = useState('strict')
  const [sourceFqn, setSourceFqn] = useState('')
  const [sourceMode, setSourceMode] = useState('strict')

  return (
    <div className="app">
      {/* Tabs */}
      <div className="tabs">
        <div
          className={`tab ${tab === 'search' ? 'active' : ''}`}
          onClick={() => setTab('search')}
        >
          搜索类型
        </div>
        <div
          className={`tab ${tab === 'source' ? 'active' : ''}`}
          onClick={() => setTab('source')}
        >
          获取源码
        </div>
      </div>

      {/* Search Panel */}
      {tab === 'search' && (
        <div>
          <div className="field">
            <label>类型名称</label>
            <input
              type="text"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder="如 ArrayList, Service"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>匹配模式</label>
            <select value={searchMode} onChange={e => setSearchMode(e.target.value)}>
              <option value="strict">精确 (strict)</option>
              <option value="fuzzy">模糊 (fuzzy)</option>
            </select>
          </div>
          <button className="btn-run" onClick={handleSearch}>
            &#9654; 搜索
          </button>
        </div>
      )}

      {/* Source Panel */}
      {tab === 'source' && (
        <div>
          <div className="field">
            <label>类名</label>
            <input
              type="text"
              value={sourceFqn}
              onChange={e => setSourceFqn(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSource() }}
              placeholder="如 java.util.ArrayList, StringUtils"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>匹配模式</label>
            <select value={sourceMode} onChange={e => setSourceMode(e.target.value)}>
              <option value="strict">精确 (FQN)</option>
              <option value="fuzzy">模糊</option>
            </select>
          </div>
          <button className="btn-run" onClick={handleSource}>
            &#9654; 获取源码
          </button>
        </div>
      )}
    </div>
  )

  function handleSearch() {
    const name = searchName.trim()
    if (!name) return
    postMessage({ type: 'search', name, fuzzy: searchMode === 'fuzzy' })
  }

  function handleSource() {
    const fqn = sourceFqn.trim()
    if (!fqn) return
    postMessage({ type: 'getSource', fqn, fuzzy: sourceMode === 'fuzzy' })
  }
}
