import {useEffect,useState} from 'react'
import {votingOperation,VotingError,votingMessage} from '../services/votacionesService'
import type {ResultsData,Participacion,ParticipacionDetalle,Resultado,ResumenEvento} from '../types/votaciones'
import {ParticipationDialog,type ParticipationGroup} from './ParticipationDialog'
import {SegmentResults} from './SegmentResults'
import {ParticipationBySegment} from './ParticipationBySegment'

const pct=(n:number,t:number)=>t?(n*100/t).toFixed(1):'0.0'

export function ResultadosView({data}:{data:ResultsData}){
  const [padronId,setPadronId]=useState(''),[resultados,setResultados]=useState<Resultado[]|null>(null),[participacion,setParticipacion]=useState<Participacion|null>(null),[resumen,setResumen]=useState<ResumenEvento|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[actualizado,setActualizado]=useState<Date|null>(null)
  const [totalEventoId,setTotalEventoId]=useState('')
  const [grupo,setGrupo]=useState<ParticipationGroup|null>(null),[personas,setPersonas]=useState<ParticipacionDetalle[]|null>(null),[personasBusy,setPersonasBusy]=useState(false),[personasError,setPersonasError]=useState(''),[personasFecha,setPersonasFecha]=useState<Date|null>(null)
  const total=padronId==='total',unicoEvento=data.eventos.find(e=>String(e.id_evento)===totalEventoId)??data.eventos[0]
  const padron=data.padrones.find(p=>String(p.id_padron)===padronId),evento=total?unicoEvento:data.eventos.find(e=>e.id_evento===padron?.id_evento),segmento=data.segmentos.find(s=>s.id_segmento===padron?.id_segmento)
  const puedeVerResultados=evento?.estado==='CERRADO'||(evento?.estado==='ABIERTO'&&evento.resultados_en_vivo===true)
  const eventoId=evento?.id_evento
  useEffect(()=>{
    if(!padronId)return
    let active=true
    Promise.resolve().then(()=>{if(!active)return;setBusy(true);setError('');setResultados(null);setParticipacion(null);setResumen(null);setActualizado(null)})
    async function load(){
      if(total){
        const response=await votingOperation<ResumenEvento>('participacion',{id_evento:eventoId,modo:'resumen'})
        if(response.version!==1||!Array.isArray(response.segmentos))throw new VotingError('RESUMEN_NO_INSTALADO')
        if(active)setResumen(response)
      }else{
        const body={id_padron:Number(padronId)}
        const [r,p]=await Promise.all([puedeVerResultados?votingOperation<Resultado[]>('resultados',body):Promise.resolve<Resultado[]>([]),votingOperation<Participacion>('participacion',body)])
        if(active){setResultados(r);setParticipacion(p)}
      }
      if(active)setActualizado(new Date())
    }
    load().catch(e=>{if(active)setError(total&&e instanceof VotingError&&['RESUMEN_NO_INSTALADO','PADRON_INVALIDO'].includes(e.code)?'La consulta Total requiere aplicar el SQL de resumen del evento.':votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[padronId,total,eventoId,puedeVerResultados,revision])
  useEffect(()=>{
    if(!grupo||!total||!eventoId)return
    let active=true
    votingOperation<{detalle:ParticipacionDetalle[]}>('participacion',{id_evento:eventoId,modo:'personas'}).then(p=>{if(!Array.isArray(p.detalle))throw new VotingError('RESPUESTA_INVALIDA');if(active){setPersonas(p.detalle);setPersonasFecha(new Date())}}).catch(e=>{if(active)setPersonasError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setPersonasBusy(false)})
    return()=>{active=false}
  },[grupo,total,eventoId])
  function openPeople(group:ParticipationGroup){setPersonas(null);setPersonasError('');setPersonasFecha(null);setPersonasBusy(total);setGrupo(group)}
  function reset(){setGrupo(null);setPersonas(null);setPersonasError('');setResultados(null);setParticipacion(null);setResumen(null);setActualizado(null);setError('')}
  const habilitados=total?resumen?.habilitados??0:participacion?.habilitados??0,emitidos=total?resumen?.participantes??0:participacion?.participantes??0,pendientes=Math.max(0,habilitados-emitidos)
  const loaded=total?Boolean(resumen):Boolean(resultados&&participacion)
  return <div className="results-view">
    <header className="results-banner"><div><p>RESULTADOS ELECTORALES</p><h3>{evento?.dsc_evento??'Selecciona un padrón para ver los resultados'}</h3>{evento?.dsc_sub_titulo&&<span>{evento.dsc_sub_titulo}</span>}</div>{evento&&<span className={'status-chip status-'+evento.estado.toLowerCase()}>{evento.estado==='CERRADO'?'Proceso finalizado':evento.estado}</span>}</header>
    <div className="results-filter field"><label htmlFor="results-padron">Padrón / segmento</label><select id="results-padron" value={padronId} onChange={e=>{reset();setPadronId(e.target.value);setBusy(Boolean(e.target.value))}}><option value="">Selecciona...</option>{unicoEvento&&<option value="total">TOTAL</option>}{data.padrones.map(p=><option key={p.id_padron} value={p.id_padron}>{p.nom_padron}</option>)}</select></div>
    {total&&data.eventos.length>1&&<div className="results-filter field"><label htmlFor="results-evento">Evento</label><select id="results-evento" value={unicoEvento?.id_evento??''} onChange={e=>{reset();setBusy(true);setTotalEventoId(e.target.value)}}>{data.eventos.map(e=><option key={e.id_evento} value={e.id_evento}>{e.dsc_evento}</option>)}</select></div>}
    <button type="button" className="refresh-button" disabled={!padronId||busy} onClick={()=>{reset();setBusy(true);setRevision(v=>v+1)}}>Actualizar resultados</button>
    {padronId&&actualizado&&<p role="status">Última actualización: {actualizado.toLocaleString('es-PE')}</p>}
    {busy&&<p role="status">Consultando resultados...</p>}{error&&<p className="field-error" role="alert">{error}</p>}
    {padronId&&loaded&&!busy&&<>
      <div className="results-kpis">
        <button type="button" className="results-kpi-button" onClick={()=>openPeople('habilitados')}><span>Total de electores habilitados</span><strong>{habilitados}</strong><small>Ver personas</small></button>
        <button type="button" className="results-kpi-button" onClick={()=>openPeople('emitidos')}><span>Votos emitidos</span><strong>{emitidos}</strong><em>{pct(emitidos,habilitados)} % participación</em><small>Ver personas</small></button>
        <button type="button" className="results-kpi-button" onClick={()=>openPeople('pendientes')}><span>Votos pendientes</span><strong>{pendientes}</strong><em>{pct(pendientes,habilitados)} % del total habilitado</em><small>Ver personas</small></button>
      </div>
      {total&&resumen&&<ParticipationBySegment segmentos={resumen.segmentos}/>}
      {!(total?resumen?.resultados_disponibles:puedeVerResultados)?<p className="result-card" role="status">Los resultados por candidato estarán disponibles al cerrar el evento, o durante la votación si se habilitaron en su configuración antes de abrirlo. Mientras tanto puedes ver la participación.</p>:total?resumen?.segmentos.map(s=><SegmentResults key={s.id_segmento} nombre={s.nombre} resultados={s.resultados} data={data}/>):<SegmentResults nombre={segmento?.dsc_segmento??padron?.nom_padron??''} resultados={resultados??[]} data={data}/>}
    </>}
    {grupo&&padronId&&!busy&&<ParticipationDialog key={padronId+grupo} group={grupo} detalle={total?personas??[]:participacion?.detalle??[]} padron={total?'Total · '+(evento?.dsc_evento??''):padron?.nom_padron??''} actualizado={total?personasFecha:actualizado} busy={total&&personasBusy} error={total?personasError:undefined} onClose={()=>setGrupo(null)}/>}
  </div>
}
