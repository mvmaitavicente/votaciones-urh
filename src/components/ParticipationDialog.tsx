import {useEffect,useRef,useState} from 'react'
import {DataTable,type Column} from './DataTable'
import type {ParticipacionDetalle} from '../types/votaciones'
import {downloadParticipationExcel} from '../services/participationExcel'

export type ParticipationGroup='habilitados'|'emitidos'|'pendientes'
const titles={habilitados:'Electores habilitados',emitidos:'Personas que emitieron su voto',pendientes:'Personas pendientes de votar'}
const columns:Column<ParticipacionDetalle>[]=[
  {key:'nombre',label:'Nombre',value:p=>p.nombre},
  {key:'unidad_organica',label:'Unidad / dependencia',value:p=>p.unidad_organica||'—'},
  {key:'correo',label:'Correo',value:p=>p.correo||'—'},
  {key:'segmento',label:'Segmento',value:p=>p.segmento||'—'},
]

export function ParticipationDialog({group,detalle,padron,actualizado,busy=false,error,onClose}:{group:ParticipationGroup;detalle:ParticipacionDetalle[];padron:string;actualizado:Date|null;busy?:boolean;error?:string;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null)
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('')
  async function exportExcel(filtered:ParticipacionDetalle[]){
    if(exporting||!filtered.length)return
    setExporting(true);setExportError('')
    try{await downloadParticipationExcel(filtered,group,padron)}catch{setExportError('No se pudo generar el Excel. Intenta nuevamente.')}finally{setExporting(false)}
  }
  const rows=detalle.filter(p=>group==='habilitados'||(group==='emitidos'?p.ya_voto:!p.ya_voto))
  useEffect(()=>{
    const dialog=ref.current
    const trigger=document.activeElement
    dialog?.showModal()
    return()=>{dialog?.close();if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus()}
  },[])
  return <dialog ref={ref} className="participation-dialog" aria-labelledby="participation-title" aria-describedby="participation-description" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose()}}}>
    <header className="participation-dialog-heading"><div><h3 id="participation-title">{titles[group]}</h3><p>{padron}</p></div><button type="button" className="refresh-button" onClick={onClose} aria-label="Cerrar lista de personas" autoFocus>Cerrar</button></header>
    <p id="participation-description">Consulta de participación: no identifica la opción elegida por ninguna persona.</p>
    {actualizado&&<p className="participation-updated">Datos al {actualizado.toLocaleString('es-PE')}. Para renovarlos, cierra esta ventana y pulsa Actualizar resultados.</p>}
    {exportError&&<p className="field-error" role="alert">{exportError}</p>}
    {busy&&<p role="status">Consultando personas...</p>}{error&&<p className="field-error" role="alert">{error}</p>}
    {!busy&&!error&&<DataTable rows={rows} columns={columns} rowKey={(row,index)=>String(row.id_padron_detalle??index)} empty="No hay personas en esta lista." toolbar={filtered=><button type="button" className="refresh-button" disabled={exporting||!filtered.length} onClick={()=>void exportExcel(filtered)}>{exporting?'Generando Excel...':'Descargar Excel'}</button>}/>}
  </dialog>
}
