import { consultarCatalogo, InsforgeError } from './insforgeClient'
import type { CatalogoResultado, Segmento, SegmentoRegistro } from '../types/catalogos'

function esSegmento(value: unknown): value is SegmentoRegistro {
  if (!value || typeof value !== 'object') return false
  return 'id_segmento' in value && Number.isSafeInteger(value.id_segmento)
    && 'dsc_segmento' in value && (value.dsc_segmento === null || typeof value.dsc_segmento === 'string')
    && 'ord_segmento' in value && (value.ord_segmento === null || Number.isSafeInteger(value.ord_segmento))
}

export async function obtenerSegmentos(signal: AbortSignal): Promise<CatalogoResultado<Segmento>> {
  const inicio = performance.now()
  const datos: Segmento[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const registros = await consultarCatalogo('segmento', new URLSearchParams({
      select: 'id_segmento,dsc_segmento,ord_segmento',
      order: 'ord_segmento.asc.nullslast,id_segmento.asc',
      limit: String(pageSize), offset: String(offset),
    }), signal)
    if (!Array.isArray(registros) || !registros.every(esSegmento)) {
      throw new InsforgeError('InsForge devolvió un catálogo con un formato inesperado.', 0, 'INVALID_RESPONSE')
    }
    datos.push(...registros.map((registro) => ({
      id: registro.id_segmento,
      nombre: registro.dsc_segmento?.trim() || `Segmento ${registro.id_segmento}`,
      orden: registro.ord_segmento,
    })))
    if (registros.length < pageSize) break
  }
  return { datos, latenciaMs: Math.round(performance.now() - inicio) }
}
