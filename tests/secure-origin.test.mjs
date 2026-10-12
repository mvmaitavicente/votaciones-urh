import test from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { createSecureAccessHandler } from '../functions/entra-verificar-acceso.ts'
import { createEntraVerifier } from '../functions/shared/entra.ts'

const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const api = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const oid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const keys = await generateKeyPair('RS256', { extractable: true })
const jwk = { ...await exportJWK(keys.publicKey), kid: 'origin-test', alg: 'RS256', use: 'sig' }
const seconds = Math.floor(Date.now() / 1000)
const jwt = await new SignJWT({ ver: '2.0', iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: api, iat: seconds, nbf: seconds - 1, exp: seconds + 300, oid, tid: tenant, scp: 'access_as_user', azp: api }).setProtectedHeader({ alg: 'RS256', kid: 'origin-test', typ: 'JWT' }).sign(keys.privateKey)
const verify = createEntraVerifier({ tenantId: tenant, audienceV2: api, audiencesV1: [api], allowedClients: [api], requiredScope: 'access_as_user' }, async input => String(input).includes('openid-configuration')
  ? Response.json({ issuer: `https://login.microsoftonline.com/${tenant}/v2.0`, jwks_uri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys` }) : Response.json({ keys: [jwk] }))
function setup(allowedOrigins = ['https://allowed.example.invalid']) {
  const diagnostics = []; const reads = []
  const handler = createSecureAccessHandler({ verifyToken: verify, allowedOrigins,
    repository: { async findUsers(identity) { reads.push(identity); return [{ id_usuario: 1, nombre: 'Cuenta ficticia', activo: true }] }, async findRoleCodes() { return ['ELECTOR'] } },
    onOriginRejected: event => diagnostics.push(event),
  })
  return { handler, diagnostics, reads }
}
const post = (token, origin) => new Request('https://function.example.invalid/verificar-acceso', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin !== undefined ? { Origin: origin } : {}) }, body: '{}' })
test('POST sin Origin y sin token -> 401, nunca consulta RBAC', async () => {
  const { handler, reads } = setup(); const response = await handler(post())
  assert.equal(response.status, 401); assert.equal((await response.json()).estado, 'TOKEN_AUSENTE'); assert.equal(reads.length, 0)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
})
test('POST sin Origin con JWT firmado válido -> RBAC y 200', async () => {
  const { handler, reads, diagnostics } = setup(); const response = await handler(post(jwt))
  assert.equal(response.status, 200); assert.deepEqual(reads, [{ id_object: oid, id_tenant: tenant }]); assert.equal(diagnostics.length, 0)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
})
test('Origin explícito no autorizado -> 403 y diagnóstico sin tokens', async () => {
  const { handler, reads, diagnostics } = setup(); const response = await handler(post(jwt, 'https://gateway.example.invalid'))
  assert.equal(response.status, 403); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null); assert.equal(reads.length, 0)
  assert.equal(diagnostics[0].origin, 'https://gateway.example.invalid'); assert.equal(diagnostics[0].originPresent, true)
  assert.equal(response.headers.get('X-URH-Diagnostic-Id'), diagnostics[0].requestId)
  assert.equal(JSON.stringify(diagnostics).includes(jwt), false)
})
test('Origin permitido con JWT válido -> RBAC y CORS exacto', async () => {
  const { handler, reads } = setup(); const response = await handler(post(jwt, 'https://allowed.example.invalid'))
  assert.equal(response.status, 200); assert.equal(reads.length, 1); assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://allowed.example.invalid')
})
test('Token inválido sin Origin -> 401', async () => {
  const { handler, reads } = setup(); assert.equal((await handler(post('invalid-test-token'))).status, 401); assert.equal(reads.length, 0)
})
test('Portal Power Automate exacto permitido exige JWT; dominios parecidos rechazados', async () => {
  const { handler, reads } = setup(['https://make.powerautomate.com'])
  assert.equal((await handler(post(undefined, 'https://make.powerautomate.com'))).status, 401)
  assert.equal((await handler(post(jwt, 'https://make.powerautomate.com'))).status, 200)
  assert.equal((await handler(post(jwt, 'https://make.powerautomate.com.evil.invalid'))).status, 403)
  assert.equal(reads.length, 1)
})
test('Origin vacío o null explícito no equivale a Origin ausente', async () => {
  for (const origin of ['', 'null']) {
    const { handler, reads } = setup(); assert.equal((await handler(post(jwt, origin))).status, 403); assert.equal(reads.length, 0)
  }
})
test('Diagnóstico elimina credenciales/query y se limita a cinco eventos por minuto', async () => {
  const { handler, diagnostics } = setup()
  for (let i = 0; i < 7; i++) assert.equal((await handler(post(undefined, 'https://secret-user:secret-password@unlisted.invalid/path?token=secret-token'))).status, 403)
  assert.equal(diagnostics.length, 5)
  const logged = JSON.stringify(diagnostics)
  for (const value of ['secret-user', 'secret-password', 'secret-token']) assert.equal(logged.includes(value), false)
})
