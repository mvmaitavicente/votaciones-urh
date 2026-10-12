# Resultado de la integración real con InsForge

Fecha: 11 de octubre de 2026. Este resultado sustituye los bloqueos pendientes registrados en `integracion-insforge.md` y `prueba-catalogo-anonimo.md` para el desarrollo local.

## Resultado

El selector consulta `urh_votacion.segmento` mediante la API REST nativa de InsForge y muestra los cuatro registros reales. No usa datos mock, una API intermediaria ni OAuth adicional. El formulario, navegación y estilos se conservaron.

| id_segmento | dsc_segmento | ord_segmento |
| --- | --- | --- |
| 1 | Directivo | 1 |
| 2 | Mando medio | 2 |
| 3 | Ejecutor | 3 |
| 4 | Operador y asistencia | 4 |

Se inspeccionó la respuesta HTTP real: los valores son exclusivamente categorías laborales, sus identificadores y orden. No contienen nombres, documentos, correos, votos ni datos personales de trabajadores. El nombre escrito en el formulario permanece en estado React; no se envía a InsForge. Esta verificación corresponde al contenido actual, no garantiza futuras inserciones en el catálogo.

## Configuración

Se creó `.env.local` con `VITE_INSFORGE_URL` y la clave pública opaca oficial `VITE_INSFORGE_ANON_KEY` proporcionada por el usuario. No se copia la clave en este documento ni en `.env.example`. `.env.local` está excluido por `*.local` y `.insforge` también está ignorado. No se leyó ni utilizó una clave administrativa para el frontend, no se generaron JWT, y no se modificaron Power Apps, Vite o dependencias.

Se reutilizan `insforgeClient`, `catalogosService`, `useSegmentos` y los tipos existentes. La consulta selecciona explícitamente `id_segmento,dsc_segmento,ord_segmento`, envía `Accept-Profile: urh_votacion` y `Authorization: Bearer <clave pública>`, y ordena por `ord_segmento.asc.nullslast,id_segmento.asc`. El servicio conserva paginación; el hook conserva carga, error, vacío, timeout y actualización.

## Auditoría de permisos

Los GRANT mínimos ya existían al comenzar la prueba. **No se aplicó ningún cambio de permisos ni RLS durante esta ejecución.**

- `anon`: USAGE en `urh_votacion`, sin CREATE.
- `anon`: SELECT únicamente en `urh_votacion.segmento`, sin INSERT, UPDATE, DELETE ni privilegios adicionales de tabla/columna.
- Las otras nueve tablas: sin permisos efectivos de lectura/escritura para anon.
- Las diez secuencias: sin USAGE, SELECT o UPDATE para anon.
- Las tres funciones `fn_fuzzy_nombre(text,text)`, `fn_fuzzy_nombre_v2(text,text)` y `fn_normalizar_nombre(text)`: EXECUTE efectivo false para anon.
- No se encontraron vistas adicionales en el esquema.

Se repitió la auditoría mediante funciones `has_*_privilege`, que consideran permisos heredados. La evaluación anterior también verificó que las otras tablas de los esquemas PostgREST expuestos no tenían privilegios efectivos de anon con USAGE. No se modificaron permisos preexistentes de otros servicios/esquemas ni se afirma una auditoría completa del resto de las APIs del proyecto InsForge.

## Pruebas y tiempos medidos

| Prueba | Resultado |
| --- | --- |
| GET real con la clave pública y perfil urh_votacion | HTTP 200, cuatro registros, 985 ms |
| Servicio TypeScript real `obtenerSegmentos` | Cuatro registros transformados, orden 1–4, 1999 ms |
| Navegador Edge headless contra desarrollo local | Selector con cuatro opciones reales; GET inicial y actualización HTTP 200 |
| Preflight CORS en navegador | HTTP 204; GET permitido desde el origen local |
| Tiempo de actualización observado en el hook | 633 ms |
| Formulario en navegador | Validación de campos vacíos y tarjeta con nombre de prueba, Mando medio, Id 2 y orden 2 |
| Actualización del catálogo | Limpia selección/resultado y vuelve a cargar opciones reales |
| `npm run build` | OK, sin errores TypeScript |
| `npm run lint` | OK |
| Comprobaciones de servicio | Lectura real/orden; vacío, HTTP 401/403 y formato inválido simulados: OK |

No hay suite persistida ni script `npm test` en el proyecto; se ejecutaron las comprobaciones del servicio usadas anteriormente mediante Node/TypeScript. Los datos simulados se utilizaron solo en casos de error y nunca en la interfaz real. La primera aserción de red del navegador contó el preflight 204 como si fuera GET; se corrigió la clasificación y la comprobación de GET 200 pasó. No fue un error del backend.

Los tiempos son muestras de este equipo, incluyen transporte y, para el servicio/hook, procesamiento. No representan medición SQL pura, SLA, media estadística ni prueba de carga de 500 usuarios.

## Desarrollo y publicación

Se inició `pa app run --non-interactive` y el plugin de Power Apps arrancó correctamente. Como 5173 estaba ocupado, Vite eligió 5174; la comprobación de navegador se realizó en `http://localhost:5174/`. El plugin generó la URL de Local Play del entorno existente. El navegador verificó el frontend Vite directamente; no se inició sesión en el host Microsoft ni se verificó su CSP efectiva.

Para probar desde tu terminal:

```powershell
pa app run
```

Si ya había un servidor activo antes de crear `.env.local`, reinícialo para cargar la configuración. Usa la URL Local Play que indique el plugin y el puerto que haya elegido. No cambies la configuración de Vite para resolver un puerto ocupado.

El bundle de producción ya incluye la URL y clave pública. **No se ejecutó `pa app push`.** Queda pendiente verificar en el host publicado que su CSP permita conectar con `https://feiztkc9.us-east.insforge.app` y que CORS permita el origen real del iframe. La lectura local HTTP 200 no prueba la configuración del entorno publicado. No se desactivó ninguna protección para hacer pasar la prueba.

## Revertir el acceso público al terminar

Ejecutar desde una sesión propietaria del esquema/tabla, después de confirmar que no se añadieron otros consumidores anon autorizados:

```sql
BEGIN;
REVOKE SELECT ON TABLE urh_votacion.segmento FROM anon;
REVOKE USAGE ON SCHEMA urh_votacion FROM anon;
COMMIT;
```

Mantener las revocaciones EXECUTE FROM PUBLIC de las tres funciones. No cambiar permisos de otras tablas ni rotar una clave compartida sin revisar sus otros consumidores. Verificar después que anon no pueda consultar el catálogo; no exigir un código HTTP específico, ya que PostgREST puede devolver distintos errores según caché/esquema.

Retirar `VITE_INSFORGE_ANON_KEY` de `.env.local`, recompilar, reiniciar desarrollo y publicar manualmente cuando corresponda. La revocación PostgreSQL impide lecturas incluso desde bundles anteriores que conserven la clave pública. El borrado de una variable local no invalida copias ya distribuidas.
