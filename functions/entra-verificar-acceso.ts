import { createEntraVerifier, AuthFailure, type EntraSettings } from './shared/entra.ts'
import { createInsforgeRepository, type AccessRepository, type DemoIdentity } from './shared/rbac.ts'
import { authorizeIdentity } from './shared/authorization.ts'

export interface SecureHandlerOptions {
  verifyToken: (token: string) => Promise<DemoIdentity>
  repository: AccessRepository
  allowedOrigins: string[]
  now?: () => number
  onOriginRejected?: (diagnostic: { requestId: string; originPresent: true; origin: string; authorizationPresent: boolean; skipAuthorizationPresent: boolean }) => void
}

function safeOriginDiagnostic(origin: string): string {
  if (origin === '') return 'EMPTY_ORIGIN'
  if (origin === 'null') return 'OPAQUE_ORIGIN_NULL'
  try {
    const url = new URL(origin)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || url.origin.length > 250 || /(?:ik_|anon_|eyJ)/i.test(url.hostname)) return 'INVALID_ORIGIN'
    return url.origin
  } catch { return 'INVALID_ORIGIN' }
}

export function createSecureAccessHandler(options: SecureHandlerOptions) {
  const origins = new Set(options.allowedOrigins)
  if ([...origins].some(origin => { try { const url = new URL(origin); return origin !== url.origin || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) } catch { return true } })) throw new Error('INVALID_CORS_CONFIG')
  let windowStart = 0
  let count = 0
  let diagnosticWindow = 0
  let diagnosticCount = 0
  const now = options.now ?? Date.now
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin')
    const hasOrigin = origin !== null
    const allowedOrigin = hasOrigin && origins.has(origin)
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
      headers['Access-Control-Max-Age'] = '600'
    }
    const fail = (status: number, code: string, extra: Record<string, string> = {}) => new Response(JSON.stringify({ autorizado: false, estado: code, usuario: null, roles: [] }), { status, headers: { ...headers, ...extra, ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}), ...(status === 429 ? { 'Retry-After': '60' } : {}) } })
    if (hasOrigin && !allowedOrigin) {
      const requestId = crypto.randomUUID()
      const time = now()
      if (time - diagnosticWindow >= 60000) { diagnosticCount = 0; diagnosticWindow = time }
      if (++diagnosticCount <= 5) {
        try { options.onOriginRejected?.({ requestId, originPresent: true, origin: safeOriginDiagnostic(origin), authorizationPresent: request.headers.has('Authorization'), skipAuthorizationPresent: request.headers.has('SkipAuthorization') }) } catch { /* Diagnostics must never change authorization behavior. */ }
      }
      return fail(403, 'ORIGEN_NO_PERMITIDO', { 'X-URH-Diagnostic-Id': requestId })
    }
    // CORS is not identity: absent Origin is valid for a server-to-server POST,
    // but never skips the mandatory JWT validation below.
    if (request.method === 'OPTIONS') return allowedOrigin ? new Response(null, { status: 204, headers }) : fail(403, 'ORIGEN_NO_PERMITIDO')
    if (request.method !== 'POST') return fail(405, 'METODO_NO_PERMITIDO')
    if (!['/functions/verificar-acceso', '/verificar-acceso', '/functions/verificar-acceso-entra', '/verificar-acceso-entra'].includes(new URL(request.url).pathname)) return fail(404, 'RUTA_NO_PERMITIDA')
    const time = now()
    if (time - windowStart >= 60000) { count = 0; windowStart = time }
    // Per-instance coarse guard; production also requires the platform/gateway's distributed limits.
    if (++count > 600) return fail(429, 'LIMITE_DE_FRECUENCIA')
    const bearer = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]
    if (!bearer) return fail(401, 'TOKEN_AUSENTE')
    try {
      // Verify before any DB access. No Origin is normal for server-side OAuth connectors.
      const identity = await options.verifyToken(bearer)
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail(400, 'SOLICITUD_INVALIDA')
      const reader = request.body?.getReader()
      if (!reader) return fail(400, 'SOLICITUD_INVALIDA')
      let text = ''
      let bytes = 0
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 1024) { await reader.cancel(); return fail(400, 'SOLICITUD_INVALIDA') }
          text += decoder.decode(value, { stream: true })
        }
        text += decoder.decode()
      } finally { reader.releaseLock() }
      let body: unknown
      try { body = JSON.parse(text) } catch { return fail(400, 'SOLICITUD_INVALIDA') }
      // Reject spoofed oid, tid, roles and arbitrary commands: contract is strictly {}.
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return fail(400, 'SOLICITUD_INVALIDA')
      let access
      try { access = await authorizeIdentity(identity, options.repository) }
      catch (error) { if (error instanceof AuthFailure) throw error; return fail(503, 'DATOS_NO_DISPONIBLES') }
      return new Response(JSON.stringify({ autorizado: true, estado: 'AUTORIZADO', usuario: access.usuario, roles: access.roles }), { status: 200, headers })
    } catch (error) {
      if (error instanceof AuthFailure) return fail(error.status, error.code, error.diagnosticId ? { 'X-URH-Diagnostic-Id': error.diagnosticId } : {})
      return fail(500, 'ERROR_INTERNO')
    }
  }
}

