import {createAdminClient} from '@insforge/sdk'
import {functionalEntry} from './api.ts'
import {photoRpc,PHOTO_BUCKET} from './photo.ts'

export default functionalEntry('guardar_foto',(rpc,baseUrl,apiKey)=>{
  const storage=createAdminClient({baseUrl,apiKey}).storage.from(PHOTO_BUCKET)
  return photoRpc(rpc,storage)
})
