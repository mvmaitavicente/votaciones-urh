import {useEffect,useState} from 'react'
import {votingOperation,VotingError,votingMessage} from '../services/votacionesService'
import {AdminModule,type AdminTab} from './AdminModule'
import {ElectorModule} from './ElectorModule'
import {ResultsModule} from './ResultsModule'
import {functionalPermissions,validFunctionalRoles} from '../services/functionalPermissions'
import type {FunctionalAccess} from '../types/votaciones'
import './Workspace.css'

const sections:AdminTab[]=['Eventos','Segmentos','Padrones','Trabajadores','Candidaturas','Opciones','Participación','Resultados']
const paths=[
 'M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14',
 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',
 'M16 21v-3a4 4 0 0 0-8 0v3 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6 M16 11h6',
 'M4 4h16v16H4z M8 17c0-4 8-4 8 0 M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 'M4 5h4v4H4z M12 7h8 M4 15h4v4H4z M12 17h8',
 'M3 12h4l3-7 4 14 3-7h4',
 'M4 21V11h4v10 M10 21V4h4v17 M16 21v-7h4v7',
]
function Icon({index}:{index:number}){return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[index]??'M5 12l4 4L19 6 M3 3h18v18H3z'}/></svg>}

export function FunctionalApp(){
 const [access,setAccess]=useState<FunctionalAccess|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [page,setPage]=useState<AdminTab|'Mis votaciones'|null>(null)
 const [expanded,setExpanded]=useState(()=>window.matchMedia('(min-width: 1100px)').matches)
 useEffect(()=>{let active=true;const abort=new AbortController();votingOperation<FunctionalAccess>('verificar_acceso',{},abort.signal).then(a=>{if(!a.autorizado||a.modo!=='FASE_FUNCIONAL_GUID'||!validFunctionalRoles(a.roles))throw new VotingError('SIN_ACCESO');if(active)setAccess(a)}).catch(e=>{if(active)setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false;abort.abort()}},[revision])
 const {canAdmin,canVote,canSupervise,canResults}=functionalPermissions(access?.roles)
 const current=page??(canAdmin?'Eventos':canVote?'Mis votaciones':'Resultados')
 function navigate(next:AdminTab|'Mis votaciones'){setPage(next);if(window.matchMedia('(max-width: 760px)').matches)setExpanded(false)}
 function refresh(){setAccess(null);setPage(null);setBusy(true);setError('');setRevision(v=>v+1)}
 return <div className={`workspace ${expanded?'sidebar-expanded':'sidebar-collapsed'}`}>
  <a className="skip-link" href="#workspace-content">Ir al contenido</a>
  <aside className="workspace-sidebar" aria-label="Menú principal">
   <div className="sidebar-brand"><div className="sidebar-copy sidebar-user"><strong>{access?.usuario.nombre??'Acceso al sistema'}</strong><small>{canAdmin?'Administrador':canSupervise?canVote?'Elector y Supervisor':'Supervisor':canVote?'Elector':'Verificando identidad'}</small></div></div>
   <button className="sidebar-toggle" aria-expanded={expanded} aria-controls="workspace-navigation" aria-label={expanded?'Contraer menú':'Expandir menú'} onClick={()=>setExpanded(v=>!v)} title={expanded?'Contraer menú':'Expandir menú'}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={expanded?'M11 17l-5-5 5-5M18 17l-5-5 5-5':'M13 17l5-5-5-5M6 17l5-5-5-5'}/></svg><span className="sidebar-copy">Ocultar menú</span></button>
   <nav id="workspace-navigation" aria-label="Secciones">
    {canAdmin&&<><p className="nav-label sidebar-copy">GESTIÓN ELECTORAL</p>{sections.map((section,i)=><button key={section} title={section} aria-label={section} aria-current={current===section?'page':undefined} onClick={()=>navigate(section)}><Icon index={i}/><span className="sidebar-copy">{section}</span></button>)}</>}
    {!canAdmin&&canSupervise&&<><p className="nav-label sidebar-copy">SUPERVISIÓN ELECTORAL</p><button title="Resultados" aria-label="Resultados" aria-current={current==='Resultados'?'page':undefined} onClick={()=>navigate('Resultados')}><Icon index={7}/><span className="sidebar-copy">Resultados</span></button></>}
    {canVote&&<><p className="nav-label sidebar-copy">MI PARTICIPACIÓN</p><button title="Mis votaciones" aria-label="Mis votaciones" aria-current={current==='Mis votaciones'?'page':undefined} onClick={()=>navigate('Mis votaciones')}><Icon index={8}/><span className="sidebar-copy">Mis votaciones</span></button></>}
   </nav>
   <div className="sidebar-bottom sidebar-copy">Sistema de Votaciones<small>Unidad de Recursos Humanos</small></div>
  </aside>
  <div className="workspace-body">
   <main id="workspace-content" tabIndex={-1} className="workspace-content">
    <div className="workspace-intro"><div><p className="eyebrow">GESTIÓN Y PARTICIPACIÓN ELECTORAL</p><h1>{access?current:'Bienvenido a URH'}</h1></div></div>
    <div className="workspace-panel">{busy&&<div className="workspace-empty" role="status"><span className="loading-dot"/>Verificando tu acceso…</div>}{error&&<p className="field-error" role="alert">{error}</p>}
     {!busy&&!access&&<button onClick={refresh}>Reintentar</button>}
     {access&&!busy&&(current==='Mis votaciones'?canVote?<ElectorModule nombre={access.usuario.nombre}/>:<p>No tienes permiso para este módulo.</p>:current==='Resultados'?canResults?<ResultsModule/>:<p>No tienes permiso para este módulo.</p>:canAdmin?<AdminModule key={current} initialTab={current}/>:<p>No tienes permiso para este módulo.</p>)}
    </div>
    <footer>PRONIED · Unidad de Recursos Humanos · Sistema de Votaciones</footer>
   </main>
  </div>
 </div>
}
