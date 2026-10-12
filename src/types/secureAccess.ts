import type { AccessRole } from './access'

export interface SecureAccessResponse {
  autorizado: boolean
  estado: string
  usuario: { id_usuario: number; nombre: string } | null
  roles: AccessRole[]
}
export type AccessProblemKind = 'authentication' | 'denied' | 'no-roles' | 'connection' | 'configuration'
export class AccessProblem extends Error {
  readonly kind: AccessProblemKind
  constructor(kind: AccessProblemKind, message: string) { super(message); this.name = 'AccessProblem'; this.kind = kind }
}
const authenticationStates = ['TOKEN_AUSENTE', 'TOKEN_INVALIDO', 'TOKEN_EXPIRADO', 'CLIENTE_NO_AUTORIZADO']
export function parseSecureAccess(value: unknown): SecureAccessResponse {
  if (!value || typeof value !== 'object' || 'modo' in value || !('autorizado' in value) || typeof value.autorizado !== 'boolean'
    || !('estado' in value) || typeof value.estado !== 'string' || !('roles' in value) || !Array.isArray(value.roles)
    || !value.roles.every(role => role === 'ADMINISTRADOR' || role === 'ELECTOR') || !('usuario' in value)) throw new AccessProblem('connection', 'El servicio devolvió una respuesta no válida.')
  if (!value.autorizado) {
    if (value.usuario !== null || value.roles.length) throw new AccessProblem('connection', 'El servicio devolvió una respuesta no válida.')
    const state = value.estado
    throw new AccessProblem(state === 'SIN_ROLES' ? 'no-roles' : ['SIN_ACCESO', 'PERMISO_INSUFICIENTE'].includes(state) ? 'denied'
      : authenticationStates.includes(state) ? 'authentication' : 'connection', 'No se pudo autorizar el acceso.')
  }
  const user = value.usuario
  if (value.estado !== 'AUTORIZADO' || !value.roles.length || !user || typeof user !== 'object'
    || !('id_usuario' in user) || !Number.isSafeInteger(user.id_usuario) || !('nombre' in user) || typeof user.nombre !== 'string') throw new AccessProblem('connection', 'El servicio devolvió una respuesta no válida.')
  return value as SecureAccessResponse
}
