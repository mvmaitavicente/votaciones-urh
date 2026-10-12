// Fase funcional GUID: NO autentica al llamante. Mantener solo en pruebas controladas.
import { uuidPattern } from '../shared/rbac.ts'

export type FunctionalAction = 'verificar_acceso' | 'administracion' | 'guardar_evento' | 'guardar_segmento' | 'guardar_padron' | 'asignar_trabajador' | 'vincular_usuario' | 'guardar_candidatura' | 'guardar_opcion' | 'mis_padrones' | 'opciones' | 'emitir_voto' | 'estado_participacion' | 'participacion' | 'resultados' | 'resultados_publicos'
const actions = new Set<FunctionalAction>(['verificar_acceso','administracion','guardar_evento','guardar_segmento','guardar_padron','asignar_trabajador','vincular_usuario','guardar_candidatura','guardar_opcion','mis_padrones','opciones','emitir_voto','estado_participacion','participacion','resultados','resultados_publicos'])
const businessCodes = new Set(['SIN_ACCESO','SIN_ROLES','PERMISO_INSUFICIENTE','TRABAJADOR_NO_VINCULADO','ELECTOR_NO_HABILITADO','PADRON_INVALIDO','EVENTO_INVALIDO','EVENTO_CERRADO','OPCION_INVALIDA','CANDIDATURA_INVALIDA','SOLICITUD_INVALIDA','FECHAS_INVALIDAS','RESULTADOS_NO_DISPONIBLES','PROCESO_CON_PARTICIPACION','SEGMENTO_INVALIDO','TRABAJADOR_INVALIDO','TRABAJADOR_YA_VINCULADO','USUARIO_INVALIDO','CONFIGURACION_BLOQUEADA','OPERACION_INVALIDA'])
export interface FunctionalRequest { id_object: string; id_tenant: string; accion: FunctionalAction; datos: Record<string, unknown> }
export type FunctionalRpc = (request: FunctionalRequest) => Promise<unknown>
export class FunctionalError extends Error {
  readonly status: number
  constructor(code: string, status = 400) { super(code); this.status = status }
}
export function createFunctionalRpc(baseUrl: string, key: string, fetcher: typeof fetch = fetch): FunctionalRpc {
  const url = new URL('/api/database/rpc/urh_operacion', baseUrl)
  if (url.protocol !== 'https:' || !key.startsWith('ik_')) throw new Error('CONFIGURACION_NO_DISPONIBLE')
  return async request => {
    const response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Accept-Profile': 'urh_votacion', 'Content-Profile': 'urh_votacion', 'Content-Type':'application/json' },
      body: JSON.stringify({ p_object: request.id_object, p_tenant: request.id_tenant, p_accion: request.accion, p_datos: request.datos }), signal: AbortSignal.timeout(15000) })
    const body: unknown = await response.json()
    if (!response.ok) {
      const message = body && typeof body==='object' && 'message' in body && typeof body.message==='string' ? body.message : ''
      const code = [...businessCodes].find(code => message === code || message.endsWith(': '+code))
      if (code) throw new FunctionalError(code, ['SIN_ACCESO','SIN_ROLES','PERMISO_INSUFICIENTE'].includes(code)?403:400)
      throw new FunctionalError('BASE_DE_DATOS_NO_DISPONIBLE',503)
    }
    return body
  }
}
export function createFunctionalHandler(options: { enabled: boolean; expiresAt?:number; allowedOrigins: string[]; allowedIdentities: string[]; rpc: FunctionalRpc; fixedAction?: FunctionalAction }) {
  const origins = new Set(options.allowedOrigins)
  if (origins.has('*')) throw new Error('INVALID_CORS')
  const identities = new Set(options.allowedIdentities.map(id=>id.toLowerCase()))
  let start=0; let count=0
  return async(request: Request): Promise<Response> => {
    const origin=request.headers.get('Origin')
    const headers: Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'}
    if(origin && origins.has(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'})
    const answer=(status:number,estado:string,data:unknown=null)=>new Response(JSON.stringify({modo:'FASE_FUNCIONAL_GUID',estado,data}),{status,headers})
    if(!options.enabled || !identities.size || identities.size>500 || (options.expiresAt!==undefined && Date.now()>=options.expiresAt)) return answer(503,'FASE_FUNCIONAL_DESHABILITADA')
    if(origin!==null&&!origins.has(origin)) return answer(403,'ORIGEN_NO_PERMITIDO')
    if(request.method==='OPTIONS') return origin&&origins.has(origin)?new Response(null,{status:204,headers}):answer(403,'ORIGEN_NO_PERMITIDO')
    if(request.method!=='POST') return answer(405,'METODO_NO_PERMITIDO')
    if(Date.now()-start>60000){start=Date.now();count=0} if(++count>300) return answer(429,'LIMITE_DE_FRECUENCIA')
    if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json') return answer(400,'SOLICITUD_INVALIDA')
    try {
      const reader=request.body?.getReader(); if(!reader) return answer(400,'SOLICITUD_INVALIDA')
      let total=0; let text=''; const decoder=new TextDecoder()
      try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>32768){await reader.cancel();return answer(400,'SOLICITUD_INVALIDA')}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}finally{reader.releaseLock()}
      const body=JSON.parse(text)
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id_object','id_tenant','accion','datos'].includes(k))
        ||typeof body.id_object!=='string'||typeof body.id_tenant!=='string'||!uuidPattern.test(body.id_object)||!uuidPattern.test(body.id_tenant)) return answer(400,'SOLICITUD_INVALIDA')
      const id_object=body.id_object.toLowerCase(),id_tenant=body.id_tenant.toLowerCase()
      if(!identities.has(`${id_tenant}:${id_object}`)) return answer(403,'SIN_ACCESO')
      const accion=options.fixedAction??body.accion
      if(!actions.has(accion)|| (options.fixedAction && body.accion && body.accion!==options.fixedAction)) return answer(400,'OPERACION_INVALIDA')
      const datos=body.datos??{}
      if(typeof datos!=='object'||Array.isArray(datos)||!datos||Object.keys(datos).some(k=>['roles','id_object','id_tenant','validado','autorizado'].includes(k)))return answer(400,'SOLICITUD_INVALIDA')
      return answer(200,'OK',await options.rpc({id_object,id_tenant,accion,datos}))
    }catch(error){if(error instanceof FunctionalError)return answer(error.status,error.message);return answer(503,'SERVICIO_NO_DISPONIBLE')}
  }
}

