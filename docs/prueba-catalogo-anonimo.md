# Evaluación del acceso público al catálogo — 11 de octubre de 2026

**Actualización:** la clave pública ya fue configurada y la prueba HTTP/local finalizó correctamente. Ver [resultado-prueba-insforge.md](resultado-prueba-insforge.md). Las secciones siguientes conservan la auditoría e historial previo a la prueba exitosa.

## Revisión posterior a las revocaciones manuales

Esta sección sustituye el estado de bloqueo por funciones descrito en la evaluación inicial de abajo.

Se confirmó `EXECUTE=false` para anon en las tres firmas:

- `fn_fuzzy_nombre(text,text)`
- `fn_fuzzy_nombre_v2(text,text)`
- `fn_normalizar_nombre(text)`

La auditoría actual encontró diez tablas, ninguna vista/materialized view/foreign table adicional, diez secuencias y tres funciones en el esquema. Anon tiene únicamente USAGE del esquema y SELECT de `segmento`, sin CREATE del esquema, permisos de escritura/columna o acceso a secuencias y funciones. Las otras nueve tablas no tienen privilegios efectivos de lectura ni escritura para anon. Los ACL muestran `anon=U/postgres` en el esquema y `anon=r/postgres` en la tabla: los GRANT mínimos ya estaban aplicados antes de esta revisión. No se ejecutaron nuevos GRANT, REVOKE ni cambios de RLS.

Se comprobó además que anon no tiene privilegios de tabla/columna con USAGE en los demás esquemas configurados como expuestos: public, escale, plataforma_gob_pe, powerbi y proyectos. Los permisos anteriormente detectados en payments/realtime no se modificaron; esos esquemas no figuran en la configuración PostgREST inspeccionada. Esto no constituye una auditoría de otras rutas de servicios InsForge.

El rol MCP `project_admin` sigue sin USAGE del esquema y no puede consultar los valores reales. No se le otorgó acceso adicional. La revisión de sensibilidad del contenido queda pendiente de la lectura HTTP con la clave pública, antes de activar el selector con esa configuración.

### Cliente preparado

`src/services/insforgeClient.ts` reutiliza el transporte existente y ahora admite `VITE_INSFORGE_ANON_KEY` solo con formato opaco `anon_...`, enviado como Bearer. Rechaza claves administrativas y JWT en esa variable, y muestra un error de configuración si falta clave. La comprobación de formato evita errores de configuración; la autorización real la aplica el backend. No se generó ni recuperó ninguna credencial. `.env.example` documenta la variable pública sin incluir valor. El formulario y sus estilos no se modificaron.

Para completar la configuración se necesita la clave pública oficial existente del dashboard. El GET de `/api/metadata/anon-key` sin sesión administrativa respondió 401 «No admin token provided», en 666 ms. No se usó el tool que anuncia generación de un JWT permanente ni se buscó una credencial administrativa alternativa.

La nueva prueba real GET del catálogo, con Accept-Profile pero sin clave, respondió 401 `AUTH_INVALID_CREDENTIALS` «No token provided», en 134 ms. No es una lectura SQL exitosa y no cumple todavía el criterio HTTP 200. No se conocen aún los valores o el número de registros.

Build y ESLint completados sin errores. No hay archivos de tests ni script `npm test` en el proyecto. Se repitieron las pruebas de servicio de la etapa anterior con fetch simulado, verificando perfil, clave pública, orden, paginación, null, lista vacía, formato inválido, 401/403 y fallo de red; además se comprobó rechazo de configuración ausente, claves `ik_...` y JWT. Son pruebas simuladas, no datos mock del selector.

Pendiente: obtener clave pública, comprobar valores no sensibles, probar HTTP 200 y el servicio real, configurar `.env.local`, reiniciar desarrollo con `pa app run` y comprobar opciones/resultado/actualización. El host publicado sigue requiriendo confirmar CSP para el dominio InsForge. No se ejecutó publicación.

### Reversión del estado de permisos confirmado

Los comandos de revocación al final de este documento siguen siendo aplicables a USAGE/SELECT actualmente existentes. No restituir EXECUTE a PUBLIC: las revocaciones manuales deben conservarse. Revocar SELECT y USAGE al finalizar elimina el acceso de anon a este catálogo sin modificar otras tablas; comprobar antes que no se hayan añadido otros consumidores autorizados del esquema. Si se configura `.env.local`, retirar la variable pública y recompilar/publicar manualmente. Revocar permisos es la barrera de datos; borrar una clave del bundle no elimina copias ya distribuidas.

## Resultado

Prueba detenida antes de modificar PostgreSQL o configurar credenciales públicas, conforme a la condición indicada por el usuario: no ampliar acceso más allá de `urh_votacion.segmento`. Ningún permiso fue concedido o revocado. No se creó JWT, credencial administrativa, conector, backend o función.

Se conservan los servicios, tipos, hook y diseño existentes. Solo se ajustó el mensaje HTTP 401 del cliente para reflejar que la prueba propuesta ahora es pública y no exige integración Entra.

## Auditoría realizada

