import { useState, useEffect, useRef, useCallback } from 'react'
import { useVscodeListener, postMessage } from '../../shared/hooks'

/* ─── 类型 ─── */

export interface ProjectInfo { name: string; index: number }

export interface SidecarState {
  running: boolean; scanned: boolean; dbDir: string; projectId: string
  inputDirs: string[]; dbFileSize: number; classpathCount: number
  projects: ProjectInfo[]
  status: string; detail: string; restartCount: number
  activeProjectIndex: number
}

interface QueryResult {
  type: 'callers' | 'callees' | 'list'
  data: { method: string; related: string[] }[]
}

interface LogEntry { time: string; text: string; level: 'info' | 'ok' | 'warn' | 'error' }

interface ClassEntry { method: string; full: string }

/* ─── 工具函数 ─── */

export function fmtSize(bytes: number): string {
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

export interface StatusMeta { cls: string; label: string }

export function statusMeta(s: SidecarState): StatusMeta {
  switch (s.status) {
    case 'ready': return { cls: 'dot-ready', label: s.scanned ? '已就绪' : '待扫描' }
    case 'starting': return { cls: 'dot-starting', label: '启动中…' }
    case 'jar_missing': return { cls: 'dot-error', label: 'JAR 缺失' }
    case 'timeout': return { cls: 'dot-error', label: '启动超时' }
    case 'crashed': return { cls: 'dot-error', label: '已崩溃' }
    case 'stopped': return { cls: 'dot-stopped', label: '已停止' }
    case 'error': return { cls: 'dot-error', label: '启动失败' }
    default: return { cls: 'dot-stopped', label: '未启动' }
  }
}

export function statusDotCls(s: SidecarState): string {
  switch (s.status) {
    case 'ready': return 'dot-ready'
    case 'starting': return 'dot-starting'
    case 'jar_missing': case 'timeout': case 'crashed': case 'error': return 'dot-error'
    default: return 'dot-stopped'
  }
}

/* ─── Hook ─── */

export function useCallGraphState() {
  const [isSidebar, setIsSidebar] = useState(true)
  const [state, setState] = useState<SidecarState>({
    running: false, scanned: false, dbDir: '', projectId: '',
    inputDirs: [], dbFileSize: 0, classpathCount: 0, projects: [],
    status: 'not_started', detail: '侧车未启动', restartCount: 0, activeProjectIndex: 0,
  })
  const [progress, setProgress] = useState('')
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'scanning' | 'complete'>('idle')
  const [query, setQuery] = useState('')
  const [queryType, setQueryType] = useState<'callers' | 'callees'>('callers')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [classTree, setClassTree] = useState<Map<string, ClassEntry[]>>(new Map())
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [classFilter, setClassFilter] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const LOG_MAX = 500

  function addLog(text: string, level: LogEntry['level'] = 'info') {
    setLogs(prev => prev.length >= LOG_MAX
      ? [...prev.slice(1), { time: fmtTime(), text, level }]
      : [...prev, { time: fmtTime(), text, level }])
  }

  // 日志自动滚动
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  // 挂载后轮询侧车状态
  useEffect(() => {
    postMessage({ type: 'requestSidecarStatus' })
    const timer = setInterval(() => postMessage({ type: 'requestSidecarStatus' }), 5000)
    return () => clearInterval(timer)
  }, [])

  // 消息处理（通过 ref 保持稳定引用）
  const handlerRef = useRef<(msg: any) => void>(() => {})
  handlerRef.current = (msg: any) => {
    if (msg.type === 'panelConfig') {
      setIsSidebar(msg.isSidebar === true)
    }
    if (msg.type === 'sidecarStatus') {
      setState(msg.data)
      setBusy(false)
      setProgress('')
      if (msg.data.status === 'ready' && msg.data.scanned) setPhase('complete')
      else if (msg.data.status === 'ready') setPhase('idle')
    }
    if (msg.type === 'sidecarProgress') {
      const m = msg.message || ''
      setProgress(m)
      if (m.includes('preparing') || m.includes('Initializing')) setPhase('preparing')
      else if (m.includes('scanning') || m.includes('Parsing')) setPhase('scanning')
      else if (m.includes('complete') || m.includes('Scan complete')) {
        setPhase('complete')
        addLog('✓ 扫描完成！正在加载类结构…', 'ok')
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
  }

  useVscodeListener(useCallback((msg: any) => handlerRef.current(msg), []))

  /* ─── 操作函数 ─── */

  function doScan() {
    setBusy(true); setProgress('正在启动扫描…'); setResult(null); setPhase('preparing')
    setShowBrowser(false); setClassTree(new Map()); setClassFilter('')
    addLog('开始扫描', 'info')
    postMessage({ type: 'startSidecarScan' })
  }

  function doClean() {
    setBusy(true); setProgress('清理中…'); setResult(null); setPhase('idle')
    setShowBrowser(false); setClassTree(new Map()); setClassFilter('')
    addLog('清理缓存', 'warn')
    postMessage({ type: 'cleanSidecarCache' })
  }

  function doQuery() {
    if (!query.trim()) return
    setBusy(true); setResult(null); setShowBrowser(false)
    addLog(`查询 ${queryType}: ${query.trim()}`, 'info')
    postMessage({ type: 'sidecarQuery', queryType, query: query.trim() })
  }

  /** 快速标签查询：不依赖 query state（避免 setState 异步导致的竞态） */
  function quickTagQuery(tag: string) {
    setBusy(true); setResult(null); setShowBrowser(false)
    setQuery(tag)
    addLog(`查询 ${queryType}: ${tag}`, 'info')
    postMessage({ type: 'sidecarQuery', queryType, query: tag })
  }

  function quickQuery(full: string, tp: 'callers' | 'callees' = 'callers') {
    setQuery(full); setQueryType(tp); setShowBrowser(false)
    setBusy(true); setResult(null)
    addLog(`查询 ${tp}: ${full}`, 'info')
    postMessage({ type: 'sidecarQuery', queryType: tp, query: full })
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

  function openInEditor() {
    postMessage({ type: 'openInEditor' })
  }

  const sm = statusMeta(state)
  const totalMethods = Array.from(classTree.values()).reduce((sum, m) => sum + m.length, 0)
  const hasResult = result !== null && result.data.length > 0

  return {
    isSidebar, state, progress, phase, query, queryType,
    result, busy, logs, classTree, expandedClasses, classFilter,
    showBrowser, logEndRef, totalMethods, hasResult, sm,
    setQuery, setQueryType, setClassFilter,
    doScan, doClean, doQuery, quickQuery, quickTagQuery, toggleClass,
    switchProject, openInEditor,
  }
}
