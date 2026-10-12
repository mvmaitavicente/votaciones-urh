import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { createEntraVerifier } from '../functions/shared/entra.ts'
import { createSecureAccessHandler } from '../functions/entra-verificar-acceso.ts'
import { authorizeIdentity, authorizeElectoralOperation } from '../functions/shared/authorization.ts'

const tenant = '7542cdab-2ecf-4371-956f-41795bcb56f7'
const api = 'f1eb7fb0-a90c-4efb-9a50-f1ddb2c719da'
const oid = '00000000-0000-4000-8000-000000000001'
const config = { tenantId: tenant, audiencesV1: [api, `api://${api}`], audienceV2: api, allowedClients: [api], requiredScope: 'access_as_user' }
const keys = await generateKeyPair('RS256', { extractable: true })
const otherKeys = await generateKeyPair('RS256', { extractable: true })
const publicJwk = { ...await exportJWK(keys.publicKey), kid: 'local-test-key', alg: 'RS256', use: 'sig' }
const secondJwk = { ...await exportJWK(otherKeys.publicKey), kid: 'rotated-test-key', alg: 'RS256', use: 'sig' }
const issuer = version => version === '1.0' ? `https://sts.windows.net/${tenant}/` : `https://login.microsoftonline.com/${tenant}/v2.0`

function discovery({ failMetadata = false, failJwks = false, keys = () => [publicJwk] } = {}) {
  const counts = { metadata: 0, jwks: 0 }
  const fetcher = async input => {
    const url = String(input)
    assert.ok(url.startsWith(`https://login.microsoftonline.com/`))
    if (url.includes('openid-configuration')) {
      counts.metadata++
      if (failMetadata) throw new TypeError('Simulated network failure, not a secret')
      const version = url.includes('/v2.0/') ? '2.0' : '1.0'
      return Response.json({ issuer: issuer(version), jwks_uri: version === '1.0' ? 'https://login.microsoftonline.com/common/discovery/keys' : `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys` })
    }
    counts.jwks++
    if (failJwks) return new Response('Unavailable', { status: 503 })
    return Response.json({ keys: keys() })
  }
  return { counts, verify: createEntraVerifier(config, fetcher) }
}
async function token(overrides = {}, { version = '2.0', signingKey = keys.privateKey, kid = 'local-test-key' } = {}) {
  const seconds = Math.floor(Date.now() / 1000)
  const claims = { ver: version, iss: issuer(version), aud: api, iat: seconds, nbf: seconds - 1, exp: seconds + 300,
    oid, tid: tenant, scp: 'access_as_user', ...(version === '1.0' ? { appid: api } : { azp: api }), ...overrides }
  for (const key of Object.keys(claims)) if (claims[key] === undefined) delete claims[key]
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' }).sign(signingKey)
}
function repository(roles = ['ADMINISTRADOR'], { inactive = false, missing = false, fail = false } = {}) {
  const calls = []
  return { calls,
    async findUsers(identity) {
      calls.push(identity)
      if (fail) throw new Error('Private SQL details not returned')
      if (missing) return []
      return [{ id_usuario: 1, nombre: 'Cuenta ficticia', activo: !inactive }]
    },
    async findRoleCodes() { return roles },
  }
}
function handler(repo = repository(), verifier = discovery().verify, options = {}) {
  return createSecureAccessHandler({ repository: repo, verifyToken: verifier, allowedOrigins: ['https://allowed.example.invalid'], ...options })
}
function request(bearer, options = {}) {
  return new Request('https://function.example.invalid/verificar-acceso', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: '{}', ...options })
}

