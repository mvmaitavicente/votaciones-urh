# Fase 1 — RBAC_DEMO

## Alcance y estado

Implementación funcional de acceso y navegación, únicamente para pruebas. **No autentica al trabajador ante InsForge.** objectId y tenantId pueden ser falsificados por el cliente. No hay registro de votos, consultas de padrones, datos de candidaturas, resultados reales ni operaciones administrativas de escritura.

La función `verificar-acceso` está preparada como fuente TypeScript autocontenida en `functions/demo/verificar-acceso.ts`. **No está desplegada.** El cliente de esta fase admite únicamente el endpoint de loopback, y `import.meta.env.DEV` impide habilitarla en un build de producción, incluso con `VITE_RBAC_DEMO_ENABLED=true`. La aplicación publicada conserva el catálogo y diagnóstico anteriores; no contiene los módulos RBAC_DEMO.

No se aplicaron cambios de PostgreSQL, RLS, PK/FK, secretos del proyecto o autenticación. No se crearon tablas, cuentas o roles en PostgreSQL. No se ejecutaron `pa app push` ni despliegues de funciones. El archivo `.env.local` existente y la clave pública del catálogo no se modificaron.

## Inspección real

Se utilizó InsForge CLI para leer únicamente metadatos. El tool MCP no podía ejecutar con la política de aprobación disponible; la lectura por CLI sí se completó.

| Tabla | Columnas reales |
| --- | --- |
| usuario | id_usuario integer PK; id_persona integer nullable; id_object varchar(100) nullable; id_tenant varchar(100) nullable; user_principal_name varchar(255) nullable; nombre varchar(255) nullable; activo boolean NOT NULL |
| rol | id_rol integer PK; codigo varchar(30) NOT NULL UNIQUE; descripcion varchar(200) nullable |
| usuario_rol | id_usuario_rol integer PK; id_usuario integer nullable; id_rol integer nullable |

La columna `correo` mencionada en la solicitud no existe en el esquema inspeccionado: existe `user_principal_name`. No se consulta ninguna de ellas para resolver roles.

No se detectaron claves foráneas declaradas en estas tres tablas. La consulta utiliza las relaciones lógicas `usuario_rol.id_usuario → usuario.id_usuario` y `usuario_rol.id_rol → rol.id_rol`, sin añadir FK ni asumir relaciones PostgREST automáticas. No hay restricción única declarada para `(id_object,id_tenant)`; más de una coincidencia produce error técnico y denegación, nunca selección arbitraria del primer usuario.

Se verificó que anon tiene USAGE del esquema pero **no SELECT** en las tres tablas. authenticated y project_admin tampoco tienen USAGE/SELECT. RLS está desactivado en las tres tablas; no se cambió. La API key administrativa opera con project_admin y no soluciona esos permisos por sí sola.

**Bloqueo real:** la lectura de roles desde PostgreSQL requiere autorización adicional de servidor. No se intentó exponer las tablas a anon ni obtener una credencial diferente para eludir el bloqueo. Las pruebas funcionales terminadas usan fixtures explícitos; no son registros reales de usuarios/roles.

## Archivos

Nuevos:

- `functions/demo/verificar-acceso.ts`: consulta reutilizable de roles, repositorio REST de servidor, validación y handler de la función.
- `src/types/access.ts`, `src/services/accessService.ts`, `src/hooks/useAccess.ts`: contrato, consumo local y estado React.
- `src/components/RbacDemo.tsx`: pantallas y navegación institucional.
- `scripts/rbac-demo-server.mjs`: adaptación HTTP local de la misma función; bind exclusivo 127.0.0.1.
- `scripts/rbac-demo-fixtures.mjs`: siete cuentas ficticias, sin conexión a la base.
- `tests/rbac-demo.test.mjs`, `tests/access-service.test.mjs`: pruebas automatizadas.
- `tests/rbac-browser-check.mjs`: verificación opcional de navegador con host simulado de Power Apps, solo mediante DevTools.
- `.env.rbac.example`, `tsconfig.rbac.json` y este documento.

Modificados: `src/App.tsx`, `src/App.css`, `.env.example`, `package.json`. No se instalaron librerías. Se reutilizan getContext/identidadService y las dependencias existentes. Node 24 (utilizado en las pruebas) permite ejecutar las fuentes TS del servidor local sin build adicional.

## Ejecución local con datos ficticios

