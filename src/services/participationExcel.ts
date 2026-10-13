import type {ParticipacionDetalle} from '../types/votaciones'

export async function participationWorkbook(rows:ParticipacionDetalle[]){
  const {default:ExcelJS}=await import('exceljs')
  const workbook=new ExcelJS.Workbook()
  const sheet=workbook.addWorksheet('Personas')
  sheet.columns=[
    {header:'Nombre',key:'nombre',width:38},
    {header:'Unidad / dependencia',key:'unidad_organica',width:45},
    {header:'Correo',key:'correo',width:42},
    {header:'Segmento',key:'segmento',width:30},
  ]
  rows.forEach(p=>sheet.addRow({nombre:p.nombre,unidad_organica:p.unidad_organica??'',correo:p.correo??'',segmento:p.segmento??''}))
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFA61934'}}
  sheet.views=[{state:'frozen',ySplit:1}]
  sheet.autoFilter='A1:D'+Math.max(1,sheet.rowCount)
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

export async function downloadParticipationExcel(rows:ParticipacionDetalle[],group:string,padron:string){
  const bytes=await participationWorkbook(rows)
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
  const slug=padron.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'padron'
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const link=document.createElement('a')
  link.href=url;link.download=`${group}-${slug}-${date}.xlsx`
  document.body.append(link)
  try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
}
