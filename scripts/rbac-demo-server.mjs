import { createServer } from 'node:http'
import { createDemoHandler, createInsforgeRepository, uuidPattern } from '../functions/demo/verificar-acceso.ts'
import { createFixtureRepository, demoIdentities } from './rbac-demo-fixtures.mjs'

const fixtures = process.env.RBAC_DEMO_DATA_SOURCE === 'fixtures'
const origins = (process.env.RBAC_DEMO_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
let identities
try {
  identities = process.env.RBAC_DEMO_ALLOWED_IDENTITIES ? JSON.parse(process.env.RBAC_DEMO_ALLOWED_IDENTITIES) : fixtures ? demoIdentities : []
  if (!Array.isArray(identities) || !identities.every(id => id && typeof id.id_object === 'string' && typeof id.id_tenant === 'string' && uuidPattern.test(id.id_object) && uuidPattern.test(id.id_tenant))) throw new Error('INVALID_ALLOWLIST')
} catch {
  throw new Error('Configura RBAC_DEMO_ALLOWED_IDENTITIES con UUID válidos de cuentas de prueba.')
}
const enabled = process.env.RBAC_DEMO_ENABLED === 'true' && process.env.RBAC_DEMO_ENVIRONMENT === 'controlled-test'
if (!enabled || !origins.length || !identities.length) throw new Error('Demo deshabilitada. Configura .env.rbac.local según docs/rbac-demo.md.')
const repository = fixtures ? createFixtureRepository(process.env.RBAC_DEMO_FIXTURE_SCENARIO) : createInsforgeRepository(process.env.INSFORGE_BASE_URL || '', process.env.RBAC_SERVER_API_KEY || '')
const handler = createDemoHandler({ enabled, allowedOrigins: origins, allowedIdentities: identities, repository, dataSource: fixtures ? 'SIMULADA' : 'POSTGRESQL' })

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []
    let size = 0
    for await (const chunk of incoming) {
      size += chunk.length
      if (size > 1024) { outgoing.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); outgoing.end(JSON.stringify({ modo: 'RBAC_DEMO', fuenteDatos: fixtures ? 'SIMULADA' : 'POSTGRESQL', autorizado: false, estado: 'ERROR', usuario: null, roles: [], codigo: 'SOLICITUD_DEMASIADO_GRANDE' })); return }
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)
    // No confiar en Host o X-Forwarded-For del cliente. Solo loopback, puerto fijo.
    const request = new Request(`http://127.0.0.1:8787${incoming.url}`, {
      method: incoming.method, headers: new Headers(Object.entries(incoming.headers).filter(([, value]) => typeof value === 'string')),
      ...(body.length && !['GET', 'HEAD'].includes(incoming.method) ? { body } : {}),
    })
    const response = await handler(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    outgoing.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    outgoing.end(JSON.stringify({ modo: 'RBAC_DEMO', fuenteDatos: fixtures ? 'SIMULADA' : 'POSTGRESQL', autorizado: false, estado: 'ERROR', usuario: null, roles: [], codigo: 'VERIFICACION_NO_DISPONIBLE' }))
  }
})
server.requestTimeout = 10000
server.headersTimeout = 10000
server.listen(8787, '127.0.0.1', () => {
  console.log(`RBAC_DEMO local: http://127.0.0.1:8787/functions/verificar-acceso · ${fixtures ? 'DATOS FICTICIOS' : 'POSTGRESQL REAL (solo lectura)'}`)
})
