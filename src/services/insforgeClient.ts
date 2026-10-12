// API REST nativa: ninguna credencial administrativa pertenece a este módulo.
const baseUrl = import.meta.env.VITE_INSFORGE_URL || 'https://feiztkc9.us-east.insforge.app'
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim()

export class InsforgeError extends Error {
  readonly status: number
  readonly codigo: string

  constructor(message: string, status = 0, codigo = 'CONNECTION_ERROR') {
    super(message)
    this.name = 'InsforgeError'
    this.status = status
    this.codigo = codigo
  }
}

// Punto de integración para una sesión real de InsForge, nunca un token de Entra.
// No hay sesión InsForge implementada en el proyecto actual.
let obtenerToken: (() => Promise<string | null>) | undefined
export function configurarTokenInsforge(provider: () => Promise<string | null>) {
  obtenerToken = provider
}

export async function consultarCatalogo(
  tabla: string,
  parametros: URLSearchParams,
  signal: AbortSignal,
): Promise<unknown> {
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new InsforgeError('La URL de InsForge debe usar HTTPS y no contener credenciales.', 0, 'CONFIGURATION_ERROR')
  }
  url.pathname = `/api/database/records/${encodeURIComponent(tabla)}`
  url.search = parametros.toString()
  // La clave opaca oficial identifica al rol anon; no es un JWT ni una API key administrativa.
  if (anonKey && !/^anon_[A-Za-z0-9_-]+$/.test(anonKey)) {
    throw new InsforgeError('Configura únicamente una clave pública de InsForge con prefijo anon_. No utilices claves administrativas ni JWT.', 0, 'CONFIGURATION_ERROR')
  }
  const token = (await obtenerToken?.()) || anonKey
  if (!token) {
    throw new InsforgeError('Falta la clave pública de InsForge para consultar el catálogo.', 0, 'CONFIGURATION_ERROR')
  }
  const headers: Record<string, string> = { 'Accept-Profile': 'urh_votacion' }
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(url, { headers, signal, cache: 'no-store', credentials: 'omit' })
  } catch (error) {
    if (signal.aborted) throw error
    throw new InsforgeError('No se pudo conectar con InsForge. Revisa la conexión, CORS y la política de contenido de Power Apps.')
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const codigo = body && typeof body === 'object'
      ? String(('code' in body ? body.code : undefined) || ('error' in body ? body.error : undefined) || `HTTP_${response.status}`)
      : `HTTP_${response.status}`
    const message = response.status === 401
      ? 'InsForge rechazó la credencial de acceso. Revisa que la clave pública corresponda a este proyecto.'
      : response.status === 403 || codigo === '42501'
        ? 'No tienes permisos para consultar los segmentos. Solicita al administrador acceso de lectura al catálogo.'
        : codigo === 'PGRST106'
          ? 'El esquema del catálogo no está expuesto en la API de InsForge.'
          : 'No se pudo consultar el catálogo de segmentos. Intenta actualizar los datos.'
    throw new InsforgeError(message, response.status, codigo)
  }
  return response.json()
}