1. Copiar `.env.rbac.example` a `.env.rbac.local`. Este archivo es exclusivamente del servidor y está ignorado por la regla `*.local`.
2. Configurar:

```dotenv
RBAC_DEMO_ENABLED=true
RBAC_DEMO_ENVIRONMENT=controlled-test
RBAC_DEMO_DATA_SOURCE=fixtures
RBAC_DEMO_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

3. En otra terminal iniciar:

```powershell
npm run dev:rbac
```

No habilita ninguna función pública: escucha solo en `127.0.0.1:8787`. No lee `.insforge/project.json`, no imprime secretos ni necesita una clave administrativa en modo fixtures.

4. Para probar con tu identidad obtenida mediante getContext en Local Play, configura **únicamente en `.env.rbac.local`** la lista de tus cuentas de prueba (máximo 20), con UUID copiados del diagnóstico, y selecciona un escenario ficticio:

```dotenv
RBAC_DEMO_ALLOWED_IDENTITIES='[{"id_object":"UUID-DE-TU-CUENTA-DE-PRUEBA","id_tenant":"UUID-DE-TU-TENANT"}]'
RBAC_DEMO_FIXTURE_SCENARIO=AMBOS
```

Esos textos son marcadores: reemplazarlos por UUID válidos. Escenarios: NO_REGISTRADO, INACTIVO, SIN_ROLES, ADMINISTRADOR, ELECTOR, AMBOS y ERROR. Reiniciar el servidor al cambiar escenario/lista. **Los roles de fixtures no son los roles reales del trabajador.** La interfaz indica «DATOS SIMULADOS · NO SON PERMISOS REALES».

Si no hay lista ni escenario explícito, fixtures acepta exclusivamente las siete identidades sintéticas de `scripts/rbac-demo-fixtures.mjs`; una cuenta Microsoft real no coincide y obtiene SIN_ACCESO. No se sustituye la identidad real del frontend por una ficticia ni se añade selector para suplantar usuarios.

5. En `.env.local` del frontend agregar solamente configuración pública:

```dotenv
VITE_RBAC_DEMO_ENABLED=true
VITE_RBAC_DEMO_URL=http://127.0.0.1:8787/functions/verificar-acceso
```

6. Reiniciar `pa app run` y abrir la URL Local Play que imprime el plugin, con la sesión Microsoft existente. El Origin del POST será el del iframe Vite (por ejemplo localhost:5174), no necesariamente apps.powerapps.com. Si Vite utiliza otro puerto, añadir ese origen exacto al servidor y reiniciarlo. No usar `*` ni ampliar CORS globalmente.

Si el host o navegador bloquea loopback mediante CSP, mixed-content o permisos de red local, no desactivar protecciones: las pruebas simuladas directas permiten validar la lógica, mientras la prueba real del host queda pendiente. Los valores de getContext no se envían a InsForge salvo que se configure posteriormente el modo real autorizado de esta función. En fixtures solo llegan al servidor loopback; se mandan únicamente id_object e id_tenant, nunca UPN o fullName.

Para terminar la demo, poner `VITE_RBAC_DEMO_ENABLED=false`, detener ambos servidores y reiniciar el desarrollo normal. Builds de producción siempre excluyen la demo y nunca dependen del servidor local. **No publicar esta fase como módulo electoral.**

## Lectura real desde el servidor: pendiente de permisos

InsForge soporta funciones Deno con fetch y secretos protegidos ([documentación oficial](https://docs.insforge.dev/core-concepts/functions/overview)). La implementación usa su API REST de base de datos desde servidor: Bearer de API key administrativa y Accept-Profile `urh_votacion`. El SDK documenta el equivalente `createAdminClient` solo para servidor ([referencia oficial](https://github.com/InsForge/InsForge-sdk-js#server-admin-client)). No se añadió un SDK al frontend ni una nueva dependencia.

La función solo emite GET con columnas explícitas:

- usuario: id_usuario, nombre, activo, filtrando por ambos identificadores UUID y limitando a dos resultados para detectar duplicidad.
- usuario_rol: id_usuario_rol, id_rol, filtrando por id_usuario; paginación ordenada y acotada.
- rol: codigo, filtrando únicamente los id_rol asociados. Roles admitidos: ADMINISTRADOR y ELECTOR. Códigos desconocidos no conceden módulos.

No usa correo como identidad. No devuelve correo, documento, padrón, id_persona ni otros usuarios. La lista de cuentas de prueba limita la consulta a parejas expresamente habilitadas; usar registros sintéticos/controlados, no abrir esta demo a electores reales. Se devuelve solo id_usuario y nombre de la cuenta de prueba coincidente cuando resulta autorizada.

### SQL mínimo a revisar por el propietario/DBA

**No ejecutado.** Actualmente falta este acceso de servidor; estos GRANT no deben dirigirse a anon o authenticated:

```sql
BEGIN;
GRANT USAGE ON SCHEMA urh_votacion TO project_admin;
GRANT SELECT (id_usuario, id_object, id_tenant, nombre, activo)
  ON TABLE urh_votacion.usuario TO project_admin;
