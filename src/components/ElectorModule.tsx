import {CandidatePhoto} from './CandidatePhoto'
import { useEffect,useState } from 'react'
import { votingOperation,VotingError,votingMessage } from '../services/votacionesService'
import type { MiPadron,Opcion,Resultado } from '../types/votaciones'

type Constancia={padron:MiPadron;fecha:Date}
const pad=(n:number)=>String(n).padStart(2,'0')
const formatFecha=(d:Date)=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const icon={
  user:<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6z"/></svg>,
  org:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="9" y="3" width="6" height="5"/><rect x="3" y="16" width="6" height="5"/><rect x="15" y="16" width="6" height="5"/><path d="M12 8v4M6 16v-4h12v4"/></svg>,
  mail:<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18a1 1 0 0 1 1 1v.5l-10 6.5L2 6.5V6a1 1 0 0 1 1-1zm-1 4.3 10 6.5 10-6.5V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>,
  group:<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2 19c0-3.5 3-5.5 7-5.5s7 2 7 5.5zm14.5-5c3 0 5.5 1.6 5.5 4.5h-4.6c0-1.8-.4-3.2-1.7-4.2.2-.2.5-.3.8-.3z"/></svg>,
  calendar:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  doc:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>,
  download:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>
}
function descargarConstancia(fecha:Date){
  const previous=document.title
  const restore=()=>{document.title=previous;window.removeEventListener('afterprint',restore)}
  document.title=`Constancia-Votacion-${fecha.getFullYear()}${pad(fecha.getMonth()+1)}${pad(fecha.getDate())}-${pad(fecha.getHours())}${pad(fecha.getMinutes())}`
  window.addEventListener('afterprint',restore)
  window.print()
}
function DatosElector({padron,nombre,className='ballot-data'}:{padron:MiPadron;nombre:string;className?:string}){
  return <dl className={className}>
    <div><span className="ballot-data-icon" aria-hidden="true">{icon.user}</span><span><dt>Nombres y apellidos completos</dt><dd>{padron.nombre_completo||nombre}</dd></span></div>
    <div><span className="ballot-data-icon" aria-hidden="true">{icon.org}</span><span><dt>Unidad orgánica</dt><dd>{padron.unidad_organica||'—'}</dd></span></div>
    <div><span className="ballot-data-icon" aria-hidden="true">{icon.mail}</span><span><dt>Correo electrónico</dt><dd>{padron.correo||'—'}</dd></span></div>
    <div><span className="ballot-data-icon" aria-hidden="true">{icon.group}</span><span><dt>Segmento</dt><dd><span className="segment-pill">{padron.dsc_segmento||padron.nom_padron}</span></dd></span></div>
  </dl>
}
export function ElectorModule({nombre}:{nombre:string}){
  const [padrones,setPadrones]=useState<MiPadron[]>([]),[selected,setSelected]=useState<MiPadron|null>(null)
  const [opciones,setOpciones]=useState<Opcion[]>([]),[option,setOption]=useState<Opcion|null>(null)
  const [resultados,setResultados]=useState<Resultado[]|null>(null)
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState(''),[revision,setRevision]=useState(0),[constancia,setConstancia]=useState<Constancia|null>(null)
  useEffect(()=>{let active=true;const abort=new AbortController();votingOperation<MiPadron[]>('mis_padrones',{},abort.signal).then(data=>{if(active)setPadrones(data)}).catch(e=>{if(active)setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false;abort.abort()}},[revision])
  async function open(padron:MiPadron){setBusy(true);setError('');setSuccess('');setOption(null);setConfirm(false);try{const data=await votingOperation<Opcion[]>('opciones',{id_padron:padron.id_padron});setOpciones(data);setSelected(padron)}catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}finally{setBusy(false)}}
  async function vote(){if(!selected||!option||busy)return;setBusy(true);setError('');try{const result=await votingOperation<{estado:string}>('emitir_voto',{id_padron:selected.id_padron,id_opcion_electoral:option.id_opcion_electoral});if(result.estado==='VOTO_REGISTRADO')setConstancia({padron:selected,fecha:new Date()});else setSuccess('Ya registraste tu participación en este padrón.');setSelected(null);setConfirm(false);setRevision(v=>v+1)}catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}finally{setBusy(false)}}
  async function results(p:MiPadron){setBusy(true);setError('');try{setResultados(await votingOperation<Resultado[]>('resultados_publicos',{id_padron:p.id_padron}))}catch(e){setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}finally{setBusy(false)}}
  return <section>
    {busy&&<p role="status">Consultando votaciones...</p>}{error&&<p className="field-error" role="alert">{error}</p>}{success&&<p className="result-card" role="status">{success}</p>}
    {constancia?<>
      <header className="receipt-banner"><span className="receipt-check" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><div><h2>¡Tu voto ha sido registrado!</h2><p>Gracias por participar en el proceso electoral.</p></div></header>
      <section className="ballot-step receipt-card" aria-labelledby="receipt-title">
        <div className="receipt-head"><span className="receipt-doc" aria-hidden="true">{icon.doc}</span><div><h3 id="receipt-title">Constancia de Votación</h3><p>Este documento certifica que tu voto ha sido registrado correctamente en el proceso electoral. Tu participación contribuye al fortalecimiento de la gestión institucional.</p></div><button className="receipt-download receipt-action" onClick={()=>descargarConstancia(constancia.fecha)}>{icon.download}Descargar constancia</button></div>
        <div className="receipt-event"><p>Evento</p><h4>{constancia.padron.evento}</h4>{constancia.padron.dsc_sub_titulo&&<><p className="receipt-sub-label">Subtítulo</p><p className="receipt-sub">{constancia.padron.dsc_sub_titulo}</p></>}</div>
        <DatosElector padron={constancia.padron} nombre={nombre} className="ballot-data receipt-data"/>
        <dl className="ballot-data receipt-data receipt-date"><div><span className="ballot-data-icon" aria-hidden="true">{icon.calendar}</span><span><dt>Fecha y hora de registro</dt><dd>{formatFecha(constancia.fecha)}</dd></span></div></dl>
        <div className="receipt-footer"><p><span className="ballot-alert" aria-hidden="true">i</span><span>Esta constancia acredita únicamente que tu voto ha sido registrado. Por motivos de confidencialidad, no se muestra la opción seleccionada.</span></p><button className="receipt-action refresh-button" onClick={()=>setConstancia(null)}>⌂ Volver al inicio</button></div>
      </section></>
    :!selected?<>
      {!busy&&!padrones.length&&!error&&<p>No tienes padrones habilitados.</p>}
      <div className="voting-grid">{padrones.map(p=><article className="voting-item" key={p.id_padron}><h3>{p.evento}</h3><p><span className="segment-pill">{p.nom_padron}</span></p><p className="catalog-timing">{p.fecha_inicio?new Date(p.fecha_inicio).toLocaleString('es-PE'):''} — {p.fecha_fin?new Date(p.fecha_fin).toLocaleString('es-PE'):''}</p>
        <p>{p.ya_voto?'Participación registrada':p.disponible?'Votación disponible':'Evento cerrado o fuera de horario'}</p><button disabled={busy||p.ya_voto||!p.disponible} onClick={()=>open(p)}>Ingresar a votar</button>{p.ya_voto&&p.fecha_voto&&<button className="refresh-button" disabled={busy} onClick={()=>setConstancia({padron:p,fecha:new Date(p.fecha_voto as string)})}>{icon.download}Descargar constancia</button>}{p.estado==='CERRADO'&&p.resultados_publicados&&<button className="refresh-button" disabled={busy} onClick={()=>results(p)}>Ver resultados publicados</button>}</article>)}</div>
      {resultados&&<div className="table-scroll"><table><thead><tr><th>Opción</th><th>Votos</th></tr></thead><tbody>{resultados.map(r=><tr key={r.id_opcion_electoral}><td>{r.nombre}</td><td>{r.votos}</td></tr>)}</tbody></table></div>}</>
      : <><header className="ballot-event-heading">
          <h2>{selected.evento}</h2>
          {selected.dsc_sub_titulo&&<p className="ballot-subtitle">{selected.dsc_sub_titulo}</p>}
        </header>
        <section className="ballot-instructions" aria-labelledby="ballot-instructions-title">
          <span className="ballot-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></span>
          <div className="ballot-instructions-body">
            <h3 id="ballot-instructions-title">Indicaciones</h3>
            {selected.dsc_mensaje&&<p>{selected.dsc_mensaje}</p>}
            <p className="ballot-instructions-lead">Para emitir tu voto:</p>
            <ol>
              <li>Completa tus datos.</li>
              <li>Ubica a los candidatos correspondientes a tu segmento.</li>
              <li>Elige al candidato que consideres idóneo para representarte.</li>
            </ol>
          </div>
          <div className="ballot-reminder"><span className="ballot-alert" aria-hidden="true">!</span><p><strong>Recuerda:</strong>solo puedes votar una vez.</p></div>
        </section>
        <section className="ballot-step" aria-labelledby="ballot-data-title">
          <h3 id="ballot-data-title"><span className="step-number">1</span>Tus datos</h3>
          <p className="step-help">Verifica que tu información sea correcta. Estos datos se registrarán junto con tu voto.</p>
          <DatosElector padron={selected} nombre={nombre}/>
        </section>
        <section className="ballot-step" aria-labelledby="ballot-candidates-title">
        <h3 id="ballot-candidates-title"><span className="step-number">2</span>Selecciona a tu candidato</h3>
        <p className="step-help">Segmento: {selected.nom_padron} | Selecciona una sola opción.</p>
        {confirm?<div className="result-card"><h3>Confirma tu selección</h3>{option?.tipo_opcion==='CANDIDATURA'&&<CandidatePhoto src={option.foto_url} name={option.nombre}/>}<p>{option?.nombre}</p>{option?.cargo&&<p>{option.cargo}</p>}{option?.unidad&&<p>{option.unidad}</p>}<p>Solo puedes registrar una participación (voto). Una vez confirmado, no podrás cambiarla.</p><button disabled={busy} onClick={vote}>Confirmar y registrar voto</button><button className="refresh-button" disabled={busy} onClick={()=>setConfirm(false)}>Revisar selección</button></div>
          :<><fieldset className="ballot" disabled={busy}>          <legend className="sr-only">Selecciona una opción</legend>{opciones.map(o=>{const candidate=o.tipo_opcion==='CANDIDATURA';return <label key={o.id_opcion_electoral} className={candidate?'ballot-option':'ballot-option ballot-option-blank'}><input type="radio" name="opcion" checked={option?.id_opcion_electoral===o.id_opcion_electoral} onChange={()=>setOption(o)}/>{candidate?<><span className="ballot-option-head"><CandidatePhoto src={o.foto_url} name={o.nombre}/><span className="ballot-option-name">{o.nombre}</span></span><span className="ballot-option-meta"><em>Cargo</em>{o.cargo??'Candidatura'}</span>{o.unidad&&<span className="ballot-option-meta"><em>Unidad</em>{o.unidad}</span>}</>:<><span className="ballot-blank-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></span><span className="ballot-option-name">{o.nombre}</span><span className="ballot-blank-help">Si consideras que ninguno de los candidatos te representa.</span></>}</label>})}</fieldset>{!opciones.length&&<p>No hay opciones disponibles.</p>}<div className="ballot-actions"><button className="refresh-button" disabled={busy} onClick={()=>{setSelected(null);setOption(null);setConfirm(false)}}>Volver a mis votaciones</button><button className="ballot-continue" disabled={busy||!option} onClick={()=>setConfirm(true)}>Continuar →</button></div></>}
                  </section></>}
  </section>
}
