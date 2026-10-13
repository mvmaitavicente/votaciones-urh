import type {ResultsData,Resultado} from '../types/votaciones'
const colors=['#c8183a','#2f6f9f','#9db8d4','#e8808f','#f2b8c0','#6b7f94','#d9a441','#4c9a7a']
const pct=(n:number,t:number)=>t?(n*100/t).toFixed(1):'0.0'
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()
export function SegmentResults({nombre,resultados,data}:{nombre:string;resultados:Resultado[];data:ResultsData}){
  const candidatos=resultados.filter(r=>r.tipo_opcion==='CANDIDATURA').sort((a,b)=>b.votos-a.votos),otros=resultados.filter(r=>r.tipo_opcion!=='CANDIDATURA')
  const validos=candidatos.reduce((s,r)=>s+r.votos,0),max=Math.max(1,...candidatos.map(r=>r.votos))
  const foto=(id:number)=>data.opciones.find(o=>o.id_opcion_electoral===id)?.foto_url
  return <section className="segment-results" aria-label={'Resultados de '+nombre}><h3 className="segment-results-title">{nombre}</h3><div className="results-panel">
    <section className="results-chart"><h4>Resultados por candidato</h4><p>Porcentaje y cantidad de votos válidos</p>
      {candidatos.length?<div className="results-bars" role="list">{candidatos.map((r,i)=><div className="results-bar-col" role="listitem" key={r.id_opcion_electoral}><span className="results-pct">{pct(r.votos,validos)} %</span><div className="results-bar" style={{height:`${Math.max(4,r.votos*100/max)}%`,background:colors[i%colors.length]}}><b>{r.votos}</b></div><span className="results-avatar">{foto(r.id_opcion_electoral)?<img src={foto(r.id_opcion_electoral) as string} alt=""/>:initials(r.nombre)}</span><span className="results-name">{r.nombre}</span></div>)}</div>:<p>No hay candidaturas registradas.</p>}
    </section><aside className="results-summary"><h4>Resumen de votos válidos</h4><ul>{candidatos.map((r,i)=><li key={r.id_opcion_electoral}><i style={{background:colors[i%colors.length]}}/><span>{r.nombre}</span><b>{r.votos}</b><b>{pct(r.votos,validos)} %</b></li>)}</ul><div className="results-total"><span>Total de votos válidos</span><b>{validos}</b><b>{validos?'100':'0'} %</b></div>{otros.length>0&&<ul className="results-others">{otros.map(r=><li key={r.id_opcion_electoral}><span>{r.nombre}</span><b>{r.votos}</b></li>)}</ul>}</aside>
  </div></section>
}
