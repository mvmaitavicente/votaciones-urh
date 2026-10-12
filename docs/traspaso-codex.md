# Traspaso para Codex en otra PC

Fecha de referencia: 12 de octubre de 2026. Este documento resume el trabajo y sus decisiones; **no es una transcripción literal de la conversación**. No contiene claves, tokens ni identificadores personales de la cuenta de prueba. Contrastar siempre con el código y el entorno real: la configuración remota puede cambiar o caducar.

## Proyecto y objetivo

- Repositorio: https://github.com/mvmaitavicente/votaciones-urh, rama `main`.
- Aplicación existente: URH — Sistema de Votaciones, React + TypeScript + Vite, Power Apps Code Apps. No crear otro proyecto.
- Backend: InsForge, proyecto **PRONIED**, autorizado como entorno de pruebas.
- API: `https://feiztkc9.us-east.insforge.app`.
- Edge Functions: `https://feiztkc9.function2.insforge.app`.
- PostgreSQL: esquema `urh_votacion`.
- Uso previsto: aproximadamente 500 trabajadores, una jornada. No se ha ejecutado una prueba de carga equivalente.

## Evolución y decisiones importantes

1. El selector de segmentos pasó de datos estáticos a lectura real mediante la API nativa de InsForge. Usa `id_segmento`, `dsc_segmento`, `ord_segmento`, ordenados por este último.
2. Se autorizó lectura anónima únicamente del catálogo no sensible `segmento`. Nunca ampliar esta autorización a trabajadores, roles, padrones o votos.
3. Se implementó identidad con `getContext()` del SDK oficial. El usuario confirmó objectId, tenantId, userPrincipalName y fullName en Local Play. Estos datos no constituyen autenticación verificable por el backend.
4. Se preparó JWT Microsoft Entra y un conector OAuth. El gateway enviaba Origin `https://make.powerautomate.com` aunque el diseñador no lo mostraba. Se permitió ese origen exacto; no se relajaron firmas ni permisos. El conector llegó a devolver `PERMISO_INSUFICIENTE`. No considerar resuelta la autorización real Microsoft.
5. Posteriormente el usuario solicitó una fase funcional **sin conector ni access_as_user**, basada en GUID del contexto, manteniendo JWT separado. Esta es la fase activa actual, exclusivamente para pruebas controladas.
6. Se implementaron administración, elector, voto atómico, seguimiento y resultados contra PostgreSQL real. La implementación y el repositorio se subieron a GitHub. No se publicó automáticamente la aplicación Power Apps.

## Estado del código

- `src/services/identidadService.ts`: identidad Microsoft mediante getContext.
- `src/services/insforgeClient.ts`, `catalogosService.ts`, `src/hooks/useSegmentos.ts`: catálogo público real.
- `src/services/votacionesService.ts`, `src/types/votaciones.ts`: flujo funcional HTTPS.
- `src/components/FunctionalApp.tsx`: acceso y módulos por roles.
- `AdminModule.tsx`: eventos, segmentos, padrones, trabajadores, candidaturas, opciones, participación y resultados.
- `ElectorModule.tsx`: padrones habilitados, selección, confirmación, voto y resultados publicados.
- `functions/functional/`: handlers GUID de verificar-acceso, operacion y emitir-voto.
- `functions/entra-verificar-acceso.ts`, `functions/shared/entra.ts`: JWT separado, jose, firma RS256, JWKS/discovery, issuer, audience, tenant, fechas, scope y cliente OAuth.
- `migrations/20261012080000_urh-functional.sql`: cambios ya aplicados en PRONIED. **No volver a ejecutarla sin verificar el estado: no es íntegramente idempotente.**

Tablas reutilizadas: usuario, rol, usuario_rol, personal, evento, segmento, padron, padron_detalle, candidatura, opcion_electoral, participacion_electoral y voto. `usuario.id_persona` corresponde a `personal.id_personal` en este modelo.

## Backend desplegado y reglas

Rutas actuales: `/verificar-acceso` (GUID temporal), `/operacion`, `/emitir-voto` y `/verificar-acceso-entra` (JWT). No modificar la función ajena `powerbi-workspaces-sync`.

Las funciones funcionales llaman la RPC `urh_votacion.urh_operacion(uuid,uuid,text,jsonb)` por PostgREST, con clave administrativa **solo en secretos del servidor**. RPC SECURITY DEFINER, search_path fijo, SQL estático y roles consultados en cada operación. Se revocó EXECUTE de PUBLIC para esta RPC y se concedió solo a `project_admin`. No se concedieron permisos anónimos nuevos ni se alteró RLS.

Voto único: UNIQUE en participación por padrón/detalle y padrón/persona único en el detalle. Participación y voto se insertan atómicamente; colisión específica devuelve YA_VOTO. Un fallo revierte ambos. No confiar en una comprobación React ni en un SELECT previo.

Votos nuevos no almacenan vínculo directo a participación: `voto.id_participacion` permite NULL y fecha de emisión se reduce al día. Se conservaron vínculos históricos. **No garantiza anonimato criptográfico frente al administrador de PostgreSQL.**

