import type { AccessResponse } from '../types/access'
import type { IdentidadUsuario } from '../types/identidad'

export const rbacDemoEnabled = import.meta.env.DEV && import.meta.env.VITE_RBAC_DEMO_ENABLED === 'true'

export function parseAccessResponse(value: unknown): AccessResponse {
  if (!value || typeof value !== 'object' || !('modo' in value) || value.modo !== 'RBAC_DEMO'
    || !('fuenteDatos' in value) || !['SIMULADA', 'POSTGRESQL'].includes(String(value.fuenteDatos))
    || !('autorizado' in value) || typeof value.autorizado !== 'boolean'
    || !('estado' in value) || !('usuario' in value) || !('roles' in value) || !Array.isArray(value.roles)
    || !value.roles.every((role) => role === 'ADMINISTRADOR' || role === 'ELECTOR')) throw new Error('Respuesta de acceso inválida.')
  if (value.autorizado) {
    const user = value.usuario
    if (value.estado !== 'AUTORIZADO' || !value.roles.length || !user || typeof user !== 'object'
      || !('id_usuario' in user) || !Number.isSafeInteger(user.id_usuario)
      || !('nombre' in user) || typeof user.nombre !== 'string') throw new Error('Respuesta de acceso inválida.')
  } else if (value.estado !== 'SIN_ACCESO' || value.usuario !== null || value.roles.length) throw new Error('Respuesta de acceso inválida.')
  return value as AccessResponse
}

export async function verificarAcceso(identity: IdentidadUsuario, signal: AbortSignal): Promise<AccessResponse> {
  if (!rbacDemoEnabled) throw new Error('RBAC_DEMO está deshabilitado.')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!identity.objectId || !identity.tenantId || !uuid.test(identity.objectId) || !uuid.test(identity.tenantId)) throw new Error('El host no proporcionó identificadores válidos.')
  // La primera fase solo utiliza un servidor ligado a loopback. Nunca URL pública.
  const endpoint = new URL(import.meta.env.VITE_RBAC_DEMO_URL || 'http://127.0.0.1:8787/functions/verificar-acceso')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !['http:', 'https:'].includes(endpoint.protocol)
    || endpoint.username || endpoint.password || endpoint.pathname !== '/functions/verificar-acceso' || endpoint.search || endpoint.hash) throw new Error('La demo requiere un endpoint local controlado.')
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, cache: 'no-store', credentials: 'omit',
    body: JSON.stringify({ id_object: identity.objectId, id_tenant: identity.tenantId }),
  })
  if (!response.ok) throw new Error('No se pudo verificar tu acceso. Inténtalo nuevamente.')
  return parseAccessResponse(await response.json())
}
