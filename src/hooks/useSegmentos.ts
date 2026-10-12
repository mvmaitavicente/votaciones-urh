import { useEffect, useState } from 'react'
import { obtenerSegmentos } from '../services/catalogosService'
import { InsforgeError } from '../services/insforgeClient'
import type { Segmento } from '../types/catalogos'

export function useSegmentos() {
  const [revision, setRevision] = useState(0)
  const [estado, setEstado] = useState<{
    segmentos: Segmento[]; cargando: boolean; error: string | null; latenciaMs: number | null
  }>({ segmentos: [], cargando: true, error: null, latenciaMs: null })

  useEffect(() => {
    const controller = new AbortController()
    const inicio = performance.now()
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000)
    obtenerSegmentos(controller.signal).then(({ datos, latenciaMs }) => {
      if (!controller.signal.aborted) {
        setEstado({ segmentos: datos, cargando: false, error: null, latenciaMs })
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return
      setEstado({
        segmentos: [], cargando: false,
        error: controller.signal.reason === 'timeout'
          ? 'La consulta tardó demasiado. Intenta actualizar los datos.'
          : error instanceof InsforgeError ? `${error.message} (${error.codigo})`
            : 'No se pudo cargar el catálogo. Intenta actualizar los datos.',
        latenciaMs: Math.round(performance.now() - inicio),
      })
    }).finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [revision])

  function actualizar() {
    setEstado({ segmentos: [], cargando: true, error: null, latenciaMs: null })
    setRevision((actual) => actual + 1)
  }
  return { ...estado, actualizar }
}
