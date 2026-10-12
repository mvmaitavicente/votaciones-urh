import { getContext } from '@microsoft/power-apps/app'
import type { IdentidadUsuario } from '../types/identidad'

function textoDisponible(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Metadatos del host para diagnóstico. No son una prueba de autenticación del backend.
// No se almacenan en disco, no se registran en consola y no se envían a InsForge.
export async function obtenerIdentidadUsuario(): Promise<IdentidadUsuario> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const contexto = await Promise.race([
      getContext(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(
          'Power Apps no respondió a la consulta de identidad. Abre la aplicación mediante Local Play o desde Power Apps publicado y vuelve a intentar.',
        )), 10000)
      }),
    ])
    if (!contexto?.user || typeof contexto.user !== 'object') {
      throw new Error('Power Apps no devolvió el contexto del usuario.')
    }
    return {
      objectId: textoDisponible(contexto.user.objectId),
      tenantId: textoDisponible(contexto.user.tenantId),
      userPrincipalName: textoDisponible(contexto.user.userPrincipalName),
      fullName: textoDisponible(contexto.user.fullName),
    }
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('No se pudo obtener la identidad desde el host de Power Apps. Vuelve a intentar.')
  } finally {
    clearTimeout(timeout)
  }
}
