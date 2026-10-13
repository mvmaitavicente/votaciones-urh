# URH — fase funcional de pruebas

## SUPERVISOR — pendiente de aplicación manual

Rol funcional nuevo `SUPERVISOR`: solo pantalla Resultados, resumen TOTAL, participación, modales y Excel. Combinado con ELECTOR conserva Mis votaciones; no recibe acciones de configuración ni permiso de voto por ser supervisor. Catálogo limitado con `administracion` y `{vista:'resultados'}` devuelve solo eventos, segmentos, padrones e IDs/fotos de opciones. No devuelve usuarios, trabajadores, asignaciones ni catálogo de candidaturas. El backend admite supervisores exclusivamente en estas consultas y mantiene estado/activación de resultados provisionales. No amplía permisos directos de tablas ni la ruta JWT separada.

Ejecutar manualmente en DataGrip `migrations/20261013030000_rol-supervisor-resultados.sql`: INSERT condicional del rol y CREATE OR REPLACE completo de urh_operacion, con verificación de huella, transacción y NOTIFY. No aplicado por el agente. La definición remota revisada ya incluye TOTAL y detalle de personas. No requiere redeploy de Edge Functions, usa acciones existentes. Asignar después SUPERVISOR en usuario_rol a la cuenta correcta conservando ELECTOR; la migración no asigna cuentas. No solicitar credenciales ni repetir migraciones históricas.

## Vista Total por evento — 13 de octubre de 2026

Implementación local: desplegable Total, tarjetas consolidadas, barras horizontales emitidos/pendientes por segmento y debajo los gráficos verticales con título de segmento. Se conserva consulta individual, actualización manual, modales y Excel. Si existen varios eventos, Total muestra un selector de evento y nunca mezcla eventos.

SQL completo pendiente de aplicación manual por el usuario en DataGrip: `migrations/20261013020000_resultados-total-evento.sql`. Agrega ramas administrativas a la acción existente `participacion`: `{id_evento,modo:'resumen'}` devuelve totales/segmentos/conteos y resultados agregados en una consulta, sin nombres ni correos; `{id_evento,modo:'personas'}` consulta detalles solo al abrir el modal. Conserva la regla CERRADO o ABIERTO con resultados_en_vivo para mostrar conteos por opciones. No necesita redeploy de funciones, permisos nuevos, índices ni tablas; no modifica registros. Verifica huella de la función remota revisada y conserva toda la lógica anterior. No aplicar desde el agente.

Los conteos se calculan sobre asignaciones habilitadas por padrón y su participación correspondiente. Conforme a la regla indicada por el usuario, cada persona pertenece a un único segmento/padrón del evento; no se agregó una restricción transversal de asignaciones. No se mezclan tablas de personas con votos para atribuir opciones. Se usan agregaciones separadas para evitar multiplicar electores por número de opciones. Sin el nuevo SQL, Total mostrará un mensaje de migración pendiente y la consulta individual seguirá disponible.

## Modal de personas en Resultados — 13 de octubre de 2026

Las tarjetas Habilitados, Votos emitidos y Votos pendientes abren un diálogo administrativo con listas filtradas según `ya_voto`, nombre, unidad/dependencia, correo y segmento del padrón. Reutiliza DataTable con búsqueda, ordenamiento y páginas de 10/25/50 filas. La paginación es local sobre el detalle completo de participación ya consultado por el dashboard; no requiere llamadas por página. El diálogo usa la misma fecha de actualización del dashboard, sin temporizador; cerrar y pulsar Actualizar resultados renueva los datos. Admite cierre con botón, Escape o fondo, mantiene el foco dentro del modal y devuelve el foco al disparador.

SQL completo para aplicación **manual por el usuario en DataGrip**, pendiente: `migrations/20261013010000_participacion-detalle-personas.sql`. Conserva la firma y toda la implementación actual de `urh_operacion`; solo amplía el JSON de `participacion` con `id_padron_detalle`, `unidad_organica`, `correo` y `segmento`, y ordena las personas por apellidos/nombres/ID. No agrega permisos, tablas ni índices y no modifica registros. La verificación de huella protege contra cambios posteriores de la función. Conserva los resultados provisionales ya aplicados y el acceso administrativo al detalle; no expone la opción elegida por cada persona. Sin aplicar este SQL, nombre y participación siguen disponibles pero los campos nuevos no llegan al frontend. No ejecutar desde el agente ni solicitar credenciales.

## Resultados provisionales para administración — aplicado manualmente

