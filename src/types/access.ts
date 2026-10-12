export type AccessRole = 'ADMINISTRADOR' | 'ELECTOR'
export type AccessModule = 'administracion' | 'elector'
export interface AccessResponse {
  modo: 'RBAC_DEMO'
  fuenteDatos: 'SIMULADA' | 'POSTGRESQL'
  autorizado: boolean
  estado: 'AUTORIZADO' | 'SIN_ACCESO'
  usuario: { id_usuario: number; nombre: string } | null
  roles: AccessRole[]
}

export function canAccessModule(roles: readonly AccessRole[], module: AccessModule): boolean {
  return roles.includes(module === 'administracion' ? 'ADMINISTRADOR' : 'ELECTOR')
}
