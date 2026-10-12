import { createServer } from 'node:http'
import { createSecureHandlerFromEnvironment } from '../functions/entra-verificar-acceso.ts'
const handler = createSecureHandlerFromEnvironment(name => process.env[name])
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; let bytes = 0
    for await (const chunk of incoming) { bytes += chunk.length; if (bytes > 1024) { outgoing.writeHead(400, { 'Cache-Control': 'no-store' }); outgoing.end(); return }; chunks.push(chunk) }
    const body = Buffer.concat(chunks)
    const response = await handler(new Request(`http://127.0.0.1:8788${incoming.url}`, {
      method: incoming.method, headers: new Headers(Object.entries(incoming.headers).filter(([, value]) => typeof value === 'string')),
      ...(body.length && !['GET', 'HEAD'].includes(incoming.method) ? { body } : {}),
    }))
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch { outgoing.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); outgoing.end('{"autorizado":false,"estado":"ERROR_INTERNO","usuario":null,"roles":[]}') }
})
server.requestTimeout = 10000; server.headersTimeout = 10000
server.listen(8788, '127.0.0.1', () => console.log('API Entra local: 127.0.0.1:8788. Token Microsoft obligatorio; sin modo demo.'))
