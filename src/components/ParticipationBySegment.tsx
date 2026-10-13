import type {ResumenSegmento} from '../types/votaciones'
export function ParticipationBySegment({segmentos}:{segmentos:ResumenSegmento[]}){
  const max=Math.max(1,...segmentos.flatMap(s=>[s.participantes,Math.max(0,s.habilitados-s.participantes)]))
  return <section className="participation-by-segment" aria-label="Participación por segmento"><h3>Participación por segmento</h3><div className="participation-legend"><span><i className="emitted-color"/>Votos emitidos</span><span><i className="pending-color"/>Votos pendientes</span></div>
    {segmentos.length?segmentos.map(s=>{const pendientes=Math.max(0,s.habilitados-s.participantes);return <div className="participation-segment" key={s.id_segmento}><div className="participation-segment-label"><strong>{s.nombre}</strong><small>{s.habilitados} habilitados · {s.habilitados?(s.participantes*100/s.habilitados).toFixed(1):'0.0'} % participación</small></div><div className="participation-horizontal-bars">{[{label:'Emitidos',value:s.participantes,style:'emitted-color'},{label:'Pendientes',value:pendientes,style:'pending-color'}].map(b=><div className="participation-horizontal-row" key={b.label}><span>{b.label}</span><div className="participation-bar-track"><div className={b.style} style={{width:`${b.value*100/max}%`}}/></div><b>{b.value}</b></div>)}</div></div>}):<p>No hay padrones configurados para este evento.</p>}
  </section>
}
