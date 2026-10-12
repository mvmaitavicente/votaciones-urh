import { createRemoteJWKSet, customFetch, decodeJwt, decodeProtectedHeader, errors, jwtVerify } from 'jose'
import type { DemoIdentity } from './rbac.ts'

export class AuthFailure extends Error {
  readonly status: number
  readonly code: string
  readonly diagnosticId?: string
  constructor(status: number, code: string, diagnosticId?: string) { super(code); this.name = 'AuthFailure'; this.status = status; this.code = code; this.diagnosticId = diagnosticId }
}
export interface VerifiedClaimsDiagnostic {
  tokenVersion: '1.0' | '2.0'
  audPresent: boolean; issPresent: boolean; tidPresent: boolean
  scpPresent: boolean; rolesPresent: boolean; azpPresent: boolean; appidPresent: boolean
  signatureIssuerAudienceTimeVerified: true
  audienceForThisApi: true; tenantAllowed: true
  scpHasAccessAsUser: boolean; oauthClientAllowed: boolean
}
export interface EntraSettings {
  tenantId: string
  audiencesV1: string[]
  audienceV2: string
  allowedClients: string[]
  requiredScope: string
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const graphId = '00000003-0000-0000-c000-000000000000'

export function validateEntraSettings(config: EntraSettings) {
  if (!guid.test(config.tenantId) || !guid.test(config.audienceV2) || config.audienceV2 === graphId
    || !config.audiencesV1.length || config.audiencesV1.some(aud => !aud || aud === graphId || /graph\.microsoft\.com/i.test(aud))
    || !config.allowedClients.length || !config.allowedClients.every(client => guid.test(client))
    || config.requiredScope !== 'access_as_user') throw new AuthFailure(503, 'CONFIGURACION_NO_DISPONIBLE')
}

// Unverified ver selects one of TWO fixed metadata endpoints; it never selects a host/tenant URL.
// All identity claims below come only from jwtVerify's verified payload.
export function createEntraVerifier(config: EntraSettings, fetcher: typeof fetch = fetch,
  onVerifiedClaims?: (diagnostic: VerifiedClaimsDiagnostic) => string | undefined) {
  validateEntraSettings(config)
  const tenant = config.tenantId.toLowerCase()
  const clients = new Set(config.allowedClients.map(client => client.toLowerCase()))
  type Resolver = ReturnType<typeof createRemoteJWKSet>
  const cached = new Map<string, { expires: number; issuer: string; jwks: Resolver }>()
  const loading = new Map<string, Promise<{ expires: number; issuer: string; jwks: Resolver }>>()
  const issuers = {
    '1.0': `https://sts.windows.net/${tenant}/`,
    '2.0': `https://login.microsoftonline.com/${tenant}/v2.0`,
  }
  async function resolver(version: '1.0' | '2.0') {
    const existing = cached.get(version)
    if (existing && existing.expires > Date.now()) return existing
    let pending = loading.get(version)
    if (!pending) {
      pending = (async () => {
        const url = `https://login.microsoftonline.com/${tenant}${version === '2.0' ? '/v2.0' : ''}/.well-known/openid-configuration`
        const response = await fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'error' })
        if (!response.ok) throw new AuthFailure(503, 'AUTENTICACION_NO_DISPONIBLE')
        const metadata: unknown = await response.json()
        if (!metadata || typeof metadata !== 'object' || !('issuer' in metadata) || metadata.issuer !== issuers[version]
          || !('jwks_uri' in metadata) || typeof metadata.jwks_uri !== 'string') throw new AuthFailure(503, 'AUTENTICACION_NO_DISPONIBLE')
        const jwksUrl = new URL(metadata.jwks_uri)
        // v1 Microsoft metadata legitimately advertises common/discovery/keys.
        if (jwksUrl.protocol !== 'https:' || jwksUrl.hostname !== 'login.microsoftonline.com' || jwksUrl.port
          || jwksUrl.username || jwksUrl.password || jwksUrl.search || jwksUrl.hash
          || ![`/${tenant}/discovery/keys`, `/${tenant}/discovery/v2.0/keys`, '/common/discovery/keys'].includes(jwksUrl.pathname)) throw new AuthFailure(503, 'AUTENTICACION_NO_DISPONIBLE')
        const entry = {
          expires: Date.now() + 600000, issuer: issuers[version],
          jwks: createRemoteJWKSet(jwksUrl, {
            timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000,
            [customFetch]: async (input, init) => fetcher(input, { ...init, redirect: 'error' }),
          }),
        }
        cached.set(version, entry)
        return entry
      })()
      loading.set(version, pending)
      pending.finally(() => loading.delete(version)).catch(() => {})
    }
    return pending
  }
  return async (token: string): Promise<DemoIdentity> => {
    if (!token || token.length > 16384) throw new AuthFailure(401, 'TOKEN_INVALIDO')
    let version: '1.0' | '2.0'
    try {
      const header = decodeProtectedHeader(token)
      const unverified = decodeJwt(token)
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 200
        || !['JWT', 'at+jwt'].includes(String(header.typ)) || (unverified.ver !== '1.0' && unverified.ver !== '2.0')) throw new AuthFailure(401, 'TOKEN_INVALIDO')
      version = unverified.ver
    } catch { throw new AuthFailure(401, 'TOKEN_INVALIDO') }
    let verified
    try {
      const entry = await resolver(version)
      verified = await jwtVerify(token, entry.jwks, {
        algorithms: ['RS256'], issuer: entry.issuer,
        audience: version === '2.0' ? config.audienceV2 : config.audiencesV1,
        requiredClaims: ['iss', 'aud', 'exp', 'nbf', 'iat', 'oid', 'tid', 'ver'], clockTolerance: 30,
      })
    } catch (error) {
      if (error instanceof AuthFailure) throw error
      if (error instanceof errors.JWTExpired) throw new AuthFailure(401, 'TOKEN_EXPIRADO')
      if (error instanceof errors.JOSEError && error.code !== 'ERR_JWKS_TIMEOUT' && error.code !== 'ERR_JOSE_GENERIC') throw new AuthFailure(401, 'TOKEN_INVALIDO')
      throw new AuthFailure(503, 'AUTENTICACION_NO_DISPONIBLE')
    }
    const payload = verified.payload
    if (payload.ver !== version || typeof payload.tid !== 'string' || payload.tid.toLowerCase() !== tenant
      || typeof payload.oid !== 'string' || !guid.test(payload.oid) || !guid.test(payload.tid)) throw new AuthFailure(401, 'TOKEN_INVALIDO')
    const client = version === '2.0' ? payload.azp : payload.appid
    const hasScope = typeof payload.scp === 'string' && payload.scp.split(/\s+/).includes(config.requiredScope)
    const clientAllowed = typeof client === 'string' && clients.has(client.toLowerCase())
    let diagnosticId: string | undefined
    // Only booleans derived AFTER signature, issuer, audience, time and tenant validation.
    // No token/claim values (including other scopes, roles, client IDs or identity) are emitted.
    try { diagnosticId = onVerifiedClaims?.({
      tokenVersion: version,
      audPresent: Object.hasOwn(payload, 'aud'), issPresent: Object.hasOwn(payload, 'iss'), tidPresent: Object.hasOwn(payload, 'tid'),
      scpPresent: Object.hasOwn(payload, 'scp'), rolesPresent: Object.hasOwn(payload, 'roles'),
      azpPresent: Object.hasOwn(payload, 'azp'), appidPresent: Object.hasOwn(payload, 'appid'),
      signatureIssuerAudienceTimeVerified: true, audienceForThisApi: true, tenantAllowed: true,
      scpHasAccessAsUser: hasScope, oauthClientAllowed: clientAllowed,
    }) } catch { /* Diagnostics never change the authorization decision. */ }
    // ID tokens have no delegated scp. app-only tokens do not establish an elector.
    if (payload.idtyp === 'app' || typeof payload.scp !== 'string' || !payload.scp.trim()) throw new AuthFailure(401, 'TOKEN_INVALIDO', diagnosticId)
    if (!hasScope) throw new AuthFailure(403, 'PERMISO_INSUFICIENTE', diagnosticId)
    if (!clientAllowed) throw new AuthFailure(403, 'CLIENTE_NO_AUTORIZADO', diagnosticId)
    return { id_object: payload.oid.toLowerCase(), id_tenant: tenant }
  }
}
