import { useState } from 'react'
import { canAccessModule, type AccessModule, type AccessRole } from '../types/access'

const adminPages = ['Gestión de eventos', 'Gestión de padrones', 'Gestión de candidaturas', 'Gestión de usuarios', 'Resultados'] as const
export function AccessModules({ roles, name, demo = false }: { roles: AccessRole[]; name: string; demo?: boolean }) {
  const [chosenModule, setChosenModule] = useState<AccessModule | null>(null)
  const [adminPage, setAdminPage] = useState<typeof adminPages[number] | null>(null)
  const module = chosenModule ?? (roles.includes('ADMINISTRADOR') ? 'administracion' : 'elector')
  return <>
    <h2>Bienvenido, {name}</h2>
    <p className="catalog-timing">{demo ? 'Roles de prueba' : 'Roles asignados'}: {roles.join(' · ')}</p>
    <nav className="demo-menu" aria-label="Módulos disponibles">
      {roles.includes('ADMINISTRADOR') && <button aria-current={module === 'administracion' ? 'page' : undefined} onClick={() => { setChosenModule('administracion'); setAdminPage(null) }}>Administración</button>}
      {roles.includes('ELECTOR') && <button aria-current={module === 'elector' ? 'page' : undefined} onClick={() => setChosenModule('elector')}>Votaciones</button>}
    </nav>
    {!canAccessModule(roles, module) ? <p role="alert">No tienes permiso para visualizar este módulo.</p> : module === 'administracion' ? <>
      <h2>{adminPage ?? 'Panel administrativo'}</h2>
      {adminPage ? <><p>Pantalla base de {adminPage.toLowerCase()}. No hay consultas de registros ni acciones de escritura.</p><button className="refresh-button" onClick={() => setAdminPage(null)}>Volver al panel</button></>
        : <div className="admin-options">{adminPages.map(page => <button key={page} className="refresh-button" onClick={() => setAdminPage(page)}>{page}</button>)}</div>}
    </> : <><h2>Módulo de votaciones</h2><p>Bienvenido al Sistema de Votaciones. La emisión de votos está deshabilitada.</p></>}
  </>
}