El usuario confirmó la ejecución manual del SQL en DataGrip. Verificación remota de solo lectura: columna `resultados_en_vivo` boolean NOT NULL DEFAULT false presente; RPC contiene la condición administrativa nueva y el guardado de la opción. Se conservaron propietario `postgres`, ACL `{postgres=X/postgres,project_admin=X/postgres}`, SECURITY DEFINER, search_path y condición de cierre/publicación para el elector. Pendiente comprobar el flujo desde Local Play con evento configurado antes de abrir. No repetir la migración. Las indicaciones de preparación siguientes describen el procedimiento ya ejecutado.

La pantalla Gestión electoral → Resultados incorpora **Actualizar resultados**, sin temporizador, y hora de última consulta. La configuración de Eventos agrega `resultados_en_vivo`, desactivada por defecto y modificable solo cuando el evento existente está en BORRADOR. La consulta inicial ocurre al seleccionar un padrón; las siguientes consultas se solicitan con el botón. Los eventos ABIERTO con esta opción muestran conteos por candidato, blanco/nulo y el aviso de resultados provisionales. Los electores conservan cierre, publicación y pertenencia al padrón como requisitos.

Migración nueva: `migrations/20261012230001_resultados-provisionales-admin.sql`. **No aplicada aún en PRONIED**: `urh_operacion` y el esquema pertenecen a `postgres`; la CLI opera como `project_admin`, sin membresía ni permiso CREATE. La migración conserva la función existente y sus ACL, cambia únicamente la condición administrativa de resultados y agrega el guardado de la opción. No ejecutar migraciones históricas ni `up --all` (el historial CLI está vacío aunque las anteriores ya fueron aplicadas con propietario).

Por instrucción del usuario, ejecutar **manualmente desde DataGrip** el archivo SQL completo, conectado a PRONIED como propietario. No solicitar ni configurar credenciales PostgreSQL y no aplicar el cambio desde el agente. El archivo contiene `BEGIN`/`COMMIT`, la nueva columna y la definición íntegra `CREATE OR REPLACE FUNCTION urh_votacion.urh_operacion(p_object uuid,p_tenant uuid,p_accion text,p_datos jsonb DEFAULT '{}'::jsonb) RETURNS jsonb`. Conserva SECURITY DEFINER, search_path, propietario y ACL; no agrega permisos, índices ni otras funciones. Incluye una huella de la implementación previa para detenerse si cambió la RPC desde la revisión. Si falla, ejecutar `ROLLBACK` antes de reintentar. No repetirlo una vez aplicado.

No cambia votos ni habilita eventos existentes. No requiere redeploy de Edge Functions. Después de que el usuario confirme la aplicación, continuar las verificaciones; habilitar la opción en un evento BORRADOR antes de abrirlo y comprobar el dashboard en Local Play. No se ha publicado Power Apps.

## Fotos de candidatos - 12 de octubre de 2026

Implementados selector JPG/PNG/WebP, vista previa data:, limite 2 MB, carga y reemplazo desde candidatura guardada (Editar), foto en opciones y confirmacion electoral, y placeholder sin foto. Funcion foto-candidatura desplegada; usa SDK administrativo exclusivamente en servidor. Verifica roles/estado antes de subir y nuevamente en la RPC al guardar. Bucket publico urh-candidatos con escritura solo servidor. Migraciones 20261012200000_candidatura-foto.sql y 20261012200001_foto-storage.sql YA aplicadas mediante propietario, fuera del historial CLI: foto_key, RPC, RLS storage.objects y politica restrictiva del bucket. No repetir migraciones anteriores. URL y key persistidas; reemplazo elimina la anterior despues del commit. Fallo ambiguo al guardar puede dejar archivo huerfano, conservado para no borrar una foto cuyo commit pudo completarse.

CSP img-src: https://feiztkc9.us-east.insforge.app y conservar data: para vista previa. La funcion usa el host ya autorizado en connect-src. Prueba real HTTPS: carga, reemplazo, lectura publica y persistencia OK; subida SDK anon rechazada. Datos/imagenes de prueba eliminados. No se publico Power Apps; usuario debe compilar/publicar frontend. Primera publicacion de funcion dio 502 temporal; reintento y prueba HTTPS exitosos.


## Candidaturas vinculadas a personal - 12 de octubre de 2026

Aplicada en PRONIED la migracion 20261012180000_candidatura-persona.sql con propietario PostgreSQL, fuera del historial CLI. Reemplaza solo urh_operacion, conservando ACL. Reutiliza candidatura.id_persona para personal.id_personal; valida trabajador activo y obtiene nombre en servidor. Administracion devuelve id_persona para editar. El frontend agrega selector obligatorio de trabajador activo y nombre automatico. Candidaturas historicas sin persona se conservan; clientes anteriores que omiten el campo conservan la vinculacion existente al editar. No se publico Power Apps. Verificacion: 77 tests, build y lint; prueba real de guardado/lectura en transaccion revertida.