for (const version of ['1.0', '2.0']) test(`Firma real local y claims Entra ${version}`, async () => {
  const jwt = await token({}, { version })
  assert.deepEqual(await discovery().verify(jwt), { id_object: oid, id_tenant: tenant })
})
test('v1 admite únicamente las audiencias configuradas GUID y URI', async () => {
  assert.equal((await discovery().verify(await token({ aud: `api://${api}` }, { version: '1.0' }))).id_object, oid)
  await assert.rejects(discovery().verify(await token({ aud: `api://${api}` })), error => error.status === 401)
})
for (const [name, overrides, expected] of [
  ['expirado', { exp: Math.floor(Date.now() / 1000) - 60 }, 401],
  ['nbf futuro', { nbf: Math.floor(Date.now() / 1000) + 120 }, 401],
  ['otro tenant', { tid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, 401],
  ['issuer ajeno', { iss: 'https://untrusted.invalid' }, 401],
  ['Microsoft Graph', { aud: '00000003-0000-0000-c000-000000000000' }, 401],
  ['ID token sin scp', { scp: undefined }, 401],
  ['permiso delegado insuficiente', { scp: 'other_scope' }, 403],
  ['cliente OAuth no autorizado', { azp: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, 403],
  ['sin oid', { oid: undefined }, 401],
  ['sin tid', { tid: undefined }, 401],
  ['sin exp', { exp: undefined }, 401],
  ['sin nbf', { nbf: undefined }, 401],
  ['app-only', { idtyp: 'app' }, 401],
]) test(`Rechaza token ${name}`, async () => {
  const repo = repository()
  const response = await handler(repo)(request(await token(overrides)))
  assert.equal(response.status, expected)
  assert.equal(repo.calls.length, 0)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const data = await response.json(); assert.equal(data.usuario, null); assert.deepEqual(data.roles, [])
})
test('Firma inválida, token manipulado y algoritmo no permitido', async () => {
  for (const jwt of [await token({}, { signingKey: otherKeys.privateKey }), 'invalid.token.text',
    await new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: 'test', typ: 'JWT' }).sign(new Uint8Array(32))]) {
    assert.equal((await handler()(request(jwt))).status, 401)
  }
})
test('v1 cliente appid debe estar expresamente autorizado', async () => {
  assert.equal((await handler()(request(await token({ appid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { version: '1.0' })))).status, 403)
})
for (const roles of [['ADMINISTRADOR'], ['ELECTOR'], ['ADMINISTRADOR', 'ELECTOR', 'ELECTOR']]) test(`Roles reales del repositorio ${roles.join(',')}`, async () => {
  const repo = repository(roles)
  const response = await handler(repo)(request(await token()))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.roles, [...new Set(roles)].sort())
  assert.deepEqual(repo.calls, [{ id_object: oid, id_tenant: tenant }])
  assert.equal('modo' in data, false)
})
for (const [name, roles, options] of [['inactivo', ['ELECTOR'], { inactive: true }], ['inexistente', ['ELECTOR'], { missing: true }], ['sin roles', [], {}]]) test(`Deniega usuario ${name}`, async () => {
  const response = await handler(repository(roles, options))(request(await token()))
  assert.equal(response.status, 403)
  const data = await response.json(); assert.equal(data.usuario, null); assert.deepEqual(data.roles, [])
})
test('Token ausente, GET y solicitud malformada', async () => {
  assert.equal((await handler()(request(null))).status, 401)
  assert.equal((await handler()(new Request('https://function.example.invalid/verificar-acceso'))).status, 405)
  const jwt = await token()
  for (const body of ['{', '[]', JSON.stringify({ oid: 'spoofed' }), JSON.stringify({ roles: ['ADMINISTRADOR'] }), JSON.stringify({ id_object: oid, id_tenant: tenant })]) {
    const repo = repository(); assert.equal((await handler(repo)(request(jwt, { body }))).status, 400); assert.equal(repo.calls.length, 0)
  }
})
test('CORS permite origen conocido, rechaza desconocido y admite conector sin Origin', async () => {
  const fn = handler(); const jwt = await token()
  const preflight = await fn(new Request('https://function.example.invalid/verificar-acceso', { method: 'OPTIONS', headers: { Origin: 'https://allowed.example.invalid' } }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://allowed.example.invalid')
  const blocked = await fn(request(jwt, { headers: { Origin: 'https://evil.invalid', Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' } }))
  assert.equal(blocked.status, 403); assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal((await fn(request(jwt))).status, 200)
})
test('Base caída y JWKS/discovery inaccesibles fallan cerrado sin filtrar SQL', async () => {
  const jwt = await token()
  const sql = await handler(repository([], { fail: true }))(request(jwt))
  assert.equal(sql.status, 503); assert.equal((await sql.text()).includes('Private SQL'), false)
  for (const options of [{ failMetadata: true }, { failJwks: true }]) assert.equal((await handler(repository(), discovery(options).verify)(request(jwt))).status, 503)
})
test('Caché y solicitudes concurrentes solo descargan metadata/JWKS una vez', async () => {
  const remote = discovery(); const jwt = await token()
  const responses = await Promise.all(Array.from({ length: 20 }, () => handler(repository(), remote.verify)(request(jwt))))
  assert.ok(responses.every(response => response.status === 200))
  assert.deepEqual(remote.counts, { metadata: 1, jwks: 1 })
})
test('Rotación JWKS refresca al vencer cooldown, sin aceptar firma desconocida', async () => {
  let rotate = false
  const remote = discovery({ keys: () => rotate ? [publicJwk, secondJwk] : [publicJwk] })
  await remote.verify(await token())
  rotate = true
  const rotated = await token({}, { kid: 'rotated-test-key', signingKey: otherKeys.privateKey })
  await assert.rejects(remote.verify(rotated), error => error.status === 401)
  const original = Date.now
  Date.now = () => original() + 31000
  try { assert.equal((await remote.verify(rotated)).id_object, oid) } finally { Date.now = original }
  assert.equal(remote.counts.jwks, 2)
})
test('Guard reevalúa roles en cada operación y exige rol + padrón para electores', async () => {
  const identity = { id_object: oid, id_tenant: tenant }
  const repo = repository(['ELECTOR'])
  await assert.rejects(authorizeIdentity(identity, repo, 'ADMINISTRADOR'), error => error.status === 403)
  await assert.rejects(authorizeElectoralOperation(identity, repo, async () => false), error => error.status === 403)
  assert.equal((await authorizeElectoralOperation(identity, repo, async () => true)).estado, 'AUTORIZADO')
  repo.findRoleCodes = async () => []
  await assert.rejects(authorizeIdentity(identity, repo, 'ELECTOR'), error => error.status === 403)
})
test('Límite de frecuencia por instancia devuelve 429 y se recupera', async () => {
  let time = 1000
  const fn = handler(repository(), discovery().verify, { now: () => time })
  for (let i = 0; i < 600; i++) assert.equal((await fn(request(null))).status, 401)
  assert.equal((await fn(request(null))).status, 429)
  time += 60000; assert.equal((await fn(request(null))).status, 401)
})
