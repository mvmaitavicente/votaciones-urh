import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

function dataModule(source) {
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
}
const typesUrl = dataModule(fs.readFileSync('src/types/access.ts', 'utf8'))
const source = fs.readFileSync('src/services/accessService.ts', 'utf8').replace("'../types/access'", JSON.stringify(typesUrl))
const load = config => import(dataModule(source.replaceAll('import.meta.env', JSON.stringify(config))))
const identity = { objectId: '00000000-0000-4000-8000-000000000004', tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'No enviar', userPrincipalName: 'no-enviar@example.invalid' }
const success = { modo: 'RBAC_DEMO', fuenteDatos: 'SIMULADA', autorizado: true, estado: 'AUTORIZADO', usuario: { id_usuario: 4, nombre: 'Prueba' }, roles: ['ADMINISTRADOR'] }

test('Frontend demo deshabilitado en producción incluso con flag true', async () => {
  const module = await load({ DEV: false, VITE_RBAC_DEMO_ENABLED: 'true' })
  assert.equal(module.rbacDemoEnabled, false)
  await assert.rejects(module.verificarAcceso(identity, new AbortController().signal), /deshabilitado/)
})
test('Cliente solo envía UUID, valida respuesta y rechaza URL pública', async () => {
  const module = await load({ DEV: true, VITE_RBAC_DEMO_ENABLED: 'true' })
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url.hostname, '127.0.0.1')
      assert.deepEqual(JSON.parse(init.body), { id_object: identity.objectId, id_tenant: identity.tenantId })
      assert.equal(init.headers.Authorization, undefined)
      return Response.json(success)
    }
    assert.deepEqual(await module.verificarAcceso(identity, new AbortController().signal), success)
    const remote = await load({ DEV: true, VITE_RBAC_DEMO_ENABLED: 'true', VITE_RBAC_DEMO_URL: 'https://public.invalid/functions/verificar-acceso' })
    await assert.rejects(remote.verificarAcceso(identity, new AbortController().signal), /local controlado/)
    await assert.rejects(module.verificarAcceso({ ...identity, objectId: null }, new AbortController().signal), /identificadores/)
    for (const invalid of [{ ...success, roles: ['SUPERADMIN'] }, { ...success, autorizado: false }, { ...success, usuario: null }, { ...success, roles: [] }]) {
      assert.throws(() => module.parseAccessResponse(invalid), /inválida/)
    }
    globalThis.fetch = async () => Response.json({ estado: 'ERROR' }, { status: 503 })
    await assert.rejects(module.verificarAcceso(identity, new AbortController().signal), /No se pudo verificar/)
  } finally { globalThis.fetch = original }
})
