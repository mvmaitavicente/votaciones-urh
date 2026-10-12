import { spawnSync } from 'node:child_process'
const connector = 'shared_urh-2dvotaciones-2dapi-5f9ce53a357a6829e8-5fc7aadcb41a91d842'
function run(args) {
  const script = args.map(arg => "'" + arg.replaceAll("'", "''") + "'").join(' ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `& (Get-Command pa.cmd).Source ${script}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Power Apps CLI rechazó la operación. Revisa pa auth status y el entorno configurado.')
  const output = result.stdout
  const first = output.indexOf('{'), last = output.lastIndexOf('}')
  return JSON.parse(output.slice(first, last + 1))
}
const connections = run(['connection', 'list', '--search', connector, '--json', '--non-interactive'])
const matches = (connections.items ?? []).filter(item => item.properties?.apiId?.endsWith('/' + connector)
  && item.properties?.statuses?.some(status => status.status === 'Connected'))
const explicit = process.env.URH_CONNECTION_ID
const connection = explicit ? matches.find(item => item.name === explicit) : matches.length === 1 ? matches[0] : undefined
if (!connection) {
  console.error('No hay una conexión única Connected para URH-VOTACIONES-API. Crea/selecciona la conexión con tu cuenta y define URH_CONNECTION_ID si hay varias. No se generaron bindings.')
  process.exitCode = 1
} else {
  run(['app', 'add', 'data-source', '--connector', connector, '--connection-id', connection.name, '--json', '--non-interactive'])
  console.log('Bindings generados por Power Apps CLI. Revisar src/generated/appschemas/dataSourcesInfo.ts y compilar.')
}
