import { useEffect,useState } from 'react'
import { votingOperation,VotingError,votingMessage } from '../services/votacionesService'
import type { MiPadron,Opcion,Resultado } from '../types/votaciones'

export function ElectorModule(){
  const [padrones,setPadrones]=useState<MiPadron[]>([]),[selected,setSelected]=useState<MiPadron|null>(null)
  const [opciones,setOpciones]=useState<Opcion[]>([]),[option,setOption]=useState<Opcion|null>(null)
  const [resultados,setResultados]=useState<Resultado[]|null>(null)
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{let active=true;const abort=new AbortController();votingOperation<MiPadron[]>('mis_padrones',{},abort.signal).then(data=>{if(active)setPadrones(data)}).catch(e=>{if(active)setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false;abort.abort()}},[revision])
  async function open(padron:MiPadron){setBusy(true);setError('');setSuccess('');setOption(null);setConfirm(false);try{const data=await votingOperation<Opcion[]>('opciones',{id_padron:padron.id_padron});setOpciones(data);setSelected(padron)}catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}finally{setBusy(false)}}
  async function vote(){if(!selected||!option||busy)return;setBusy(true);setError('');try{const result=await votingOperation<{estado:string}>('emitir_voto',{id_padron:selected.id_padron,id_opcion_electoral:option.id_opcion_electoral});setSuccess(result.estado==='VOTO_REGISTRADO'?'Tu voto fue registrado. Gracias por participar.':'Ya registraste tu participación en este padrón.');setSelected(null);setConfirm(false);setRevision(v=>v+1)}catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}finally{setBusy(false)}}
  async function results(p:MiPadron){setBusy(true);setError('');try{setResultados(await votingOperation<Resultado[]>('resultados_publicos',{id_padron:p.id_padron}))}catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}finally{setBusy(false)}}
  return <section>
    <h2>Mis votaciones</h2>
    {busy&&<p role="status">Consultando votaciones...</p>}{error&&<p className="field-error" role="alert">{error}</p>}{success&&<p className="result-card" role="status">{success}</p>}
    {!selected?<><button className="refresh-button" disabled={busy} onClick={()=>{setBusy(true);setError('');setRevision(v=>v+1)}}>Actualizar votaciones</button>
      {!busy&&!padrones.length&&!error&&<p>No tienes padrones habilitados.</p>}
      <div className="voting-grid">{padrones.map(p=><article className="voting-item" key={p.id_padron}><h3>{p.evento}</h3><p>{p.nom_padron}</p><p className="catalog-timing">{p.fecha_inicio?new Date(p.fecha_inicio).toLocaleString('es-PE'):''} — {p.fecha_fin?new Date(p.fecha_fin).toLocaleString('es-PE'):''}</p>
        <p>{p.ya_voto?'Participación registrada':p.disponible?'Votación disponible':'Evento cerrado o fuera de horario'}</p><button disabled={busy||p.ya_voto||!p.disponible} onClick={()=>open(p)}>Ingresar a votar</button>{p.estado==='CERRADO'&&p.resultados_publicados&&<button className="refresh-button" disabled={busy} onClick={()=>results(p)}>Ver resultados publicados</button>}</article>)}</div>
      {resultados&&<div className="table-scroll"><table><thead><tr><th>Opción</th><th>Votos</th></tr></thead><tbody>{resultados.map(r=><tr key={r.id_opcion_electoral}><td>{r.nombre}</td><td>{r.votos}</td></tr>)}</tbody></table></div>}</>
      : <><h3>{selected.evento} · {selected.nom_padron}</h3>
        {confirm?<div className="result-card"><h3>Confirma tu selección</h3><p>{option?.nombre}</p><p>Solo puedes registrar una participación por padrón. Una vez confirmado, no podrás cambiarla.</p><button disabled={busy} onClick={vote}>Confirmar y registrar voto</button><button className="refresh-button" disabled={busy} onClick={()=>setConfirm(false)}>Revisar selección</button></div>
          :<><fieldset className="ballot" disabled={busy}><legend>Selecciona una opción</legend>{opciones.map(o=><label key={o.id_opcion_electoral} className="ballot-option"><input type="radio" name="opcion" checked={option?.id_opcion_electoral===o.id_opcion_electoral} onChange={()=>setOption(o)}/><span>{o.nombre}<small>{o.cargo??o.tipo_opcion}</small></span></label>)}</fieldset>{!opciones.length&&<p>No hay opciones disponibles.</p>}<button disabled={busy||!option} onClick={()=>setConfirm(true)}>Revisar y continuar</button></>}
        <button className="refresh-button" disabled={busy} onClick={()=>{setSelected(null);setOption(null);setConfirm(false)}}>Volver a mis votaciones</button></>}
  </section>
}
