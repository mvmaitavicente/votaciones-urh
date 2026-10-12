import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const urlModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
const types = urlModule(fs.readFileSync('src/types/secureAccess.ts', 'utf8'))
const connector = 'shared_urh-2dvotaciones-2dapi-5f9ce53a357a6829e8-5fc7aadcb41a91d842'
const metadata = { [connector]: { tableId: connector, apis: { VerificarAcceso: { path: '/verificar-acceso', method: 'POST', parameters: [{ name: 'body', in: 'body', required: true, type: 'object' }] } } } }
async function adapter(dataSourcesInfo) {
  const source = fs.readFileSync('src/services/powerAppsAccessService.ts', 'utf8')
    .replace("import { getClient } from '@microsoft/power-apps/data'", 'const getClient = () => ({ executeAsync: (...args) => globalThis.__testConnector(...args) })')
    .replace("'../types/secureAccess'", JSON.stringify(types))
    .replace(/const bindings = [\s\S]*?\n\]\)/, dataSourcesInfo ? `const bindings = { test: async () => ({ dataSourcesInfo: ${JSON.stringify(dataSourcesInfo)} }) }` : 'const bindings = {}')
  return import(urlModule(source))
}
test('Adaptador usa operación oficial y body vacío, sin identidad/token/roles del cliente', async () => {
  const saved = globalThis.__testConnector
  try {
    let calls = 0
    globalThis.__testConnector = async operation => {
      calls++
      assert.deepEqual(operation, { connectorOperation: { tableName: connector, operationName: 'VerificarAcceso', parameters: { body: {} } } })
      return { success: true, data: { autorizado: true, estado: 'AUTORIZADO', usuario: { id_usuario: 1, nombre: 'Prueba' }, roles: ['ELECTOR'] } }
    }
    const instance = await adapter(metadata)
    assert.deepEqual((await instance.verifyAccessFromPowerApps(new AbortController().signal)).roles, ['ELECTOR'])
    assert.equal(calls, 1)
    globalThis.__testConnector = async () => ({ success: false, error: { status: 401, message: 'test' } })
    await assert.rejects(instance.verifyAccessFromPowerApps(new AbortController().signal), error => error.kind === 'authentication')
    globalThis.__testConnector = async () => ({ success: false, data: { autorizado: false, estado: 'SIN_ROLES', usuario: null, roles: [] } })
    await assert.rejects(instance.verifyAccessFromPowerApps(new AbortController().signal), error => error.kind === 'no-roles')
  } finally { globalThis.__testConnector = saved }
})
test('Bindings ausentes o con operación inválida fallan cerrado antes del SDK', async () => {
  const saved = globalThis.__testConnector
  try {
    globalThis.__testConnector = () => { throw new Error('No debe invocarse el SDK') }
    for (const data of [undefined, { otherConnector: metadata[connector] }, { [connector]: { ...metadata[connector], apis: {} } }]) {
      await assert.rejects((await adapter(data)).verifyAccessFromPowerApps(new AbortController().signal), error => error.kind === 'configuration')
    }
  } finally { globalThis.__testConnector = saved }
})