Configuración electoral solo mientras BORRADOR; no reabrir eventos cerrados. Resultados agregados tras cierre; electores solo cuando están publicados y pertenecen al padrón. Se bloquea cambiar el trabajador de una cuenta que ya participó.

## Seguridad y configuración que no viaja con Git

El modo GUID **permite suplantación si alguien conoce los identificadores**. No presentar este modo como autenticación segura ni utilizarlo en una elección real. CORS, una lista de GUID y roles no subsanan esta limitación.

Activación remota: ACCESS_ENVIRONMENT=test, FUNCTIONAL_GUID_ENABLED=true, lista temporal de cuentas permitidas y FUNCTIONAL_GUID_EXPIRES_AT, con ventana máxima de 24 horas. Se activó para una cuenta de prueba; podría haber caducado al retomar. Revisar antes de cambiar configuración. No ampliar a trabajadores reales automáticamente.

Excluidos de Git: `.env.local`, `.env.rbac.local`, `.env.auth.local`, `.insforge`, node_modules, dist y artifacts. Obtener configuración local por canal privado o desde los proveedores autorizados, nunca de logs públicos.

Frontend: VITE_ACCESS_MODE=functional, VITE_FUNCTIONS_BASE_URL con el host HTTPS real, URL de InsForge y clave pública oficial anon_ del catálogo. **Ninguna clave ik_ ni conexión PostgreSQL en VITE_.** Los secretos administrativos del backend ya existen en PRONIED, no se deben copiar al cliente.

La cuenta de prueba tiene ambos roles, pero aún no se vinculó a un trabajador. Puede devolver TRABAJADOR_NO_VINCULADO. La pantalla Administración → Trabajadores permite la vinculación manual correcta; no adivinarla.

## Verificaciones realizadas y pendientes

Ejecutados correctamente: build, ESLint, TypeScript y 75 tests. PostgreSQL real con cuentas/eventos ficticios temporales: roles, dos conexiones concurrentes → un voto/participación, error de almacenamiento → rollback y resultados tras cierre. Filas ficticias limpiadas por sus IDs; las secuencias pueden conservar saltos.

HTTPS real: acceso 200, administración 200, Origin ajeno 403, roles inyectados 400, identidad fuera de lista 403, preflight 204 y ruta JWT sin token 401. Latencias puntuales: acceso 888 ms y administración 527 ms. Auditoría: sin claves administrativas en bundle y sin acceso anon a las otras tablas o funciones del esquema.

Pendientes reales: comprobar la interfaz electoral nueva en Local Play, una emisión exitosa desde Power Apps y todo el flujo en Power Apps Web publicado. No afirmar que esas pruebas ya se ejecutaron. Tampoco hay prueba positiva completa con token Microsoft real para las operaciones electorales.

## Preparar la otra PC

```powershell
git clone https://github.com/mvmaitavicente/votaciones-urh.git
cd votaciones-urh
npm ci
Copy-Item .env.example .env.local
```

Completar la configuración pública y autenticar las herramientas necesarias en esa PC. No copiar `auth.json` ni toda la carpeta `.codex`. No reinstalar/reinicializar Power Apps sobre el proyecto; conservar `power.config.json`. No asumir que clonar Git configura credenciales, Power Apps CLI o el enlace InsForge.

```powershell
npm run check:rbac
npm run lint
npm test
npm run build
npm run dev
pa app run
```

Abrir Local Play para el contexto Microsoft. InsForge: utilizar skills disponibles y CLI oficial con `npx -y @insforge/cli`; verificar el enlace al proyecto correcto antes de desplegar o ejecutar SQL. No repetir migraciones ni crear otro backend. Publicación Power Apps manual: **no ejecutar pa app push automáticamente**.

## Instrucción para pegar al nuevo Codex

> Continúa el proyecto existente URH. Lee AGENTS.md, docs/traspaso-codex.md y docs/sistema-votaciones-funcional.md antes de actuar. Revisa el código y verifica el estado real del backend PRONIED: la activación GUID puede caducar. Mantén JWT separado y no trates los GUID como autenticación. No publiques Power Apps automáticamente, no copies secretos al frontend, no repitas migraciones y no modifiques otras funciones. Primero informa qué está implementado y qué verificación manual falta; después continúa con la tarea que te indique.

## Conversación y logs

Este archivo permite continuar sin importar el chat anterior. Git contiene código y documentos, no una sesión de Codex. Se observaron registros JSONL locales en `C:\Users\User\.codex\sessions`, pero no se verificó que cubran íntegramente esta conversación. Pueden incluir secretos, datos personales y herramientas; no subirlos sin revisar/redactar ni copiar bases internas de Codex.

La CLI documenta `codex resume` para retomar sesiones guardadas. Esto no establece que un `git clone` sincronice conversaciones entre PCs. Referencia oficial: https://developers.openai.com/codex/cli/features.
