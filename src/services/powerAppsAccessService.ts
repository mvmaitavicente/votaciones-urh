import { getClient } from '@microsoft/power-apps/data'
import { AccessProblem, parseSecureAccess, type SecureAccessResponse } from '../types/secureAccess'

// Only CLI-generated schema is accepted. No fallback fetch, token or identity from getContext.
const bindings = import.meta.glob<{ dataSourcesInfo: Parameters<typeof getClient>[0] }>([
  '../generated/appschemas/dataSourcesInfo.ts', '/generated/appschemas/dataSourcesInfo.ts',
])
const connectorName = 'shared_urh-2dvotaciones-2dapi-5f9ce53a357a6829e8-5fc7aadcb41a91d842'

export async function verifyAccessFromPowerApps(signal: AbortSignal): Promise<SecureAccessResponse> {
  if (signal.aborted) throw new AccessProblem('connection', 'Consulta cancelada.')
  const loader = Object.values(bindings)[0]
  if (!loader) throw new AccessProblem('configuration', 'Falta agregar la conexión URH-VOTACIONES-API a Code Apps y generar sus bindings.')
  const { dataSourcesInfo } = await loader()
  const source = Object.entries(dataSourcesInfo).find(([key]) => key.toLowerCase() === connectorName)
  if (!source) throw new AccessProblem('configuration', 'Los bindings no incluyen URH-VOTACIONES-API.')
  const operation = Object.entries(source[1].apis).find(([key]) => key === 'VerificarAcceso')
  if (!operation || operation[1].method.toUpperCase() !== 'POST') throw new AccessProblem('configuration', 'El conector no contiene la operación POST VerificarAcceso.')
  const parameters: Record<string, object> = {}
  for (const parameter of operation[1].parameters) {
    if (parameter.in === 'body') parameters[parameter.name] = {}
    else if (parameter.required) throw new AccessProblem('configuration', 'La operación exige parámetros no previstos en el contrato seguro.')
  }
  try {
    const result = await getClient(dataSourcesInfo).executeAsync<Record<string, object>, unknown>({
      connectorOperation: { tableName: source[0], operationName: operation[0], parameters },
    })
    if (signal.aborted) throw new AccessProblem('connection', 'Consulta cancelada.')
    // Some SDK/connector versions expose structured error bodies as data.
    if (result.data && typeof result.data === 'object' && 'autorizado' in result.data) return parseSecureAccess(result.data)
    if (!result.success) {
      const error: unknown = result.error
      const status = error && typeof error === 'object'
        ? ('status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined) : undefined
      throw new AccessProblem(status === 401 ? 'authentication' : status === 403 ? 'denied' : 'connection', 'No se pudo verificar el acceso mediante el conector.')
    }
    return parseSecureAccess(result.data)
  } catch (error) {
    if (error instanceof AccessProblem) throw error
    throw new AccessProblem('connection', 'No se pudo conectar con el servicio de autorización.')
  }
}