- `anon` no es superusuario, no tiene BYPASSRLS ni membresías en otros roles detectadas por `pg_has_role(..., 'MEMBER')`.
- En las diez tablas de `urh_votacion`, `anon` no tiene SELECT de tabla o columna, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES o TRIGGER. Tampoco tiene USAGE del esquema.
- Sin embargo, `PUBLIC` tiene EXECUTE sobre `fn_fuzzy_nombre`, `fn_fuzzy_nombre_v2` y `fn_normalizar_nombre`. `anon` hereda esos permisos. Son SECURITY INVOKER, pero conceder USAGE abriría la posibilidad de invocarlas. No se inspeccionaron sus cuerpos ni se ejecutaron: no se puede afirmar que expongan datos sensibles, pero el alcance dejaría de ser exclusivamente la tabla autorizada.
- Se detectaron permisos efectivos SELECT y otros privilegios en tablas de `payments`, y SELECT/otros privilegios en `realtime`, con USAGE de esos esquemas y RLS desactivado en las tablas inspeccionadas. También hay privilegios sobre objetos de `cron` y `monitoring`, aunque sin USAGE. No se leyeron esas tablas, no se modificaron permisos y no se comprobó su exposición por HTTP. Un permiso PostgreSQL no demuestra por sí solo que una ruta HTTP permita acceso.
- El SELECT directo de `id_segmento,dsc_segmento,ord_segmento` falló con `permission denied for schema urh_votacion`. No se pudieron revisar los valores reales para confirmar ausencia de información sensible. Los nombres de las columnas no bastan para verificarlo.

Las verificaciones se hicieron mediante catálogos y `has_schema_privilege`, `has_table_privilege`, `has_any_column_privilege` y `aclexplode`. Estas funciones reflejan privilegios efectivos, incluidos PUBLIC; comprobar únicamente ACL explícitas de anon habría omitido el riesgo de funciones.

## Mecanismo público de InsForge

La referencia REST obtenida por MCP exige `Authorization: Bearer <jwt-o-anon-key>`; la prueba HTTP previa sin token devolvió 401 en 696 ms. Ese tiempo pertenece al rechazo de autenticación, no a una consulta exitosa.

El [repositorio oficial actual](https://github.com/InsForge/InsForge/blob/main/.env.example) distingue claves de cliente público `anon_...` y claves administrativas `ik_...`. Una clave pública opaca es distinta de un JWT permanente y requiere confirmar compatibilidad con la versión alojada. El tool MCP `get_anon_key` todavía describe generación de JWT sin expiración, por lo que no se invocó en esta etapa. No se debe utilizar ese tool ni una clave administrativa para eludir la restricción.

No se recuperó ni configuró ninguna clave pública: antes debe resolverse el alcance de los privilegios efectivos y comprobarse el contenido del catálogo. No se presume que permitir SELECT haga innecesario el encabezado de autenticación de la API.

## Requisitos para continuar

1. Un propietario/DBA debe comprobar los valores reales del catálogo y confirmar que no son sensibles.
2. Revisar con autorización específica los EXECUTE heredados de PUBLIC: un REVOKE dirigido solo a anon no elimina un permiso concedido a PUBLIC. Cambiar PUBLIC puede afectar a otros consumidores; no se hizo ese cambio ni se propone aplicarlo automáticamente.
3. Revisar los demás privilegios de anon y las rutas realmente expuestas. No revocar permisos ajenos al catálogo sin autorización. Una clave anon identifica un rol compartido, no queda restringida a una tabla por estar utilizada únicamente en este formulario.
4. Confirmar que el backend ofrece la clave pública opaca oficial, sin generar JWT permanente ni desactivar autenticación del gateway.
5. Solo entonces ejecutar los dos GRANT mínimos desde una sesión propietaria, verificar los permisos efectivos nuevamente y probar GET con Accept-Profile `urh_votacion`.

## Permisos previstos y revocación

**Comandos de referencia, no ejecutados.** No conceden permisos de escritura ni de otras tablas, pero no solucionan por sí solos los privilegios heredados descritos arriba.

```sql
-- Aplicar solamente después de resolver los bloqueos y revisar valores.
BEGIN;
GRANT USAGE ON SCHEMA urh_votacion TO anon;
GRANT SELECT ON TABLE urh_votacion.segmento TO anon;
COMMIT;
```

Una vez finalizada una eventual prueba, y dado que la auditoría actual muestra ausencia de ambos permisos:

```sql
BEGIN;
REVOKE SELECT ON TABLE urh_votacion.segmento FROM anon;
REVOKE USAGE ON SCHEMA urh_votacion FROM anon;
COMMIT;
```

Comprobar antes de revocar USAGE que no se hayan autorizado posteriormente otros consumidores anon del esquema. Estos comandos no alteran permisos de PUBLIC ni otras tablas; no revocan otras capacidades del rol anon ni invalidan una clave pública compartida. Verificar nuevamente los permisos efectivos y el rechazo HTTP tras revocarlos. Retirar además la configuración de clave pública del frontend y recompilar/publicar manualmente si se hubiese añadido.

## Validación pendiente

No hubo lectura HTTP exitosa de registros reales ni se habilitó la prueba en desarrollo local. No hay nueva latencia de consulta SQL que reportar. El funcionamiento publicado también permanece pendiente de permisos, clave pública compatible y CSP del host. No se ejecutó `pa app push`.

El documento `integracion-insforge.md` describe la etapa anterior autenticada y sus pruebas; esta evaluación registra la nueva solicitud pública y sus bloqueos, sin poner en marcha la arquitectura intermediaria.