## Cambio de acceso - 12 de octubre de 2026

Por solicitud del usuario se retiro la lista FUNCTIONAL_GUID_ALLOWED_IDENTITIES de las tres funciones funcionales. El secreto anterior ya no se consulta. Los GUID validos se envian a PostgreSQL, que verifica coincidencia unica de usuario, estado activo y roles. Se mantienen modo test, activacion explicita, caducidad de 24 horas, CORS y controles de solicitudes. Las referencias posteriores a la lista describen el estado anterior a este cambio. El modo GUID sigue sin autenticar al llamante mediante criptografia.


## Estado y límite de seguridad

Implementación aplicada al entorno **PRONIED**, no a una elección de producción. React obtiene `objectId` y `tenantId` mediante el servicio existente basado en `getContext()`, sin pedir que el trabajador los escriba ni utilizar el conector OAuth. Los roles se consultan en PostgreSQL en cada operación.

**Estos GUID pueden falsificarse en una llamada HTTP. La lista de cuentas permitidas, CORS y los roles de PostgreSQL no convierten este flujo en autenticación. No utilizar esta fase para registrar votos de una elección real ni dar acceso a personas no confiables.** El aviso también aparece en la interfaz.

Se limita a la cuenta de prueba autorizada, `ACCESS_ENVIRONMENT=test`, activación explícita y caducidad máxima de 24 horas. Después de caducar devuelve HTTP 503 `FASE_FUNCIONAL_DESHABILITADA`. Antes de una elección real se necesita conectar una identidad verificable por el servidor; la implementación JWT anterior permanece separada y conserva sus validaciones.

## Modelo real y cambios aplicados

Se reutilizan `usuario`, `rol`, `usuario_rol`, `personal`, `evento`, `segmento`, `padron`, `padron_detalle`, `candidatura`, `opcion_electoral`, `participacion_electoral` y `voto`, dentro de `urh_votacion`. No se crearon tablas duplicadas.

La migración `migrations/20261012080000_urh-functional.sql` agrega:

- Fechas, estado y publicación de resultados en `evento`, con restricciones de fechas y estados.
- `UNIQUE (id_padron,id_persona)` en `padron_detalle`.
- `UNIQUE (id_padron,id_padron_detalle)` en `participacion_electoral`.
- RPC `urh_operacion(uuid,uuid,text,jsonb)`, con validaciones de usuario activo, roles, trabajador, habilitación, evento, fechas y opción/candidatura.
- `voto.id_participacion` acepta NULL. Los votos nuevos no guardan ese vínculo; se conserva cualquier vínculo histórico existente. La fecha de votos nuevos se reduce al día. Participación conserva su registro independiente.

La separación evita el vínculo directo en los votos nuevos, pero **no garantiza anonimato criptográfico**: un administrador de la base puede inferir información por secuencias, registros técnicos o pocos participantes.

La RPC ejecuta el registro de participación y voto en una sola transacción. Un error revierte ambos; una colisión de la UNIQUE específica devuelve `YA_VOTO`. No se depende de un SELECT previo ni del botón de React para impedir duplicados. La configuración de padrones y opciones queda bloqueada fuera de BORRADOR; no se reabre un evento cerrado ni se cambian fechas después de participación. No se permite cambiar el trabajador de una cuenta que ya participó.

## Backend y permisos

Funciones disponibles en `https://feiztkc9.function2.insforge.app`:

| Ruta | Uso |
|---|---|
| `/verificar-acceso` | Identificación GUID y roles reales, fase temporal |
| `/operacion` | Administración, padrones del elector y consultas |
| `/emitir-voto` | Acción fija de emisión; rechaza cambiarla por otra acción |
| `/verificar-acceso-entra` | Implementación JWT separada; sin token devuelve 401 |

Las funciones funcionales usan `fetch` hacia la API nativa InsForge `/api/database/rpc/urh_operacion`, con `Content-Profile` y `Accept-Profile: urh_votacion`. La clave administrativa proviene exclusivamente del secreto del servidor `RBAC_SERVER_API_KEY` o `API_KEY`; nunca se envía al frontend. La RPC es SECURITY DEFINER con `search_path` fijo y SQL estático: no acepta nombres de tablas ni SQL del cliente.

