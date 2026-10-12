import { useEffect, useState } from 'react'
import { obtenerIdentidadUsuario } from '../services/identidadService'
import { verificarAcceso } from '../services/accessService'
import type { AccessResponse } from '../types/access'

type AccessState = { status: 'loading' | 'denied' | 'authorized' | 'error'; access: AccessResponse | null }

export function useAccess() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<AccessState>({ status: 'loading', access: null })
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    obtenerIdentidadUsuario().then((identity) => {
      if (!active) throw new Error('UNMOUNTED')
      return verificarAcceso(identity, controller.signal)
    }).then((access) => {
      if (active) setState({ status: access.autorizado ? 'authorized' : 'denied', access })
    }).catch(() => {
      if (active) setState({ status: 'error', access: null })
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [attempt])
  return { ...state, retry: () => { setState({ status: 'loading', access: null }); setAttempt((value) => value + 1) } }
}
