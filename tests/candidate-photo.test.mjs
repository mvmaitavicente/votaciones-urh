import test from 'node:test'
import assert from 'node:assert/strict'
import {decodePhoto,photoRpc} from '../functions/functional/photo.ts'
import {FunctionalError} from '../functions/functional/api.ts'

const imagen='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const request={id_object:'a',id_tenant:'b',accion:'guardar_foto',datos:{id_candidatura:1,imagen}}
test('Fotos rechazan SVG, contenido falso y exceso de tamano',()=>{
  assert.equal(decodePhoto(imagen).mime,'image/png')
  for(const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,aGVsbG8=', 'x'.repeat(2800001)])assert.throws(()=>decodePhoto(value),/FOTO_INVALIDA/)
})
test('No sube archivo sin autorizacion PostgreSQL',async()=>{
  const run=photoRpc(async()=>{throw new FunctionalError('PERMISO_INSUFICIENTE',403)},{upload:async()=>{assert.fail('No debe subir')},remove:async()=>{}})
  await assert.rejects(run(request),/PERMISO_INSUFICIENTE/)
})
test('Guarda URL y key antes de retirar foto anterior',async()=>{
  const steps=[]
  const run=photoRpc(async r=>{steps.push(r.accion);if(r.accion==='guardar_foto'){assert.equal(r.datos.foto_key,'1/new.png');assert.equal(r.datos.imagen,undefined);return {foto_anterior:'1/old.png'}}return {}},{upload:async()=>{steps.push('upload');return {data:{key:'1/new.png',url:'https://example.com/photo.png'},error:null}},remove:async key=>{steps.push(key)}})
  const result=await run(request)
  assert.equal(result.foto_key,'1/new.png')
  assert.deepEqual(steps,['preparar_foto','upload','guardar_foto','1/old.png'])
})
