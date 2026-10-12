import test from 'node:test'
import assert from 'node:assert/strict'
import { createDemoHandler, resolveAccess, createInsforgeRepository } from '../functions/demo/verificar-acceso.ts'
import { canAccessModule } from '../src/types/access.ts'
import { createFixtureRepository, demoIdentities, demoObject, demoTenant } from '../scripts/rbac-demo-fixtures.mjs'

const origin = 'http://localhost:5173'
function handler(overrides = {}) {
  return createDemoHandler({ enabled: true, allowedOrigins: [origin], allowedIdentities: demoIdentities, repository: createFixtureRepository(), dataSource: 'SIMULADA', ...overrides })
}
function request(number, overrides = {}) {
  return new Request('http://127.0.0.1:8787/functions/verificar-acceso', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_object: demoObject(number), id_tenant: demoTenant }), ...overrides,
  })
}

for (const [number, state] of [[1, 'NO_REGISTRADO'], [2, 'INACTIVO'], [3, 'SIN_ROLES']]) {
  test(`Estado interno ${state}, respuesta externa indistinguible`, async () => {
    const internal = await resolveAccess({ id_object: demoObject(number), id_tenant: demoTenant }, createFixtureRepository())
    assert.equal(internal.estado, state)
    const response = await handler()(request(number))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { modo: 'RBAC_DEMO', fuenteDatos: 'SIMULADA', autorizado: false, estado: 'SIN_ACCESO', usuario: null, roles: [] })
  })
}
for (const [number, roles] of [[4, ['ADMINISTRADOR']], [5, ['ELECTOR']], [6, ['ADMINISTRADOR', 'ELECTOR']]]) {
  test(`Acceso con ${roles.join(' y ')}`, async () => {
    const response = await handler()(request(number))
    const data = await response.json()
    assert.equal(data.autorizado, true)
    assert.equal(data.estado, 'AUTORIZADO')
    assert.deepEqual(data.roles, roles)
    assert.deepEqual(Object.keys(data.usuario).sort(), ['id_usuario', 'nombre'])
    assert.equal(data.usuario.nombre, `Cuenta ficticia ${number}`)
  })
}
test('Error técnico no se confunde con rechazo de permisos', async () => {
  const response = await handler()(request(7))
  assert.equal(response.status, 503)
  const data = await response.json()
  assert.equal(data.estado, 'ERROR')
  assert.equal(data.usuario, null)
  assert.deepEqual(data.roles, [])
})
test('Navegación rechaza módulos sin rol y admite ambos', () => {
  assert.equal(canAccessModule(['ELECTOR'], 'administracion'), false)
  assert.equal(canAccessModule(['ADMINISTRADOR'], 'elector'), false)
  assert.equal(canAccessModule([], 'elector'), false)
  for (const module of ['elector', 'administracion']) assert.equal(canAccessModule(['ADMINISTRADOR', 'ELECTOR'], module), true)
})
test('Sin identificadores, UUID inválidos, JSON extra o mal formado', async () => {
  for (const body of ['{}', '{"id_object":"bad","id_tenant":"bad"}', JSON.stringify({ id_object: demoObject(4), id_tenant: demoTenant, operacion: 'insert' }), '{']) {
    assert.equal((await handler()(request(4, { body }))).status, 400)
  }
})
test('Nunca procesa escrituras: métodos, rutas y campos extras rechazados', async () => {
  let reads = 0
  const repository = { findUsers: async () => { reads++; return [] }, findRoleCodes: async () => [] }
  const fn = handler({ repository })
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal((await fn(request(4, { method }))).status, 405)
  assert.equal((await fn(new Request('http://127.0.0.1:8787/functions/registrar-voto', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }))).status, 404)
  assert.equal(reads, 0)
})
test('CORS restringido y demo desactivada por configuración', async () => {
  assert.equal((await handler()(request(4, { headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' } }))).status, 403)
  assert.equal((await handler()(request(4, { headers: { 'Content-Type': 'application/json' } }))).status, 403)
  assert.equal((await handler({ enabled: false })(request(4))).status, 503)
  assert.equal((await handler({ allowedIdentities: [] })(request(4))).status, 503)
  const preflight = await handler()(new Request('http://127.0.0.1:8787/functions/verificar-acceso', { method: 'OPTIONS', headers: { Origin: origin } }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
})
test('Identidades fuera de lista nunca consultan datos', async () => {
  let reads = 0
  const fn = handler({ repository: { findUsers: async () => { reads++; return [] }, findRoleCodes: async () => [] } })
  assert.equal((await (await fn(request(99))).json()).estado, 'SIN_ACCESO')
  assert.equal(reads, 0)
})
test('Límite de frecuencia por identidad y recuperación de ventana', async () => {
  let time = 0
  const fn = handler({ now: () => time })
  for (let i = 0; i < 10; i++) assert.equal((await fn(request(4))).status, 200)
  const response = await fn(request(4))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '60')
  time = 60001
  assert.equal((await fn(request(4))).status, 200)
})
test('Rechaza cuerpo grande, duplicados y roles desconocidos', async () => {
  assert.equal((await handler()(request(4, { body: 'x'.repeat(1025) }))).status, 413)
  const repository = { findUsers: async () => [{ id_usuario: 1, nombre: 'Prueba', activo: true }], findRoleCodes: async () => ['ROL_DESCONOCIDO'] }
  assert.equal((await resolveAccess(demoIdentities[3], repository)).estado, 'SIN_ROLES')
  repository.findUsers = async () => [{ id_usuario: 1, nombre: 'A', activo: true }, { id_usuario: 2, nombre: 'B', activo: true }]
  await assert.rejects(resolveAccess(demoIdentities[3], repository), /AMBIGUOUS_IDENTITY/)
})
test('Repositorio real usa solo GET, columnas mínimas y credencial de servidor', async () => {
  const calls = []
  const repo = createInsforgeRepository('https://project.insforge.app', 'ik_synthetic_test_only', async (url, init) => {
    calls.push({ url: new URL(url), init })
    assert.equal(init.headers['Accept-Profile'], 'urh_votacion')
    assert.equal(init.headers.Authorization, 'Bearer ik_synthetic_test_only')
    assert.equal(init.method, undefined)
    if (url.pathname.endsWith('/usuario')) return Response.json([{ id_usuario: 4, nombre: 'Prueba', activo: true }])
    if (url.pathname.endsWith('/usuario_rol')) return Response.json([{ id_usuario_rol: 1, id_rol: 2 }, { id_usuario_rol: 2, id_rol: null }])
    return Response.json([{ codigo: 'ADMINISTRADOR' }])
  })
  assert.equal((await resolveAccess(demoIdentities[3], repo)).estado, 'AUTORIZADO')
  assert.equal(calls.length, 3)
  assert.equal(calls[0].url.searchParams.get('select'), 'id_usuario,nombre,activo')
  assert.equal(calls[1].url.searchParams.get('id_usuario'), 'eq.4')
  assert.equal(calls[2].url.searchParams.get('id_rol'), 'in.(2)')
  assert.throws(() => createInsforgeRepository('https://project.insforge.app', 'anon_not_admin'), /INVALID_SERVER_CONFIG/)
})
