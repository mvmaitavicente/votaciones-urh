import { useAccess } from '../hooks/useAccess'
import { AccessModules } from './AccessModules'

export function RbacDemo() {
  const { status, access, retry } = useAccess()
  return (
    <main className="app-shell">
      <header className="page-header"><div className="brand-mark" aria-hidden="true">URH</div><div>
        <p className="eyebrow">ACCESO LOCAL · URH</p><h1>URH - Sistema de Votaciones</h1>
        <p className="subtitle">Gestión de permisos y navegación</p>
      </div></header>
      <p className="demo-notice">La identidad enviada por el navegador no está autenticada ante InsForge. Esta vista no habilita el registro de votos ni operaciones administrativas reales.</p>
      <section className="main-card" aria-live="polite" aria-busy={status === 'loading'}>
        {access && <p className="section-label">{access.fuenteDatos === 'SIMULADA' ? 'DATOS SIMULADOS · NO SON PERMISOS REALES' : 'CONSULTA POSTGRESQL · IDENTIDAD NO VERIFICADA'}</p>}
        {status === 'loading' && <div className="access-loading" role="status"><span className="loading-dot" aria-hidden="true" />Verificando tus permisos de acceso...</div>}
        {status === 'error' && <><h2>No se pudo verificar tu acceso. Inténtalo nuevamente.</h2><button className="refresh-button" onClick={retry}>Reintentar</button></>}
        {status === 'denied' && <><h2>NO TIENES ACCESO PARA VISUALIZAR ESTA PÁGINA</h2><p>Tu cuenta institucional no tiene permisos asignados para acceder al Sistema de Votaciones. Comunícate con el administrador.</p><button className="refresh-button" onClick={retry}>Volver a verificar</button></>}
        {status === 'authorized' && access && <>
          <p className="section-label">PERMISOS DISPONIBLES</p>
          <AccessModules roles={access.roles} name={access.usuario?.nombre ?? ''} demo />
          <button className="refresh-button" onClick={retry}>Volver a verificar acceso</button>
        </>}
      </section>
      <footer>URH · RBAC_DEMO · No utilizar para una jornada electoral</footer>
    </main>
  )
}
