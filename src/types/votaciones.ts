export interface Evento { id_evento:number; dsc_evento:string; fecha_inicio:string|null; fecha_fin:string|null; estado:'BORRADOR'|'ABIERTO'|'CERRADO'; resultados_publicados:boolean; resultados_en_vivo:boolean; dsc_sub_titulo:string|null; dsc_mensaje:string|null }
export interface SegmentoConfig { id_segmento:number; dsc_segmento:string; ord_segmento:number }
export interface Padron { id_padron:number; id_evento:number; id_segmento:number; nom_padron:string; dsc_padron:string|null }
export interface Candidatura { id_candidatura:number; foto_url:string|null; foto_key:string|null; id_persona:number|null; id_evento:number; id_segmento:number; dsc_nombre_completo:string; dsc_cargo:string|null; dsc_unidad:string|null; estado:string }
export interface Opcion { id_opcion_electoral:number; id_padron:number; id_candidatura:number|null; tipo_opcion:string; nombre:string; orden:number; activo:boolean; candidatura?:string; cargo?:string; unidad?:string|null; foto_url?:string|null }
export interface Trabajador { id_personal:number; nombre:string; activo:boolean }
export interface UsuarioConfig { id_usuario:number; id_persona:number|null; nombre:string; activo:boolean }
export interface Asignacion { id_padron_detalle:number; id_padron:number; id_persona:number; habilitado:boolean }
export interface AdminData { eventos:Evento[]; segmentos:SegmentoConfig[]; padrones:Padron[]; candidaturas:Candidatura[]; opciones:Opcion[]; trabajadores:Trabajador[]; usuarios:UsuarioConfig[]; asignaciones:Asignacion[] }
export interface MiPadron { id_padron:number; nom_padron:string; id_evento:number; evento:string; dsc_sub_titulo:string|null; dsc_mensaje:string|null; nombre_completo?:string|null; unidad_organica?:string|null; correo?:string|null; dsc_segmento?:string|null; fecha_inicio:string|null; fecha_fin:string|null; estado:string; disponible:boolean; ya_voto:boolean; fecha_voto?:string|null; resultados_publicados:boolean }
export type FunctionalRole='ADMINISTRADOR'|'ELECTOR'|'SUPERVISOR'
export interface FunctionalAccess { autorizado:boolean; estado:string; usuario:{id_usuario:number;nombre:string}; roles:FunctionalRole[]; modo:'FASE_FUNCIONAL_GUID' }
export type ResultsData=Pick<AdminData,'eventos'|'segmentos'|'padrones'>&{opciones:{id_opcion_electoral:number;foto_url?:string|null}[]}
export interface ParticipacionDetalle { id_padron_detalle?:number; nombre:string; ya_voto:boolean; unidad_organica?:string|null; correo?:string|null; segmento?:string|null }
export interface Participacion { habilitados:number; participantes:number; detalle:ParticipacionDetalle[] }
export interface Resultado { id_opcion_electoral:number; nombre:string; tipo_opcion:string; votos:number }
export interface ResumenSegmento { id_segmento:number; nombre:string; habilitados:number; participantes:number; resultados:Resultado[] }
export interface ResumenEvento { version:1; id_evento:number; habilitados:number; participantes:number; resultados_disponibles:boolean; segmentos:ResumenSegmento[] }
