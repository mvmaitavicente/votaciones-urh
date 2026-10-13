import {useEffect,useState} from 'react'
import {ResultadosView} from './ResultadosView'
import {votingOperation,VotingError,votingMessage} from '../services/votacionesService'
import type {ResultsData} from '../types/votaciones'

export function ResultsModule(){
  const [data,setData]=useState<ResultsData|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{
    let active=true;const abort=new AbortController()
    votingOperation<ResultsData>('administracion',{vista:'resultados'},abort.signal).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false;abort.abort()}
  },[revision])
  return <section>{busy&&<p role="status">Consultando información de resultados...</p>}{error&&<p className="field-error" role="alert">{error}</p>}{!busy&&!data&&<button type="button" className="refresh-button" onClick={()=>{setBusy(true);setError('');setRevision(v=>v+1)}}>Reintentar</button>}{data&&<ResultadosView data={data}/>}</section>
}
