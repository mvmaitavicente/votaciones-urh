import {useState} from 'react'
import {votingOperation,VotingError,votingMessage} from '../services/votacionesService'
import {CandidatePhoto} from './CandidatePhoto'

export function CandidatePhotoEditor({id,url,name,onSaved}:{id:number;url?:string|null;name:string;onSaved:()=>void}){
  const [preview,setPreview]=useState(''),[saved,setSaved]=useState(url),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  async function choose(file?:File){
    setError('');setMessage('');setPreview('')
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024||!file.size){setError('Selecciona JPG, PNG o WebP de hasta 2 MB.');return}
    setBusy(true)
    try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error());reader.readAsDataURL(file)});setPreview(data)}
    catch{setError('No se pudo leer la imagen.')}
    finally{setBusy(false)}
  }
  async function upload(){
    if(!preview||busy)return
    setBusy(true);setError('');setMessage('')
    try{const result=await votingOperation<{foto_url:string}>('guardar_foto',{id_candidatura:id,imagen:preview});setSaved(result.foto_url);setPreview('');setMessage('Foto guardada.');onSaved()}
    catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}
    finally{setBusy(false)}
  }
  return <section className="photo-editor" aria-label="Foto del candidato">
    <h3>Foto del candidato</h3><CandidatePhoto src={preview||saved} name={name}/>
    <div className="field"><label htmlFor="candidate-photo-file">Seleccionar foto (JPG, PNG o WebP; hasta 2 MB)</label>
      <input id="candidate-photo-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>void choose(event.target.files?.[0])}/></div>
    {error&&<p role="alert" className="field-error">{error}</p>}{message&&<p role="status">{message}</p>}
    <button type="button" disabled={!preview||busy} onClick={()=>void upload()}>{busy?'Procesando foto...':'Guardar foto'}</button>
  </section>
}
