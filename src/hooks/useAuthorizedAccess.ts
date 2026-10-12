import { useEffect, useState } from 'react'
import { verifyAccessFromPowerApps } from '../services/powerAppsAccessService'
import { AccessProblem, type AccessProblemKind, type SecureAccessResponse } from '../types/secureAccess'

export function useAuthorizedAccess() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ status: 'loading' | 'authorized' | AccessProblemKind; access: SecureAccessResponse | null }>({ status: 'loading', access: null })
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
      if (active) setState({ status: 'connection', access: null })
    }, 15000)
    // The SDK cannot abort an in-flight connector call. Late answers are discarded.
    verifyAccessFromPowerApps(controller.signal).then(access => {
      if (active && !controller.signal.aborted) setState({ status: 'authorized', access })
    }).catch(error => {
      if (active && !controller.signal.aborted) setState({ status: error instanceof AccessProblem ? error.kind : 'connection', access: null })
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [attempt])
  return { ...state, retry: () => { setState({ status: 'loading', access: null }); setAttempt(value => value + 1) } }
}
