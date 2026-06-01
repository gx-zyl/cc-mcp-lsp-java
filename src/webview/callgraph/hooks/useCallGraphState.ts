import { useState, useEffect, useRef, useCallback } from 'react'
import { useVscodeListener, postMessage } from '../../shared/hooks'

/* ─── 类型 ─── */

export interface SidecarState {
  running: boolean; scanned: boolean; dbDir: string; projectId: string
  inputDirs: string[]; dbFileSize: number; classpathCount: number
  projects: { name: string; index: number }[]
  status: string; detail: string; restartCount: number
  activeProjectIndex: number
}

export interface ChainData {
  type: 'callers' | 'callees'
  items: { method: string; related: string[] }[]
}

interface ClassEntry { method: string; full: string }

/* ─── 工具 ─── */

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

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

export function statusLabel(s: SidecarState): string {
  switch (s.status) {
    case 'ready': return s.scanned ? '已就绪' : '待扫描'
    case 'starting': return '启动中…'
    case 'jar_missing': return 'JAR 缺失'
    case 'timeout': return '启动超时'
    case 'crashed': return '已崩溃'
    case 'stopped': return '已停止'
    case 'error': return '启动失败'
    default: return '未启动'
  }
}

export function statusColor(s: SidecarState): string {
  switch (s.status) {
    case 'ready': return 'var(--green)'
    case 'starting': return 'var(--orange)'
    default: return 'var(--red)'
  }
}

/* ─── Hook ─── */

export function useCallGraphState() {
  const [state, setState] = useState<SidecarState>({
    running: false, scanned: false, dbDir: '', projectId: '',
    inputDirs: [], dbFileSize: 0, classpathCount: 0, projects: [],
    status: 'not_started', detail: '侧车未启动', restartCount: 0, activeProjectIndex: 0,
  })
  const [searchFilter, setSearchFilter] = useState('')
  const [classTree, setClassTree] = useState<Map<string, ClassEntry[]>>(new Map())
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set())
  const [chainCache, setChainCache] = useState<Map<string, ChainData>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [availableDirs, setAvailableDirs] = useState<string[]>([])
  const [selectedDirs, setSelectedDirs] = useState<Set<number>>(new Set())
  const [jarFilter, setJarFilter] = useState('')

  // 挂载后请求状态
  useEffect(() => {
    postMessage({ type: 'requestSidecarStatus' })
    const timer = setInterval(() => postMessage({ type: 'requestSidecarStatus' }), 5000)
    return () => clearInterval(timer)
  }, [])

  // 消息处理
  const handlerRef = useRef<(msg: any) => void>(() => {})
  handlerRef.current = (msg: any) => {
    if (msg.type === 'sidecarStatus') {
      setState(msg.data)
      if (msg.data.scanned && !loaded) {
        postMessage({ type: 'sidecarQuery', queryType: 'list', query: '' })
      }
    }
    if (msg.type === 'sidecarProgress') {
      setProgressMsg(msg.message || '')
    }
    if (msg.type === 'classpathResult') {
      const dirs: string[] = msg.dirs || [];
      setAvailableDirs(dirs);
      if (dirs.length === 0) {
        setShowPicker(false);
        setProgressMsg('无可用 JAR/class 文件');
      } else {
        // 默认选前 3 个
        setSelectedDirs(new Set([0, 1, 2].filter(i => i < dirs.length)));
      }
    }
    if (msg.type === 'queryResult') {
      if (msg.queryType === 'list') {
        setClassTree(parseClassTree(msg.data || []))
        setLoaded(true)
        setScanning(false)
        setSearchFilter('')
      } else {
        // 调用链查询结果缓存
        const key = msg.query + ':' + msg.queryType
        setChainCache(prev => {
          const next = new Map(prev)
          next.set(key, { type: msg.queryType, items: msg.data || [] })
          return next
        })
      }
    }
  }
  useVscodeListener(useCallback((msg: any) => handlerRef.current(msg), []))

  /* ─── 操作 ─── */

  function toggleJar(idx: number) {
    setSelectedDirs(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) } else {
        if (next.size >= 3) return prev // 最多 3 个
        next.add(idx)
      }
      return next
    })
  }

  function confirmScan() {
    const dirs = Array.from(selectedDirs).sort().map(i => availableDirs[i])
    setShowPicker(false)
    setScanning(true)
    setLoaded(false)
    setClassTree(new Map())
    setExpandedClasses(new Set())
    setExpandedMethods(new Set())
    setChainCache(new Map())
    // 用用户选择的 dirs 做扫描
    postMessage({ type: 'startSidecarScan', dirs })
  }

  function doScan() {
    // 先请求 classpath，再弹出选择框
    setShowPicker(true)
    setJarFilter('')
    postMessage({ type: 'requestClasspath' })
  }

  function doRefresh() {
    postMessage({ type: 'requestSidecarStatus' })
  }

  function toggleClass(cls: string) {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(cls)) next.delete(cls); else next.add(cls)
      return next
    })
  }

  function toggleMethod(full: string) {
    setExpandedMethods(prev => {
      const next = new Set(prev)
      if (next.has(full)) {
        next.delete(full)
      } else {
        next.add(full)
        // 如果还没缓存，发起查询
        if (!chainCache.has(full + ':callers')) {
          postMessage({ type: 'sidecarQuery', queryType: 'callers', query: full })
        }
        if (!chainCache.has(full + ':callees')) {
          postMessage({ type: 'sidecarQuery', queryType: 'callees', query: full })
        }
      }
      return next
    })
  }

  function getChain(full: string, type: 'callers' | 'callees'): ChainData | null {
    return chainCache.get(full + ':' + type) || null
  }

  // 过滤后的类树
  const filteredTree = searchFilter
    ? new Map(Array.from(classTree.entries()).filter(([cls]) =>
        cls.toLowerCase().includes(searchFilter.toLowerCase()) ||
        classTree.get(cls)?.some(m => m.method.toLowerCase().includes(searchFilter.toLowerCase()))
      ))
    : classTree

  const totalMethods = Array.from(classTree.values()).reduce((sum, m) => sum + m.length, 0)

  return {
    state, searchFilter, classTree, filteredTree, expandedClasses,
    expandedMethods, scanning, progressMsg, loaded, totalMethods, chainCache,
    showPicker, availableDirs, selectedDirs, jarFilter,
    setSearchFilter, setJarFilter,
    setShowPicker,
    doScan, doRefresh, toggleClass, toggleMethod, getChain,
    toggleJar, confirmScan,
  }
}
