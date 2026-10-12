import { useEffect, useState } from 'react'
import { obtenerIdentidadUsuario } from '../services/identidadService'
import type { IdentidadUsuario } from '../types/identidad'

const campos = ['objectId', 'tenantId', 'userPrincipalName', 'fullName'] as const

export function DiagnosticoIdentidad() {
  const [revision, setRevision] = useState(0)
  const [estado, setEstado] = useState<{
    identidad: IdentidadUsuario | null; cargando: boolean; error: string | null
  }>({ identidad: null, cargando: true, error: null })

  useEffect(() => {
    let activo = true
    obtenerIdentidadUsuario().then((identidad) => {
      if (activo) setEstado({ identidad, cargando: false, error: null })
    }).catch((error: unknown) => {
      if (activo) setEstado({
        identidad: null, cargando: false,
        error: error instanceof Error ? error.message : 'No se pudo consultar la identidad.',
      })
    })
    return () => { activo = false }
  }, [revision])

  const incompleta = estado.identidad && campos.some((campo) => !estado.identidad?.[campo])

  return (
    <section className="main-card identity-diagnostic" aria-labelledby="identity-title">
      <div className="card-heading">
        <p className="section-label">DIAGNÓSTICO TEMPORAL</p>
        <h2 id="identity-title">Identidad del usuario en Power Apps</h2>
        <p>Contexto proporcionado por el host de Microsoft. Estos datos no autorizan operaciones en InsForge.</p>
      </div>
      <div aria-live="polite" aria-busy={estado.cargando}>
        {estado.cargando && <p role="status">Consultando identidad…</p>}
        {estado.error && <p className="field-error" role="alert">{estado.error}</p>}
        {estado.identidad && (
          <>
            <dl className="identity-values">
              {campos.map((campo) => (
                <div key={campo}><dt>{campo}</dt><dd>{estado.identidad?.[campo] ?? 'No disponible en este contexto'}</dd></div>
              ))}
            </dl>
            {incompleta && <p className="catalog-timing">El host no proporcionó todos los campos. Prueba mediante Local Play con tu sesión Microsoft o recarga la aplicación publicada.</p>}
          </>
        )}
      </div>
      <button className="refresh-button" type="button" disabled={estado.cargando} onClick={() => {
        setEstado({ identidad: null, cargando: true, error: null })
        setRevision((actual) => actual + 1)
      }}>Volver a consultar identidad</button>
      <p className="catalog-timing identity-note">Vista temporal. No compartas capturas con los datos de otros usuarios.</p>
    </section>
  )
}
