import type { VscodeMessage } from './types'

interface VscodeApi {
  postMessage(msg: VscodeMessage): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VscodeApi

let _api: VscodeApi | null = null

export function getVscodeApi(): VscodeApi {
  if (!_api) {
    _api = acquireVsCodeApi()
  }
  return _api
}
