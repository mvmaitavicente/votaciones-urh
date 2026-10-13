import {useEffect,useState} from 'react'
import {votingOperation,VotingError,votingMessage} from '../services/votacionesService'
import type {AdminData,Participacion,Resultado} from '../types/votaciones'

const colors=['#c8183a','#2f6f9f','#9db8d4','#e8808f','#f2b8c0','#6b7f94','#d9a441','#4c9a7a']
const pct=(n:number,t:number)=>t?(n*100/t).toFixed(1):'0.0'
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()

export function ResultadosView({data}:{data:AdminData}){
  const [padronId,setPadronId]=useState(''),[resultados,setResultados]=useState<Resultado[]|null>(null),[participacion,setParticipacion]=useState<Participacion|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const padron=data.padrones.find(p=>String(p.id_padron)===padronId),evento=data.eventos.find(e=>e.id_evento===padron?.id_evento),segmento=data.segmentos.find(s=>s.id_segmento===padron?.id_segmento)
  useEffect(()=>{
    if(!padronId)return
    let active=true
    const body={id_padron:Number(padronId)}
    Promise.resolve().then(()=>{if(!active)return;setBusy(true);setError('');setResultados(null);setParticipacion(null)})
    Promise.all([evento?.estado==='CERRADO'?votingOperation<Resultado[]>('resultados',body):Promise.resolve<Resultado[]>([]),votingOperation<Participacion>('participacion',body)]).then(([r,p])=>{if(active){setResultados(r);setParticipacion(p)}}).catch(e=>{if(active)setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[padronId,evento?.estado])
  const candidatos=(resultados??[]).filter(r=>r.tipo_opcion==='CANDIDATURA').sort((a,b)=>b.votos-a.votos),otros=(resultados??[]).filter(r=>r.tipo_opcion!=='CANDIDATURA')
  const validos=candidatos.reduce((s,r)=>s+r.votos,0),max=Math.max(1,...candidatos.map(r=>r.votos))
  const habilitados=participacion?.habilitados??0,emitidos=participacion?.participantes??0,pendientes=Math.max(0,habilitados-emitidos)
  const foto=(id:number)=>data.opciones.find(o=>o.id_opcion_electoral===id)?.foto_url
  return <div className="results-view">
    <header className="results-banner"><div><p>RESULTADOS ELECTORALES</p><h3>{evento?.dsc_evento??'Selecciona un padrón para ver los resultados'}</h3>{evento?.dsc_sub_titulo&&<span>{evento.dsc_sub_titulo}</span>}</div>{evento&&<span className={'status-chip status-'+evento.estado.toLowerCase()}>{evento.estado==='CERRADO'?'Proceso finalizado':evento.estado}</span>}</header>
    <div className="results-filter field"><label htmlFor="results-padron">Padrón / segmento</label><select id="results-padron" value={padronId} onChange={e=>setPadronId(e.target.value)}><option value="">Selecciona...</option>{data.padrones.map(p=><option key={p.id_padron} value={p.id_padron}>{p.nom_padron}</option>)}</select></div>
    {busy&&<p role="status">Consultando resultados...</p>}{error&&<p className="field-error" role="alert">{error}</p>}
    {resultados&&participacion&&<>
      <div className="results-kpis">
        <div><span>Total de electores habilitados</span><strong>{habilitados}</strong></div>
        <div><span>Votos emitidos</span><strong>{emitidos}</strong><em>{pct(emitidos,habilitados)} % participación</em></div>
        <div><span>Votos pendientes</span><strong>{pendientes}</strong><em>{pct(pendientes,habilitados)} % del total habilitado</em></div>
      </div>
      {evento?.estado!=='CERRADO'?<p className="result-card" role="status">Los resultados por candidato estarán disponibles cuando el evento se cierre. Mientras tanto puedes ver la participación.</p>:<div className="results-panel">
        <section className="results-chart"><h4>Resultados por candidato</h4><p>Segmento: {segmento?.dsc_segmento??padron?.nom_padron} | Porcentaje y cantidad de votos válidos</p>
          {candidatos.length?<div className="results-bars" role="list">{candidatos.map((r,i)=><div className="results-bar-col" role="listitem" key={r.id_opcion_electoral}><span className="results-pct">{pct(r.votos,validos)} %</span><div className="results-bar" style={{height:`${Math.max(4,r.votos*100/max)}%`,background:colors[i%colors.length]}}><b>{r.votos}</b></div>
            <span className="results-avatar">{foto(r.id_opcion_electoral)?<img src={foto(r.id_opcion_electoral) as string} alt=""/>:initials(r.nombre)}</span><span className="results-name">{r.nombre}</span></div>)}</div>:<p>Sin votos válidos registrados.</p>}</section>
        <aside className="results-summary"><h4>Resumen de votos válidos</h4><ul>{candidatos.map((r,i)=><li key={r.id_opcion_electoral}><i style={{background:colors[i%colors.length]}}/><span>{r.nombre}</span><b>{r.votos}</b><b>{pct(r.votos,validos)} %</b></li>)}</ul>
          <div className="results-total"><span>Total de votos válidos</span><b>{validos}</b><b>100 %</b></div>
          {otros.length>0&&<ul className="results-others">{otros.map(r=><li key={r.id_opcion_electoral}><span>{r.nombre}</span><b>{r.votos}</b></li>)}</ul>}</aside>
      </div>}</>}
  </div>
}
