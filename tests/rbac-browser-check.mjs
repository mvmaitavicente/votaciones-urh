// E2E opcional: servidor fixture en 8787, Vite demo en 5176 y Edge CDP en 9230.
// El host Microsoft se simula únicamente mediante DevTools, nunca en código de la app.
import assert from 'node:assert/strict'
let pages
for (let attempt = 0; attempt < 30; attempt++) {
  try { pages = await (await fetch('http://localhost:9230/json/list')).json(); break }
  catch { await new Promise(resolve => setTimeout(resolve, 200)) }
}
if (!pages) throw new Error('Inicia Edge headless con CDP en el puerto 9230.')
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let sequence = 0
const pending = new Map()
const events = []
socket.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const task = pending.get(message.id)
    pending.delete(message.id)
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result)
  } else events.push(message)
}
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
})
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) throw new Error('Error de evaluación en navegador')
  return result.result.value
}
async function waitFor(expression) {
  const end = Date.now() + 20000
  while (Date.now() < end) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout: ${expression}`)
}
const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)})?.click()`)
let scriptId
const results = []
try {
  await call('Page.enable')
  await call('Network.enable')
  for (let number = 1; number <= 7; number++) {
    if (scriptId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId })
    const user = { objectId: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Cuenta ficticia', userPrincipalName: 'fixture@example.invalid' }
    const script = await call('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.powerAppsBridge={initialize:async()=>{},executePluginAsync:async()=>({user:${JSON.stringify(user)}})}` })
    scriptId = script.identifier
    const eventStart = events.length
    await call('Page.navigate', { url: 'http://localhost:5176/' })
    await waitFor("document.querySelector('.main-card')?.getAttribute('aria-busy') === 'false'")
    const text = await evaluate('document.body.innerText')
    if (number <= 3) {
      assert.ok(text.includes('NO TIENES ACCESO PARA VISUALIZAR ESTA PÁGINA'), JSON.stringify({ number, text, bridgeExists: await evaluate("Boolean(globalThis.powerAppsBridge)"), requests: events.filter(event => event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('verificar-acceso')).map(event => event.params.request.method), responses: events.filter(event => event.method === 'Network.responseReceived' && event.params.response.url.includes('verificar-acceso')).map(event => ({status:event.params.response.status,type:event.params.type})), networkErrors: events.filter(event => event.method === 'Network.loadingFailed').map(event => event.params.errorText) }))
      assert.equal(await evaluate("document.querySelector('.demo-menu') === null"), true)
    } else if (number === 7) {
      assert.ok(text.includes('No se pudo verificar tu acceso. Inténtalo nuevamente.'))
      assert.equal(await evaluate("document.querySelector('.demo-menu') === null"), true)
      await click('Reintentar')
      await waitFor("document.querySelector('.main-card')?.getAttribute('aria-busy') === 'false'")
    } else {
      assert.ok(text.includes('DATOS SIMULADOS'))
      const menu = await evaluate("Array.from(document.querySelectorAll('.demo-menu button')).map(button=>button.textContent)")
      assert.deepEqual(menu, number === 4 ? ['Administración'] : number === 5 ? ['Votaciones'] : ['Administración', 'Votaciones'])
      if (number !== 5) {
        for (const title of ['Gestión de eventos', 'Gestión de padrones', 'Gestión de candidaturas', 'Gestión de usuarios', 'Resultados']) {
          await click(title)
          await waitFor(`document.body.innerText.includes(${JSON.stringify('Pantalla base de ' + title.toLowerCase())})`)
          await click('Volver al panel')
        }
      }
      if (number === 6) {
        await click('Votaciones')
        await waitFor("document.body.innerText.includes('La emisión de votos está deshabilitada.')")
        await click('Administración')
      }
    }
    const requests = events.slice(eventStart).filter(event => event.method === 'Network.requestWillBeSent' && event.params.request.method === 'POST' && event.params.request.url.includes('/functions/verificar-acceso'))
    assert.equal(requests.length, number === 7 ? 2 : 1, 'No consultar permisos en cada render/navegación')
    for (const event of requests) {
      assert.deepEqual(Object.keys(JSON.parse(event.params.request.postData)).sort(), ['id_object', 'id_tenant'])
    }
    assert.equal(events.slice(eventStart).filter(event => event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('insforge.app')).length, 0)
    results.push({ case: number, navigation: 'OK', accessCalls: requests.length })
  }
  console.log(JSON.stringify({ mode: 'RBAC_DEMO', microsoftHost: 'SIMULADO', repository: 'SIMULADO', results }))
} finally {
  await call('Browser.close').catch(() => {})
  socket.close()
}