Permisos nuevos: se revocó EXECUTE de PUBLIC sobre **la RPC nueva**, y se concedió EXECUTE exclusivamente a `project_admin`. No se agregaron permisos anónimos de escritura, permisos sobre otras tablas ni cambios RLS. Auditoría real: `anon` no puede ejecutar funciones de este esquema ni acceder a las demás tablas; conserva únicamente el catálogo público previamente autorizado. `project_admin` puede ejecutar la RPC; `anon` no puede hacerlo. El rol servidor no recibió GRANT de escritura directo a todas las tablas.

CORS usa la lista exacta existente `ACCESS_ALLOWED_ORIGINS`; no utiliza `*`. Admite llamadas sin Origin, pero eso no prueba identidad. Origen explícito ajeno: 403 sin reflejarlo. Los nombres de trabajadores y los reportes solo se entregan mediante la operación administrativa; el frontend no contiene credenciales privilegiadas. Se mantienen las funciones ajenas a URH.

## Interfaz y configuración

Archivos principales:

- `src/components/FunctionalApp.tsx`: acceso, navegación por roles y aviso de pruebas.
- `src/components/AdminModule.tsx`: eventos, segmentos, padrones, asignación de trabajadores, vinculación de cuentas existentes, candidaturas, opciones, participación y resultados.
- `src/components/ElectorModule.tsx`: padrones habilitados, opciones, confirmación, emisión, control de participación y resultados publicados.
- `src/services/votacionesService.ts`, `src/types/votaciones.ts`: consumo HTTPS y tipos, reutilizando `identidadService.ts`.
- `functions/functional/*`, migración, scripts de build/verificación y pruebas nuevas.
- `src/App.tsx`, `src/App.css`, `.env.example`, `.env.local`, `package.json`, `package-lock.json`: selección de fase, presentación, configuración y dependencias de pruebas/migración. Se conserva la implementación previa en su modo alternativo.

Configuración pública activa en `.env.local`:

```dotenv
VITE_ACCESS_MODE=functional
VITE_FUNCTIONS_BASE_URL=https://feiztkc9.function2.insforge.app
```

Se conservan URL y clave anónima del catálogo. `.env.local` continúa ignorado; no usar ninguna variable VITE para secretos del servidor. Vite incorpora esas variables al compilar: la app publicada usa HTTPS del host real, no un servidor RBAC local. No se modificó `power.config.json` ni la configuración Vite.

Secretos/configuración exclusivos del servidor: `INSFORGE_BASE_URL`, `API_KEY` existente, `ACCESS_ALLOWED_ORIGINS`, `ACCESS_ENVIRONMENT=test`, `FUNCTIONAL_GUID_ENABLED=true`, `FUNCTIONAL_GUID_ALLOWED_IDENTITIES` (pares `tenantId:objectId`, máximo 500) y `FUNCTIONAL_GUID_EXPIRES_AT` (UTC ISO). La activación aplicada dura 24 horas desde su configuración; no se renueva automáticamente.

La cuenta actual tiene ADMINISTRADOR y ELECTOR, pero `usuario.id_persona` está vacío. No se vinculó automáticamente con un trabajador real.

## Cómo probar ahora

1. Ejecutar `npm run dev` y `pa app run` conforme al flujo actual, y abrir **Local Play** de Power Apps. Abrir solo localhost no proporciona necesariamente contexto Microsoft.
2. Comprobar que aparecen Administración y Mis votaciones. En Administración → Trabajadores, vincular la cuenta de prueba con el trabajador correcto. Usar datos de ensayo, sin votar en un proceso real.
3. Crear evento BORRADOR, segmento y padrón. Asignar ese trabajador al padrón y marcar Habilitado. Crear candidatura ACTIVA y opción del mismo evento/segmento/padrón; también se admiten opciones BLANCO/NULO.
4. Establecer inicio y fin válidos y abrir el evento. Todas las fechas se envían en UTC; el formulario muestra hora local. Configurar las asignaciones y opciones antes de abrir.
5. En Mis votaciones, abrir el padrón, seleccionar opción, revisar confirmación y enviar. Esperar `VOTO_REGISTRADO`. Un segundo envío debe devolver `YA_VOTO` sin insertar otro voto.
6. Consultar participación en Administración. Cerrar evento para consultar resultados. Marcar Resultados publicados permite al elector habilitado ver resultados agregados del evento cerrado.

Si aparece `TRABAJADOR_NO_VINCULADO`, falta el paso 2; si aparece `FASE_FUNCIONAL_DESHABILITADA`, revisar caducidad/activación de pruebas. Un elector nunca puede ejecutar operaciones administrativas por llamar directamente a `/operacion`: la RPC comprueba los roles.

## Compilar, desplegar y publicar

```powershell
npm run check:rbac
npm run lint
npm test
npm run build
npm run build:functional
```

