export interface Segmento {
  id: number
  nombre: string
  orden: number | null
}

export interface SegmentoRegistro {
  id_segmento: number
  dsc_segmento: string | null
  ord_segmento: number | null
}

export interface CatalogoResultado<T> {
  datos: T[]
  latenciaMs: number
}
