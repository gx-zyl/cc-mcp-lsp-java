/* ───────── 共享类型定义 ───────── */

export interface ServerInfo {
  running: boolean
  port: number
  host: string
  sessions: number
  connections: ConnectionRecord[]
  restartHistory: string[]
}

export interface ConnectionRecord {
  id: string
  startTime: number
  endTime?: number
}

export interface SearchResultItem {
  kind: string
  fqn: string
  source: 'src' | 'JAR'
  location: string
  relPath: string
  line: number
  uri: string
}

export interface VscodeMessage {
  type: string
  [key: string]: unknown
}
