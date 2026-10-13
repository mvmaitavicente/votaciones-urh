import {FunctionalError,type FunctionalRpc} from './api.ts'

export const PHOTO_BUCKET='urh-candidatos'
export function decodePhoto(value:unknown) {
  if(typeof value!=='string'||value.length>2800000)throw new FunctionalError('FOTO_INVALIDA')
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if(!match)throw new FunctionalError('FOTO_INVALIDA')
  let bytes:Uint8Array
  try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))}catch{throw new FunctionalError('FOTO_INVALIDA')}
  if(!bytes.length||bytes.length>2*1024*1024)throw new FunctionalError('FOTO_INVALIDA')
  const mime=match[1]
  const isPng=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
  const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255
  const isWebp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'
  if(!(mime==='image/png'&&isPng||mime==='image/jpeg'&&isJpeg||mime==='image/webp'&&isWebp))throw new FunctionalError('FOTO_INVALIDA')
  return {bytes,mime,extension:mime==='image/jpeg'?'jpg':mime.split('/')[1]}
}

type Storage={upload:(key:string,file:File)=>Promise<{data:{key:string;url:string}|null;error:unknown}>;remove:(key:string)=>Promise<unknown>}
export function photoRpc(rpc:FunctionalRpc,storage:Storage):FunctionalRpc{
  return async request=>{
    const id=request.datos.id_candidatura
    if(!Number.isSafeInteger(id)||Number(id)<=0)throw new FunctionalError('CANDIDATURA_INVALIDA')
    const photo=decodePhoto(request.datos.imagen)
    // Check database authorization and event state before storing anything.
    await rpc({...request,accion:'preparar_foto',datos:{id_candidatura:id}})
    const key=`${id}/${crypto.randomUUID()}.${photo.extension}`
    const result=await storage.upload(key,new File([photo.bytes as BlobPart],`foto.${photo.extension}`,{type:photo.mime}))
    if(result.error||!result.data)throw new FunctionalError('FOTO_NO_GUARDADA',503)
    // The database checks authorization/state again under lock, then swaps references.
    // Do not delete on an ambiguous RPC network failure: the commit may have succeeded.
    const saved=await rpc({...request,accion:'guardar_foto',datos:{id_candidatura:id,foto_url:result.data.url,foto_key:result.data.key}}) as {foto_anterior?:string|null}
    if(saved.foto_anterior&&saved.foto_anterior!==result.data.key&&saved.foto_anterior.startsWith(`${id}/`)){
      await storage.remove(saved.foto_anterior).catch(()=>undefined)
    }
    return {foto_url:result.data.url,foto_key:result.data.key}
  }
}
