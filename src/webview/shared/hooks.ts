import { useEffect, useRef } from 'react'
import { getVscodeApi } from './vscode-api'
import type { VscodeMessage } from './types'

export function useVscodeListener(handler: (msg: VscodeMessage) => void) {
  const savedHandler = useRef(handler)
  savedHandler.current = handler

  useEffect(() => {
    const onMessage = (e: MessageEvent<VscodeMessage>) => {
      savedHandler.current(e.data)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
}

export function postMessage(msg: VscodeMessage) {
  getVscodeApi().postMessage(msg)
}

export function useRequestStatus() {
  useEffect(() => {
    postMessage({ type: 'requestStatus' })
  }, [])
}