export function functionalEntry(fixedAction?: FunctionalAction) {
  let handler: ReturnType<typeof createFunctionalHandler>|undefined
  return async(request:Request):Promise<Response>=>{
    if(!handler){try{
      const deno=(globalThis as unknown as {Deno?:{env:{get(name:string):string|undefined}}}).Deno
      const env=(name:string)=>deno?.env.get(name)??''
      const expiry=Date.parse(env('FUNCTIONAL_GUID_EXPIRES_AT'))
      handler=createFunctionalHandler({enabled:env('FUNCTIONAL_GUID_ENABLED')==='true'&&env('ACCESS_ENVIRONMENT')==='test'&&Number.isFinite(expiry)&&expiry>Date.now()&&expiry<=Date.now()+86400000,expiresAt:expiry,
        allowedOrigins:env('ACCESS_ALLOWED_ORIGINS').split(',').filter(Boolean),allowedIdentities:env('FUNCTIONAL_GUID_ALLOWED_IDENTITIES').split(',').filter(Boolean),
        rpc:createFunctionalRpc(env('INSFORGE_BASE_URL'),env('RBAC_SERVER_API_KEY')||env('API_KEY')),fixedAction})
    }catch{return new Response(JSON.stringify({modo:'FASE_FUNCIONAL_GUID',estado:'CONFIGURACION_NO_DISPONIBLE',data:null}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}}
    return handler(request)
  }
}
