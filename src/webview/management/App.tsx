import { useState, useCallback } from 'react'
import type { ServerInfo, ConnectionRecord } from '../shared/types'
import { useVscodeListener, postMessage, useRequestStatus } from '../shared/hooks'

/* ───────── 工具函数 ───────── */

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtDuration(start: number, end?: number): string {
  if (!end) return '进行中'
  const sec = Math.round((end - start) / 1000)
  if (sec < 60) return sec + '秒'
  if (sec < 3600) return Math.floor(sec / 60) + '分' + (sec % 60) + '秒'
  return Math.floor(sec / 3600) + '时' + Math.floor((sec % 3600) / 60) + '分'
}

/* ───────── 主组件 ───────── */

export default function ManagementPanel() {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [port, setPort] = useState('38765')

  const handleMessage = useCallback((msg: { type: string; data?: ServerInfo }) => {
    if (msg.type === 'status' && msg.data) {
      setInfo(msg.data)
      setPort(String(msg.data.port))
    }
  }, [])

  useVscodeListener(handleMessage)
  useRequestStatus()

  const running = info?.running ?? false

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <span className={`status-dot ${running ? 'running' : 'stopped'}`} />
        <h1>MCP LSP Java</h1>
        <span className="status-text">{running ? '运行中' : '已停止'}</span>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-label">监听</div>
          <div className="stat-value">
            {running && info ? `${info.host}:${info.port}` : '-'}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">会话</div>
          <div className="stat-value">
            {info?.sessions ?? 0}
            <span className="sub">活跃</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="section">
        <div className="section-title">控制</div>
        <div className="controls">
          <button className="btn primary" disabled={running} onClick={() => postMessage({ type: 'start' })}>
            启动
          </button>
          <button className="btn" disabled={!running} onClick={() => postMessage({ type: 'restart' })}>
            重启
          </button>
          <button className="btn danger" disabled={!running} onClick={() => postMessage({ type: 'stop' })}>
            停止
          </button>
          <div className="port-group">
            <span>端口</span>
            <input
              type="number"
              value={port}
              min={1024}
              max={65535}
              onChange={e => setPort(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleChangePort() }}
            />
          </div>
          <button className="btn" style={{ fontSize: 10 }} onClick={handleChangePort}>
            变更
          </button>
        </div>
      </div>

      {/* Connection History */}
      <div className="section">
        <div className="section-title">连接历史</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>会话</th>
                <th>建立</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {sortedConnections().length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">暂无记录</td>
                </tr>
              ) : (
                sortedConnections().map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>
                      {c.id.substring(0, 8)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(c.startTime)}</td>
                    <td>
                      <span className={`tag ${!c.endTime ? 'active' : 'closed'}`}>
                        {!c.endTime ? '活跃' : '已关闭'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restart History */}
      <div className="section">
        <div className="section-title">重启历史</div>
        <div className="log-list">
          {(info?.restartHistory?.length ?? 0) === 0 ? (
            <div className="empty">暂无记录</div>
          ) : (
            [...(info?.restartHistory ?? [])].reverse().slice(0, 20).map((r, i) => (
              <div key={i} className="log-item">{r}</div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  function handleChangePort() {
    const p = parseInt(port, 10)
    if (isNaN(p) || p < 1024 || p > 65535) return
    postMessage({ type: 'changePort', port: p })
  }

  function sortedConnections(): ConnectionRecord[] {
    if (!info?.connections) return []
    return [...info.connections].sort((a, b) => b.startTime - a.startTime)
  }
}
