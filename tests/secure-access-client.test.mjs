import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSecureAccess, AccessProblem } from '../src/types/secureAccess.ts'

const valid = { autorizado: true, estado: 'AUTORIZADO', usuario: { id_usuario: 1, nombre: 'Prueba' }, roles: ['ELECTOR'] }
test('Frontend acepta solo respuesta segura y rechaza demo/roles desconocidos', () => {
  assert.deepEqual(parseSecureAccess(valid), valid)
  for (const invalid of [{ ...valid, modo: 'RBAC_DEMO' }, { ...valid, roles: ['SUPERADMIN'] }, { ...valid, usuario: null }, { ...valid, roles: [] }, { ...valid, estado: 'SIN_ACCESO' }]) assert.throws(() => parseSecureAccess(invalid), AccessProblem)
})
test('Frontend distingue token, acceso, roles y dependencia caída', () => {
  for (const [estado, kind] of [['TOKEN_INVALIDO', 'authentication'], ['TOKEN_EXPIRADO', 'authentication'], ['SIN_ACCESO', 'denied'], ['SIN_ROLES', 'no-roles'], ['DATOS_NO_DISPONIBLES', 'connection']]) {
    assert.throws(() => parseSecureAccess({ autorizado: false, estado, usuario: null, roles: [] }), error => error instanceof AccessProblem && error.kind === kind)
  }
})
