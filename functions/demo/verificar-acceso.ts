// RBAC_DEMO: exclusivamente desarrollo. No importar desde el entry point de producci?n.
import { resolveAccess, createInsforgeRepository, uuidPattern, identityKey } from '../shared/rbac.ts'
import type { AccessRepository, DemoIdentity, InternalAccess, InternalAccessState } from '../shared/rbac.ts'
export { resolveAccess, createInsforgeRepository, uuidPattern, identityKey } from '../shared/rbac.ts'
export type { AccessRepository, DemoIdentity, DemoUser, DemoRole, InternalAccess, InternalAccessState } from '../shared/rbac.ts'

export interface DemoHandlerOptions {
  enabled: boolean
  allowedOrigins: string[]
  allowedIdentities: DemoIdentity[]
  repository: AccessRepository
  dataSource?: 'SIMULADA' | 'POSTGRESQL'
  now?: () => number
  // Se registra solo el estado/código, nunca el body ni datos de usuarios.
  onState?: (state: InternalAccessState) => void
}

export function createDemoHandler(options: DemoHandlerOptions) {
  const identities = new Set(options.allowedIdentities.map(identityKey))
  const origins = new Set(options.allowedOrigins)
  const windows = new Map<string, { start: number; count: number }>()
  const now = options.now ?? Date.now
  function limit(key: string, max: number) {
    const time = now()
    let bucket = windows.get(key)
    if (!bucket || time - bucket.start >= 60000) {
      bucket = { start: time, count: 0 }
      windows.set(key, bucket)
    }
    return ++bucket.count > max
  }
  const denied = { modo: 'RBAC_DEMO', fuenteDatos: options.dataSource ?? 'POSTGRESQL', autorizado: false, estado: 'SIN_ACCESO', usuario: null, roles: [] }
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin')
    const cors: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store' }
    if (origin && origins.has(origin)) {
      cors['Access-Control-Allow-Origin'] = origin
      cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
      cors['Access-Control-Allow-Headers'] = 'Content-Type'
    }
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, 'Content-Type': 'application/json' } })
    const technical = (status: number, code: string) => json({ ...denied, estado: 'ERROR', codigo: code }, status)
    if (!options.enabled || identities.size === 0 || identities.size > 20 || origins.size === 0 || origins.has('*')) return technical(503, 'DEMO_DESHABILITADA')
    if (!origin || !origins.has(origin)) return technical(403, 'ORIGEN_NO_PERMITIDO')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return technical(405, 'METODO_NO_PERMITIDO')
    if (!['/functions/verificar-acceso', '/verificar-acceso'].includes(new URL(request.url).pathname)) return technical(404, 'RUTA_NO_PERMITIDA')
    if (limit('global', 60)) return json({ ...denied, estado: 'ERROR', codigo: 'LIMITE_DE_FRECUENCIA' }, 429, { 'Retry-After': '60' })
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return technical(415, 'JSON_REQUERIDO')
    // Lectura acotada incluso cuando falta Content-Length.
    const reader = request.body?.getReader()
    if (!reader) return technical(400, 'SOLICITUD_INVALIDA')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 1024) { await reader.cancel(); return technical(413, 'SOLICITUD_DEMASIADO_GRANDE') }
        chunks.push(value)
      }
      const bodyBytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bodyBytes.set(chunk, offset); offset += chunk.byteLength }
      const body: unknown = JSON.parse(new TextDecoder().decode(bodyBytes))
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'id_object' && key !== 'id_tenant')) return technical(400, 'SOLICITUD_INVALIDA')
      if (!('id_object' in body) || !('id_tenant' in body) || typeof body.id_object !== 'string' || typeof body.id_tenant !== 'string' || !uuidPattern.test(body.id_object) || !uuidPattern.test(body.id_tenant)) return technical(400, 'SOLICITUD_INVALIDA')
      const identity = { id_object: body.id_object.toLowerCase(), id_tenant: body.id_tenant.toLowerCase() }
      if (!identities.has(identityKey(identity))) return json(denied)
      if (limit(identityKey(identity), 10)) return json({ ...denied, estado: 'ERROR', codigo: 'LIMITE_DE_FRECUENCIA' }, 429, { 'Retry-After': '60' })
      let access: InternalAccess
      try { access = await resolveAccess(identity, options.repository) }
      catch { options.onState?.('ERROR'); return technical(503, 'VERIFICACION_NO_DISPONIBLE') }
      options.onState?.(access.estado)
      if (access.estado !== 'AUTORIZADO') return json(denied)
      return json({ modo: 'RBAC_DEMO', fuenteDatos: options.dataSource ?? 'POSTGRESQL', autorizado: true, estado: 'AUTORIZADO', usuario: access.usuario, roles: access.roles })
    } catch {
      return technical(400, 'SOLICITUD_INVALIDA')
    } finally { reader.releaseLock() }
  }
}

// Entry point InsForge. Deshabilitado por defecto; la fuente no contiene secretos.
let edgeHandler: ReturnType<typeof createDemoHandler> | undefined
export default async function verificarAcceso(request: Request): Promise<Response> {
  if (!edgeHandler) {
    const deno = (globalThis as unknown as { Deno?: { env: { get(key: string): string | undefined } } }).Deno
    const env = (key: string) => deno?.env.get(key) ?? ''
    try {
      const identities: unknown = JSON.parse(env('RBAC_DEMO_ALLOWED_IDENTITIES') || '[]')
      if (!Array.isArray(identities) || !identities.every((id) => id && uuidPattern.test(id.id_object) && uuidPattern.test(id.id_tenant))) throw new Error('INVALID_ALLOWLIST')
      edgeHandler = createDemoHandler({
        enabled: env('RBAC_DEMO_ENABLED') === 'true' && env('RBAC_DEMO_ENVIRONMENT') === 'controlled-test',
        allowedOrigins: env('RBAC_DEMO_ALLOWED_ORIGINS').split(',').map((item) => item.trim()).filter(Boolean),
        allowedIdentities: identities,
        repository: createInsforgeRepository(env('INSFORGE_BASE_URL'), env('RBAC_SERVER_API_KEY')),
      })
    } catch {
      return new Response(JSON.stringify({ modo: 'RBAC_DEMO', autorizado: false, estado: 'ERROR', usuario: null, roles: [], codigo: 'DEMO_DESHABILITADA' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }
  }
  return edgeHandler(request)
}
