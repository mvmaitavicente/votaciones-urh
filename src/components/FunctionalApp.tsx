import {useEffect,useState} from 'react'
import {votingOperation,VotingError,votingMessage} from '../services/votacionesService'
import {AdminModule} from './AdminModule'
import {ElectorModule} from './ElectorModule'
import type {FunctionalAccess} from '../types/votaciones'

export function FunctionalApp(){
  const [access,setAccess]=useState<FunctionalAccess|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[module,setModule]=useState<'admin'|'elector'|null>(null)
  useEffect(()=>{let active=true;const abort=new AbortController();votingOperation<FunctionalAccess>('verificar_acceso',{},abort.signal).then(a=>{if(!a.autorizado||a.modo!=='FASE_FUNCIONAL_GUID'||!Array.isArray(a.roles)||!a.roles.length||!a.roles.every(r=>r==='ADMINISTRADOR'||r==='ELECTOR'))throw new VotingError('SIN_ACCESO');if(active)setAccess(a)}).catch(e=>{if(active)setError(votingMessage(e instanceof VotingError?e.code:'SERVICIO_NO_DISPONIBLE'))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false;abort.abort()}},[revision])
  const current=module??(access?.roles.includes('ADMINISTRADOR')?'admin':'elector')
  const canAdmin=access?.roles.includes('ADMINISTRADOR'),canVote=access?.roles.includes('ELECTOR')
  return <main className="app-shell"><header className="page-header"><div className="brand-mark" aria-hidden="true">URH</div><div><p className="eyebrow">UNIDAD DE RECURSOS HUMANOS</p><h1>URH - Sistema de Votaciones</h1><p className="subtitle">Gestión y participación electoral</p></div></header>
    <p className="demo-notice">FASE FUNCIONAL DE PRUEBAS: los GUID del contexto no prueban criptográficamente quién llama al backend. No utilizar para una elección real.</p>
    <section className="main-card">{busy&&<p role="status">Verificando acceso...</p>}{error&&<p className="field-error" role="alert">{error}</p>}
      {!busy&&!access&&<button onClick={()=>{setBusy(true);setError('');setRevision(v=>v+1)}}>Reintentar</button>}
      {access&&!busy&&<><p>Bienvenido, {access.usuario.nombre}</p><nav className="demo-menu" aria-label="Módulos">{canAdmin&&<button aria-current={current==='admin'?'page':undefined} onClick={()=>setModule('admin')}>Administración</button>}{canVote&&<button aria-current={current==='elector'?'page':undefined} onClick={()=>setModule('elector')}>Mis votaciones</button>}</nav>
        {current==='admin'&&canAdmin?<AdminModule/>:current==='elector'&&canVote?<ElectorModule/>:<p>No tienes permiso para este módulo.</p>}
        <button className="refresh-button" onClick={()=>{setAccess(null);setModule(null);setBusy(true);setError('');setRevision(v=>v+1)}}>Volver a verificar acceso</button></>}
    </section><footer>URH · Fase funcional controlada · Identificación GUID</footer></main>
}
