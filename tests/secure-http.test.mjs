import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { createEntraVerifier } from '../functions/shared/entra.ts'
import { createSecureAccessHandler } from '../functions/entra-verificar-acceso.ts'

test('Integración HTTP: Bearer firmado, respuesta y body de suplantación rechazado', async () => {
  const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const client = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const oid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const keys = await generateKeyPair('RS256', { extractable: true })
  const publicKey = { ...await exportJWK(keys.publicKey), kid: 'http-test-key', alg: 'RS256', use: 'sig' }
  const verifier = createEntraVerifier({ tenantId: tenant, audienceV2: client, audiencesV1: [client], allowedClients: [client], requiredScope: 'access_as_user' }, async input => {
    return String(input).includes('openid-configuration') ? Response.json({ issuer: `https://login.microsoftonline.com/${tenant}/v2.0`, jwks_uri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys` }) : Response.json({ keys: [publicKey] })
  })
  let reads = 0
  const handler = createSecureAccessHandler({ verifyToken: verifier, allowedOrigins: [], repository: {
    async findUsers(identity) { assert.deepEqual(identity, { id_object: oid, id_tenant: tenant }); reads++; return [{ id_usuario: 1, nombre: 'Cuenta ficticia', activo: true }] },
    async findRoleCodes() { return ['ELECTOR'] },
  } })
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const response = await handler(new Request('http://127.0.0.1/functions/verificar-acceso', { method: req.method, headers: new Headers(Object.entries(req.headers).filter(([, value]) => typeof value === 'string')), body: Buffer.concat(chunks) }))
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const seconds = Math.floor(Date.now() / 1000)
    const jwt = await new SignJWT({ ver: '2.0', iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: client, iat: seconds, nbf: seconds - 1, exp: seconds + 60, oid, tid: tenant, scp: 'access_as_user', azp: client }).setProtectedHeader({ alg: 'RS256', kid: 'http-test-key', typ: 'JWT' }).sign(keys.privateKey)
    const endpoint = `http://127.0.0.1:${server.address().port}/functions/verificar-acceso`
    const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
    const response = await fetch(endpoint, { method: 'POST', headers, body: '{}' })
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).roles, ['ELECTOR'])
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ oid: 'spoofed', roles: ['ADMINISTRADOR'] }) })).status, 400)
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
    assert.equal(reads, 1)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
