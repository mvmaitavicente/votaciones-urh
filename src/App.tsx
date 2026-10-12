import { useState, type FormEvent } from 'react'
import './App.css'
import type { Segmento } from './types/catalogos'
import { useSegmentos } from './hooks/useSegmentos'
import { DiagnosticoIdentidad } from './components/DiagnosticoIdentidad'
import { RbacDemo } from './components/RbacDemo'
import { rbacDemoEnabled } from './services/accessService'
import { AuthorizedApp } from './components/AuthorizedApp'
import {FunctionalApp} from './components/FunctionalApp'
import {functionalMode} from './services/votacionesService'

function App() {
  return functionalMode ? <FunctionalApp/> : rbacDemoEnabled ? <RbacDemo /> : <AuthorizedApp publicCatalog={<CatalogoApp />} />
}

function CatalogoApp() {
  const { segmentos, cargando, error, latenciaMs, actualizar } = useSegmentos()
  const [segmentoId, setSegmentoId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [errores, setErrores] = useState({ segmento: '', nombre: '' })
  const [resultado, setResultado] = useState<{ nombre: string; segmento: Segmento } | null>(null)

  function mostrarInformacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (cargando || error) return
    const segmento = segmentos.find((item) => item.id === segmentoId)
    const nombreLimpio = nombre.trim()
    setErrores({
      segmento: segmento ? '' : 'Selecciona un segmento para continuar.',
      nombre: nombreLimpio ? '' : 'Ingresa el nombre del trabajador.',
    })
    setResultado(segmento && nombreLimpio ? { nombre: nombreLimpio, segmento } : null)
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark" aria-hidden="true">URH</div>
        <div>
          <p className="eyebrow">UNIDAD DE RECURSOS HUMANOS</p>
          <h1>URH - Sistema de Votaciones</h1>
          <p className="subtitle">Prueba de selección de segmentos</p>
        </div>
      </header>
      <section className="main-card" aria-labelledby="form-title">
        <div className="card-heading">
          <p className="section-label">DATOS DEL TRABAJADOR</p>
          <h2 id="form-title">Selecciona tu segmento</h2>
          <p>Completa los datos para consultar la información de tu selección.</p>
        </div>
        <form onSubmit={mostrarInformacion} noValidate>
          <div className="field">
            <label htmlFor="segmento">Segmento <span className="required">(obligatorio)</span></label>
            <select id="segmento" value={segmentoId ?? ''} required
              disabled={cargando || Boolean(error) || segmentos.length === 0}
              aria-invalid={Boolean(errores.segmento)}
              aria-describedby={errores.segmento ? 'segmento-error' : undefined}
              onChange={(event) => {
                setSegmentoId(event.target.value ? Number(event.target.value) : null)
                setErrores((actual) => ({ ...actual, segmento: '' }))
                setResultado(null)
              }}>
              <option value="">{cargando ? 'Cargando segmentos…' : 'Selecciona un segmento'}</option>
              {segmentos.map((segmento) => <option key={segmento.id} value={segmento.id}>{segmento.nombre}</option>)}
            </select>
            <div className="catalog-status" aria-live="polite" aria-busy={cargando}>
              {cargando && <p role="status">Cargando segmentos…</p>}
              {error && <p className="field-error" role="alert">{error}</p>}
              {!cargando && !error && segmentos.length === 0 && <p>No hay segmentos disponibles.</p>}
              {!cargando && !error && latenciaMs !== null && <p className="catalog-timing">Consulta completada en {latenciaMs} ms.</p>}
            </div>
            <button className="refresh-button" type="button" disabled={cargando} onClick={() => {
              setSegmentoId(null)
              setResultado(null)
              setErrores((actual) => ({ ...actual, segmento: '' }))
              actualizar()
            }}>Actualizar segmentos</button>
            {errores.segmento && <p id="segmento-error" className="field-error" role="alert">{errores.segmento}</p>}
          </div>
          <div className="field">
            <label htmlFor="nombre">Nombre del trabajador <span className="required">(obligatorio)</span></label>
            <input id="nombre" type="text" autoComplete="name" placeholder="Escribe tu nombre" value={nombre} required
              aria-invalid={Boolean(errores.nombre)}
              aria-describedby={errores.nombre ? 'nombre-error' : undefined}
              onChange={(event) => {
                setNombre(event.target.value)
                setErrores((actual) => ({ ...actual, nombre: '' }))
                setResultado(null)
              }} />
            {errores.nombre && <p id="nombre-error" className="field-error" role="alert">{errores.nombre}</p>}
          </div>
          <button type="submit" disabled={cargando || Boolean(error) || segmentos.length === 0}>Mostrar información <span aria-hidden="true">→</span></button>
        </form>
        <div aria-live="polite" aria-atomic="true">
          {resultado && (
            <section className="result-card" aria-labelledby="result-title">
              <p className="section-label">INFORMACIÓN SELECCIONADA</p>
              <h2 id="result-title">Datos del trabajador</h2>
              <dl>
                <div className="result-wide"><dt>Nombre del trabajador</dt><dd>{resultado.nombre}</dd></div>
                <div className="result-wide"><dt>Segmento seleccionado</dt><dd>{resultado.segmento.nombre}</dd></div>
                <div><dt>Id del segmento</dt><dd>{resultado.segmento.id}</dd></div>
                <div><dt>Orden del segmento</dt><dd>{resultado.segmento.orden ?? 'Sin orden'}</dd></div>
              </dl>
            </section>
          )}
        </div>
      </section>
      <DiagnosticoIdentidad />
      <footer>URH · Sistema de Votaciones</footer>
    </main>
  )
}
export default App