GRANT SELECT (id_usuario_rol, id_usuario, id_rol)
  ON TABLE urh_votacion.usuario_rol TO project_admin;
GRANT SELECT (id_rol, codigo)
  ON TABLE urh_votacion.rol TO project_admin;
COMMIT;
```

Son permisos de columnas de lectura, sin INSERT/UPDATE/DELETE, cambios de PK/FK o RLS. La API key sigue siendo una credencial administrativa del proyecto: guardar solo en servidor/secret store; el código de esta función limita sus operaciones pero no convierte esa clave en una credencial de menor privilegio. Revisar impacto: project_admin es un rol compartido con otras herramientas del proyecto.

Para deshacer solo los nuevos permisos (si el DBA los aplica desde el estado auditado):

```sql
BEGIN;
REVOKE SELECT (id_usuario, id_object, id_tenant, nombre, activo)
  ON TABLE urh_votacion.usuario FROM project_admin;
REVOKE SELECT (id_usuario_rol, id_usuario, id_rol)
  ON TABLE urh_votacion.usuario_rol FROM project_admin;
REVOKE SELECT (id_rol, codigo)
  ON TABLE urh_votacion.rol FROM project_admin;
-- Solo si USAGE no adquirió otros consumidores autorizados entretanto:
REVOKE USAGE ON SCHEMA urh_votacion FROM project_admin;
COMMIT;
```

Revisar permisos efectivos antes/después para no revocar otros cambios legítimos. No revocar SELECT de tablas enteras o permisos de otros roles indiscriminadamente.

Después de autorización y aplicación por el DBA, configurar exclusivamente en el archivo local del servidor:

```dotenv
RBAC_DEMO_DATA_SOURCE=insforge
INSFORGE_BASE_URL=https://feiztkc9.us-east.insforge.app
RBAC_SERVER_API_KEY=CLAVE-ADMINISTRATIVA-SOLO-SERVIDOR
RBAC_DEMO_ALLOWED_IDENTITIES='[{"id_object":"UUID-DE-PRUEBA","id_tenant":"UUID-DE-TENANT"}]'
```

No copiar esta clave a variables VITE, archivos de src, ejemplos versionados o capturas. Mantener la función sin desplegar, el servidor ligado a loopback y la lista corta de pruebas. La falta de permisos de PostgreSQL aparece como error técnico (503), nunca como NO_REGISTRADO o SIN_ACCESO. Esta lectura real aún no fue probada y sus códigos de rol/filas no fueron leídos para la inspección.

## Contrato y límites de la función

POST `/functions/verificar-acceso` con `Content-Type: application/json`, Origin exacto permitido y únicamente dos campos UUID. `/verificar-acceso` también es una ruta aceptada para la forma de endpoint de runtime InsForge; otras rutas no procesan consultas.

Petición ficticia para el escenario administrador predeterminado:

```json
{
  "id_object": "00000000-0000-4000-8000-000000000004",
  "id_tenant": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```

Respuesta:

```json
{
  "modo": "RBAC_DEMO",
  "fuenteDatos": "SIMULADA",
  "autorizado": true,
  "estado": "AUTORIZADO",
  "usuario": { "id_usuario": 4, "nombre": "Cuenta ficticia 4" },
  "roles": ["ADMINISTRADOR"]
}
```

NO_REGISTRADO, INACTIVO y SIN_ROLES son estados internos comprobables en pruebas, pero para el cliente todos devuelven HTTP 200:

```json
{
  "modo": "RBAC_DEMO",
  "fuenteDatos": "SIMULADA",
  "autorizado": false,
  "estado": "SIN_ACCESO",
  "usuario": null,
  "roles": []
}
```

Errores técnicos usan estado ERROR, usuario null y roles vacíos, con HTTP no exitoso. Métodos de escritura no permitidos: 405; campos extra/identificadores inválidos: 400; Origin no permitido: 403; exceso de solicitudes: 429; dependencia/configuración no disponible: 503. Cuerpo máximo 1 KiB. No existe endpoint para ejecutar SQL o elegir una operación de escritura.

Límite de 60 POST/minuto por instancia y 10/minuto por identidad de prueba. Lista de máximo 20 identidades para mantener memoria acotada. El contador reside en memoria; no es un límite distribuido y se reinicia con el proceso. Es adecuado solo para este servidor de pruebas, no para producción. Una futura función pública requiere límites de gateway/distribuidos, autenticación verificable y políticas de autorización reales.

CORS no autentica: un cliente no-browser puede falsificar Origin, igual que UUID. La mitigación principal de esta fase es NO desplegarla públicamente, bind de loopback, opt-in, lista corta y ausencia total de operaciones electorales. No se enviaron tokens permanentes ni se añadieron secretos al cliente.

Ejemplo HTTP local (solo valores ficticios):

```powershell
$rbacBody = @{ id_object='00000000-0000-4000-8000-000000000004'; id_tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/functions/verificar-acceso' -ContentType 'application/json' -Headers @{ Origin='http://localhost:5174' } -Body $rbacBody
```

## Verificación realizada

```powershell
npm run check:rbac
npm run build
npm run lint
npm test
```

TypeScript de función/frontend, build y ESLint pasaron. Diecisiete pruebas automatizadas cubren los diez escenarios solicitados y controles adicionales: allowlist, CORS, límites, duplicados, código de rol desconocido, forma de respuesta, claves solo en servidor y cliente deshabilitado en producción.

HTTP real contra el adaptador loopback, **repositorio simulado**, respondió 200 en los seis primeros escenarios y 503 en error de dependencia. Tiempos observados: 80 ms en la primera petición, 3–6 ms en las siguientes; no representan latencia de PostgreSQL o de una Edge Function desplegada.

Pruebas de Edge headless con host Microsoft simulado mediante CDP y repositorio simulado: los siete escenarios, cinco pantallas administrativas base, bienvenida elector, cambio entre módulos y reintento por error pasaron. No se realizan consultas al navegar: una POST de acceso al montar; segunda POST únicamente al reintentar. No hubo llamadas a InsForge durante esta prueba UI. El guard común también rechaza módulos sin rol, aunque se intente elegir uno fuera del menú.

La preparación inicial de DevTools no activaba Page y no inyectaba el host ficticio; se corrigió la configuración de la prueba, no la API getContext. Ningún fixture se incluye en la aplicación.

Se compiló además con `VITE_RBAC_DEMO_ENABLED=true` en la terminal: el bundle de producción no contiene navegación administrativa, endpoint verificar-acceso ni mensajes de validación demo. No se detectaron claves administrativas con formato ik_ en el artefacto. La clave pública de los catálogos permanece como antes.

La prueba con getContext Microsoft real y datos RBAC reales queda pendiente de permisos/configuración del servidor. No se afirma validación en una Edge Function desplegada ni en la app publicada: ambos despliegues están prohibidos en esta fase.

## Paso de RBAC_DEMO a autenticación real

1. Obtener un access token Entra destinado a la API, mediante el conector delegado/SSO o mecanismo oficial acordado. getContext no sustituye ese token.
2. Verificar en servidor firma/JWKS, issuer, tenant, audiencia, expiración, scope y cliente autorizado; derivar id_object/id_tenant de oid/tid validados y descartar los identificadores del body.
3. Reutilizar `resolveAccess(identity, repository)` con esa identidad validada; sustituir el handler demo, no sus checks por un simple flag.
4. Eliminar fixtures, allowlist provisional y frontend limitado a loopback; introducir sesiones/renovación únicamente si la arquitectura lo requiere. Mantener roles en estado temporal, no persistirlos como prueba de permiso.
5. Autorizar en servidor TODAS las operaciones futuras, con credencial de menor privilegio viable, RLS/SQL revisados, límites distribuidos y auditoría sin datos sensibles.
6. Antes de votos reales, implementar transacción, idempotencia/unicidad, habilitación del padrón y control de cierre del evento. Nada de eso existe en esta fase.
7. Retirar diagnóstico temporal e insignias de demo únicamente cuando la autenticación y autorización reales estén verificadas. Publicar solo tras aprobación explícita.
