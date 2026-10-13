import { obtenerIdentidadUsuario } from './identidadService'
import type { FunctionalAction } from '../../functions/functional/api'

export const functionalMode = import.meta.env.VITE_ACCESS_MODE === 'functional'
export class VotingError extends Error {
  readonly code:string
  constructor(code:string) { super(code);this.code=code }
}
const messages:Record<string,string>={FOTO_INVALIDA:'Selecciona una imagen JPG, PNG o WebP de hasta 2 MB.',FOTO_NO_GUARDADA:'No se pudo subir la foto. Intenta nuevamente.',TRABAJADOR_INVALIDO:'Selecciona un trabajador activo.',CANDIDATURA_INVALIDA:'La candidatura seleccionada no es válida.',SIN_ACCESO:'Tu cuenta no tiene acceso.',SIN_ROLES:'Tu cuenta no tiene roles asignados.',PERMISO_INSUFICIENTE:'No tienes permiso para esta operación.',TRABAJADOR_NO_VINCULADO:'Tu cuenta aún no está vinculada a un trabajador. Comunícate con el administrador.',ELECTOR_NO_HABILITADO:'No estás habilitado en este padrón.',EVENTO_CERRADO:'La votación está cerrada o fuera del horario establecido.',YA_VOTO:'Ya registraste tu participación en este padrón.',CONFIGURACION_BLOQUEADA:'La configuración solo puede modificarse mientras el evento está en borrador.',BASE_DE_DATOS_NO_DISPONIBLE:'La operación PostgreSQL no está disponible. Revisa la migración y permisos del servidor.',FASE_FUNCIONAL_DESHABILITADA:'La fase funcional está deshabilitada en el servidor.',TOKEN_AUSENTE:'La función instalada aún requiere JWT. Despliega el handler funcional solo después de aplicar la migración.',SERVICIO_NO_DISPONIBLE:'No se pudo conectar con el servicio.'}
export const votingMessage=(code:string)=>messages[code]??'No se pudo completar la operación. Revisa los datos y vuelve a intentar.'

export async function votingOperation<T>(accion:FunctionalAction,datos:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
  const identity=await obtenerIdentidadUsuario()
  if(!identity.objectId||!identity.tenantId)throw new VotingError('IDENTIDAD_NO_DISPONIBLE')
  const base=new URL(import.meta.env.VITE_FUNCTIONS_BASE_URL||'https://feiztkc9.function2.insforge.app')
  if(base.protocol!=='https:'||base.username||base.password)throw new VotingError('CONFIGURACION_INVALIDA')
  const path=accion==='guardar_foto'?'foto-candidatura':accion==='verificar_acceso'?'verificar-acceso':accion==='emitir_voto'?'emitir-voto':'operacion'
  let response:Response
  try{response=await fetch(new URL('/'+path,base),{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',
    signal:signal??AbortSignal.timeout(60000),body:JSON.stringify({id_object:identity.objectId,id_tenant:identity.tenantId,accion,datos})})}
  catch{throw new VotingError('SERVICIO_NO_DISPONIBLE')}
  const result:unknown=await response.json()
  if(!result||typeof result!=='object'||!('modo' in result)||result.modo!=='FASE_FUNCIONAL_GUID'||!('estado' in result))throw new VotingError(response.status===401?'TOKEN_AUSENTE':'RESPUESTA_INVALIDA')
  if(!response.ok||result.estado!=='OK')throw new VotingError(String(result.estado))
  if(!('data' in result))throw new VotingError('RESPUESTA_INVALIDA')
  return result.data as T
}
