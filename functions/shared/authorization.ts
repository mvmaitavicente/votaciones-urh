import type { AccessRepository, DemoIdentity, DemoRole, InternalAccess } from './rbac.ts'
import { resolveAccess } from './rbac.ts'
import { AuthFailure } from './entra.ts'

export async function authorizeProtectedRequest(request: Request, verifyToken: (token: string) => Promise<DemoIdentity>, repository: AccessRepository, requiredRole?: DemoRole): Promise<InternalAccess> {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!token) throw new AuthFailure(401, 'TOKEN_AUSENTE')
  return authorizeIdentity(await verifyToken(token), repository, requiredRole)
}

// Call on EVERY protected request. Roles are freshly read, never accepted from React/JWT roles.
export async function authorizeIdentity(identity: DemoIdentity, repository: AccessRepository, requiredRole?: DemoRole): Promise<InternalAccess> {
  const access = await resolveAccess(identity, repository)
  if (access.estado !== 'AUTORIZADO') throw new AuthFailure(403, access.estado === 'SIN_ROLES' ? 'SIN_ROLES' : 'SIN_ACCESO')
  if (requiredRole && !access.roles.includes(requiredRole)) throw new AuthFailure(403, 'PERMISO_INSUFICIENTE')
  return access
}

// Future electoral commands must pass both role and a SERVER-SIDE padrón check.
// No actual electoral operation is implemented; a missing/false check always denies.
export async function authorizeElectoralOperation(identity: DemoIdentity, repository: AccessRepository, checkPadron: (identity: DemoIdentity) => Promise<boolean>): Promise<InternalAccess> {
  const access = await authorizeIdentity(identity, repository, 'ELECTOR')
  if (!await checkPadron(identity)) throw new AuthFailure(403, 'SIN_ACCESO')
  return access
}
