// No imprime identidad, trabajadores, secretos ni contenido de respuestas administrativas.
import assert from 'node:assert/strict'
const id_object=process.env.URH_TEST_OBJECT_ID,id_tenant=process.env.URH_TEST_TENANT_ID
if(!id_object||!id_tenant)throw new Error('TEST_IDENTITY_REQUIRED')
const base='https://feiztkc9.function2.insforge.app'
const checks=[]
async function call(slug,accion,datos={},origin,extra={}){
  const start=performance.now();const response=await fetch(`${base}/${slug}`,{method:'POST',headers:{'Content-Type':'application/json',...(origin!==undefined?{Origin:origin}:{})},body:JSON.stringify({id_object,id_tenant,accion,datos,...extra}),signal:AbortSignal.timeout(20000)})
  const body=await response.json();checks.push({slug,accion,status:response.status,estado:body.estado,ms:Math.round(performance.now()-start)});return{response,body}
}
let r=await call('verificar-acceso','verificar_acceso');assert.equal(r.response.status,200);assert.deepEqual(r.body.data.roles.sort(),['ADMINISTRADOR','ELECTOR'])
r=await call('operacion','administracion',{},'https://apps.powerapps.com');assert.equal(r.response.status,200);assert.equal(r.response.headers.get('Access-Control-Allow-Origin'),'https://apps.powerapps.com');assert.ok(Array.isArray(r.body.data.segmentos));assert.ok(Array.isArray(r.body.data.padrones))
r=await call('verificar-acceso','verificar_acceso',{},'https://evil.example.invalid');assert.equal(r.response.status,403);assert.equal(r.response.headers.get('Access-Control-Allow-Origin'),null)
r=await call('verificar-acceso','verificar_acceso',{},undefined,{roles:['ADMINISTRADOR']});assert.equal(r.response.status,400)
r=await call('verificar-acceso','verificar_acceso',{},undefined,{id_object:'00000000-0000-4000-8000-000000000000'});assert.equal(r.response.status,403)
r=await call('emitir-voto','guardar_evento');assert.equal(r.response.status,400)
r=await call('emitir-voto','emitir_voto',{id_padron:-1,id_opcion_electoral:-1});assert.equal(r.response.status,400);assert.ok(['TRABAJADOR_NO_VINCULADO','PADRON_INVALIDO','ELECTOR_NO_HABILITADO'].includes(r.body.estado))
r=await call('verificar-acceso-entra');assert.equal(r.response.status,401);assert.equal(r.body.estado,'TOKEN_AUSENTE')
const preflight=await fetch(`${base}/emitir-voto`,{method:'OPTIONS',headers:{Origin:'https://apps.powerapps.com','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://apps.powerapps.com')
console.log(JSON.stringify({checks,preflight:204,noElectionDataModified:true,success:true},null,2))
