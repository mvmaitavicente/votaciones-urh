import { useState, type ReactNode } from 'react'
import { useAuthorizedAccess } from '../hooks/useAuthorizedAccess'
import { AccessModules } from './AccessModules'

const messages = {
  authentication: ['No se pudo validar tu sesión Microsoft.', 'Vuelve a abrir la aplicación con tu cuenta institucional. Puede ser necesario renovar la conexión OAuth.'],
  denied: ['NO TIENES ACCESO PARA VISUALIZAR ESTA PÁGINA', 'Tu cuenta institucional no tiene permisos asignados. Comunícate con el administrador.'],
  'no-roles': ['Tu cuenta no tiene roles habilitados.', 'Comunícate con el administrador para revisar tus permisos.'],
  connection: ['No se pudo verificar tu acceso. Inténtalo nuevamente.', 'El servicio de autorización no está disponible.'],
  configuration: ['La conexión de autorización aún no está configurada.', 'El administrador debe agregar URH-VOTACIONES-API a esta Code App.'],
} as const

export function AuthorizedApp({ publicCatalog }: { publicCatalog: ReactNode }) {
  const { status, access, retry } = useAuthorizedAccess()
  const [showCatalog, setShowCatalog] = useState(false)
  return <>
    <main className="app-shell">
      <header className="page-header"><div className="brand-mark" aria-hidden="true">URH</div><div><p className="eyebrow">UNIDAD DE RECURSOS HUMANOS</p><h1>URH - Sistema de Votaciones</h1><p className="subtitle">Acceso institucional</p></div></header>
      <section className="main-card" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' ? <div className="access-loading" role="status"><span className="loading-dot" aria-hidden="true" />Verificando tus permisos de acceso...</div>
          : status === 'authorized' && access ? <><AccessModules roles={access.roles} name={access.usuario?.nombre ?? ''} /><button className="refresh-button" onClick={retry}>Volver a verificar acceso</button></>
          : status !== 'authorized' && <><h2>{messages[status][0]}</h2><p>{messages[status][1]}</p><button className="refresh-button" onClick={retry}>Reintentar</button></>}
      </section>
      <button className="refresh-button" onClick={() => setShowCatalog(value => !value)}>{showCatalog ? 'Ocultar catálogo público' : 'Consultar catálogo público de segmentos'}</button>
      <footer>URH · Sistema de Votaciones</footer>
    </main>
    {showCatalog && publicCatalog}
  </>
}
