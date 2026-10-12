# URH — fase funcional de pruebas

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