export function createSecureHandlerFromEnvironment(env: (name: string) => string | undefined) {
  const list = (name: string) => (env(name) ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const settings: EntraSettings = {
    tenantId: env('ENTRA_TENANT_ID') ?? '', audiencesV1: list('ENTRA_AUDIENCES_V1'),
    audienceV2: env('ENTRA_AUDIENCE_V2') ?? '', allowedClients: list('ENTRA_ALLOWED_CLIENT_IDS'), requiredScope: 'access_as_user',
  }
  const diagnosticExpiry = Date.parse(env('AUTH_DIAGNOSTICS_EXPIRES_AT') ?? '')
  const diagnosticsEnabled = env('AUTH_DIAGNOSTICS_ENABLED') === 'true' && env('ACCESS_ENVIRONMENT') === 'test'
    && Number.isFinite(diagnosticExpiry) && diagnosticExpiry > Date.now() && diagnosticExpiry <= Date.now() + 7200000
  let diagnosticWindow = 0
  let diagnosticCount = 0
  return createSecureAccessHandler({
    verifyToken: createEntraVerifier(settings, fetch, diagnosticsEnabled ? diagnostic => {
      if (Date.now() >= diagnosticExpiry) return undefined
      const now = Date.now()
      if (now - diagnosticWindow >= 60000) { diagnosticWindow = now; diagnosticCount = 0 }
      if (++diagnosticCount > 5) return undefined
      const requestId = crypto.randomUUID()
      console.info(JSON.stringify({ event: 'urh_verified_claims_test', requestId, ...diagnostic }))
      return requestId
    } : undefined),
    // InsForge injects its protected API_KEY into the server runtime. Never exported to Vite.
    repository: createInsforgeRepository(env('INSFORGE_BASE_URL') ?? '', env('RBAC_SERVER_API_KEY') || env('API_KEY') || ''),
    allowedOrigins: list('ACCESS_ALLOWED_ORIGINS'),
    onOriginRejected: diagnostic => console.warn(JSON.stringify({ event: 'urh_origin_rejected', ...diagnostic })),
  })
}

let handler: ReturnType<typeof createSecureAccessHandler> | undefined
export default async function verificarAcceso(request: Request): Promise<Response> {
  if (!handler) {
    try {
      const runtime = (globalThis as unknown as { Deno?: { env: { get(name: string): string | undefined } } }).Deno
      handler = createSecureHandlerFromEnvironment(name => runtime?.env.get(name))
    } catch {
      return new Response(JSON.stringify({ autorizado: false, estado: 'CONFIGURACION_NO_DISPONIBLE', usuario: null, roles: [] }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }
  }
  return handler(request)
}
