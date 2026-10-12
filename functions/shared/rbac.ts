export type DemoRole = 'ADMINISTRADOR' | 'ELECTOR'
export type InternalAccessState = 'AUTORIZADO' | 'NO_REGISTRADO' | 'INACTIVO' | 'SIN_ROLES' | 'ERROR'
export interface DemoIdentity { id_object: string; id_tenant: string }
export interface DemoUser { id_usuario: number; nombre: string | null; activo: boolean }
export interface AccessRepository {
  findUsers(identity: DemoIdentity): Promise<DemoUser[]>
  findRoleCodes(userId: number): Promise<string[]>
}
export interface InternalAccess {
  estado: InternalAccessState
  usuario: { id_usuario: number; nombre: string } | null
  roles: DemoRole[]
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const identityKey = (identity: DemoIdentity) => `${identity.id_tenant.toLowerCase()}:${identity.id_object.toLowerCase()}`

// Reutilizable con claims validados en la siguiente fase: no depende del origen de identidad.
export async function resolveAccess(identity: DemoIdentity, repository: AccessRepository): Promise<InternalAccess> {
  const users = await repository.findUsers(identity)
  if (users.length > 1) throw new Error('AMBIGUOUS_IDENTITY')
  if (!users.length) return { estado: 'NO_REGISTRADO', usuario: null, roles: [] }
  const user = users[0]
  if (!Number.isSafeInteger(user.id_usuario) || typeof user.activo !== 'boolean') throw new Error('INVALID_USER')
  if (!user.activo) return { estado: 'INACTIVO', usuario: null, roles: [] }
  const codes = await repository.findRoleCodes(user.id_usuario)
  const roles = [...new Set(codes.filter((code): code is DemoRole => code === 'ADMINISTRADOR' || code === 'ELECTOR'))].sort()
  if (!roles.length) return { estado: 'SIN_ROLES', usuario: null, roles: [] }
  return { estado: 'AUTORIZADO', usuario: { id_usuario: user.id_usuario, nombre: user.nombre?.trim() || 'Usuario de prueba' }, roles }
}

// API REST oficial con credencial administrativa exclusivamente de servidor.
// La API key no elimina la necesidad de USAGE/SELECT del rol project_admin.
export function createInsforgeRepository(baseUrl: string, apiKey: string, fetcher: typeof fetch = fetch): AccessRepository {
  const base = new URL(baseUrl)
  if (base.protocol !== 'https:' || base.username || base.password || !apiKey.startsWith('ik_')) throw new Error('INVALID_SERVER_CONFIG')
  async function read(table: 'usuario' | 'usuario_rol' | 'rol', parameters: Record<string, string>): Promise<Record<string, unknown>[]> {
    const url = new URL(`/api/database/records/${table}`, base)
    url.search = new URLSearchParams(parameters).toString()
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Accept-Profile': 'urh_votacion' },
      signal: AbortSignal.timeout(5000), cache: 'no-store',
    })
    if (!response.ok) throw new Error('RBAC_DATABASE_UNAVAILABLE')
    const data: unknown = await response.json()
    if (!Array.isArray(data) || !data.every((row) => row && typeof row === 'object')) throw new Error('INVALID_DATABASE_RESPONSE')
    return data
  }
  return {
    async findUsers(identity) {
      const rows = await read('usuario', {
        select: 'id_usuario,nombre,activo', id_object: `ilike.${identity.id_object}`,
        id_tenant: `ilike.${identity.id_tenant}`, limit: '2',
      })
      return rows.map((row) => {
        if (!Number.isSafeInteger(row.id_usuario) || typeof row.activo !== 'boolean' || (row.nombre !== null && typeof row.nombre !== 'string')) throw new Error('INVALID_USER')
        return { id_usuario: row.id_usuario as number, activo: row.activo, nombre: row.nombre as string | null }
      })
    },
    async findRoleCodes(userId) {
      const ids = new Set<number>()
      for (let offset = 0; ; offset += 100) {
        if (offset >= 2000) throw new Error('TOO_MANY_ASSIGNMENTS')
        const rows = await read('usuario_rol', { select: 'id_usuario_rol,id_rol', id_usuario: `eq.${userId}`, order: 'id_usuario_rol.asc', limit: '100', offset: String(offset) })
        for (const row of rows) {
          if (row.id_rol === null) continue
          if (!Number.isSafeInteger(row.id_rol)) throw new Error('INVALID_ROLE_LINK')
          ids.add(row.id_rol as number)
        }
        if (rows.length < 100) break
      }
      const allIds = [...ids]
      const codes: string[] = []
      for (let start = 0; start < allIds.length; start += 100) {
        const rows = await read('rol', { select: 'codigo', id_rol: `in.(${allIds.slice(start, start + 100).join(',')})`, limit: '100' })
        for (const row of rows) {
          if (typeof row.codigo !== 'string') throw new Error('INVALID_ROLE')
          codes.push(row.codigo)
        }
      }
      return codes
    },
  }
}