Las tres funciones funcionales están desplegadas en PRONIED. Para futuras actualizaciones, después de revisar el artefacto:

```powershell
npx -y @insforge/cli functions deploy verificar-acceso --file artifacts/functional/verificar-acceso.js
npx -y @insforge/cli functions deploy operacion --file artifacts/functional/operacion.js
npx -y @insforge/cli functions deploy emitir-voto --file artifacts/functional/emitir-voto.js
```

Para preparar la implementación JWT separada: `npm run build:function`, y desplegar su artefacto exclusivamente con nombre `verificar-acceso-entra`. No sustituir accidentalmente el flujo funcional ni afirmar que basta cambiar de nombre para autenticar todas las operaciones electorales: esa conexión futura aún requiere implementar identidad JWT en dichas operaciones.

**No se ejecutó `pa app push`.** Cuando el usuario decida publicar la versión de pruebas, ejecutar manualmente `npm run build` y `pa app push`. Después abrir Power Apps Web y repetir los pasos anteriores. Si falla CORS, inspeccionar el Origin real y autorizar únicamente el origen Microsoft concreto verificado; no agregar comodín.

## Resultados ejecutados — 12 de octubre de 2026

- Build, ESLint y verificación TypeScript: correctos.
- 75 pruebas automatizadas: correctas, incluyendo regresión JWT, roles, CORS, errores, elector no habilitado, candidatura inválida, evento cerrado, primer/segundo voto, atomicidad y resultados publicados.
- PostgreSQL real PRONIED: cuentas/eventos/opciones ficticios temporales; roles ADMINISTRADOR/ELECTOR/ambos, inactivo/sin roles, dos conexiones PostgreSQL diferentes simultáneas → **un voto y una participación**; error provocado durante almacenamiento → participación revertida; resultados después del cierre. Los registros ficticios se eliminaron por sus IDs. No se eliminaron votos existentes. Las secuencias pueden conservar saltos por pruebas/reversiones.
- HTTPS real: acceso 200 (888 ms), lectura administrativa 200 (527 ms), Origin ajeno 403, roles inyectados 400, identidad no autorizada 403, acción incorrecta en emitir-voto 400, preflight 204, ruta JWT sin token 401. Son mediciones puntuales, no una prueba de carga para 500 usuarios.
- Emisión HTTPS con la cuenta actual: 400 `TRABAJADOR_NO_VINCULADO`, esperado; no registró votos. **Una emisión exitosa desde la interfaz de Power Apps no se ha probado todavía.**
- Auditoría de bundle: sin clave administrativa; conexión real HTTPS incorporada.
- Durante los primeros despliegues hubo respuestas CLI `Function deployment failed`; el despliegue posterior del runtime compartido finalizó correctamente y las cuatro rutas se comprobaron por HTTPS. La fecha de metadatos individual del primer intento no fue tomada como prueba de ejecución.
- `getContext()` había sido confirmado por el usuario en Local Play para sus cuatro campos antes de esta fase. La interfaz electoral nueva y Power Apps Web publicado **requieren comprobación manual**, porque no se publicó automáticamente ni se dispone de la sesión del usuario para probarla.

Pruebas repetibles: `scripts/test-electoral-postgres.mjs`, `scripts/verify-functional-http.mjs`, `scripts/audit-functional-security.mjs`. Las de PostgreSQL requieren una conexión propietaria TLS suministrada solo al proceso del servidor. No copiar esa conexión al frontend. El script HTTP utiliza variables `URH_TEST_OBJECT_ID` y `URH_TEST_TENANT_ID`, y no imprime datos personales ni modifica registros electorales.

## Desactivar y revertir permisos de la fase

Desactivar primero:

```powershell
npx -y @insforge/cli secrets update FUNCTIONAL_GUID_ENABLED --value false
```

Revisar ayuda de la versión CLI si cambia la sintaxis. Redeplegar las tres funciones funcionales para garantizar que su configuración en memoria se actualice, y verificar que respondan 503. La caducidad también cierra automáticamente este flujo.

Para revocar el permiso **nuevo** sin borrar datos, ejecutar con el propietario:

```sql
REVOKE EXECUTE ON FUNCTION urh_votacion.urh_operacion(uuid,uuid,text,jsonb) FROM project_admin;
NOTIFY pgrst, 'reload schema';
```

No deshacer automáticamente columnas/UNIQUE ni restaurar NOT NULL en `voto.id_participacion`: podría invalidar votos de prueba ya registrados y restaurar un vínculo que se decidió evitar. La retirada del esquema requiere revisión de datos y respaldo. Los permisos públicos del catálogo anterior no fueron ampliados en esta fase.
