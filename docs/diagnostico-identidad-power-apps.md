# Identidad del usuario de Power Apps Code Apps

## Implementación

`src/services/identidadService.ts` llama exclusivamente a `getContext()` desde `@microsoft/power-apps/app` y devuelve objectId, tenantId, userPrincipalName y fullName. Los campos ausentes, vacíos o de tipo inesperado se muestran como no disponibles. La consulta tiene un timeout de 10 segundos para evitar carga indefinida cuando no hay host Power Apps. Ese timeout no cancela la comunicación interna del SDK; se ignoran respuestas de componentes desmontados.

`src/types/identidad.ts` define el contrato. `src/components/DiagnosticoIdentidad.tsx` muestra la tarjeta temporal, carga, error, contexto incompleto y botón de reintento. Se añadió debajo del formulario actual en `App.tsx`, reutilizando el diseño institucional. No se utilizan fixtures, query parameters, email escrito por el usuario o valores de respaldo para aparentar identidad real.

Los valores permanecen en memoria React. No se envían a InsForge, no se guardan en localStorage y no se registran en consola. No se implementaron roles, permisos, otro login, token exchange o cambios de autenticación. La integración del catálogo conserva sus GET existentes.

El SDK instalado conserva el contexto exitoso en caché interna. «Volver a consultar identidad» vuelve a invocar la API oficial, pero no fuerza renovar la sesión ni limpiar la caché del SDK. Para comprobar cambio de usuario, cerrar/reabrir la aplicación o recargar con la sesión correcta.

## Pruebas realizadas y límites

- `npm run build` y `npm run lint`: correctos.
- Pruebas del servicio con el SDK real y un host simulado: llamada AppLifecycle/getContext, cuatro campos, normalización de vacíos, contexto inválido, rechazo y timeout: correctas. No prueban identidad institucional real.
- `pa app run --non-interactive`: arrancó con el plugin existente en 5174 porque 5173 estaba ocupado.
- Edge headless contra Vite directo: comprobado manejo del timeout sin host y continuidad del catálogo. No se debe considerar esa apertura directa como validación de identidad Microsoft.
- Local Play autenticado: el usuario confirmó que aparecen los cuatro campos con su sesión Microsoft real. No compartió sus valores personales. Esta confirmación valida su presencia; no se realizó una comparación independiente con el directorio Entra.
- Aplicación publicada: pendiente. No se publicó este cambio y, por tanto, no se puede afirmar que se validó en el host publicado.

No publicar resultados que contengan nombres/UPN reales en logs o capturas compartidas. La tarjeta muestra los datos al propio usuario, pero debe retirarse una vez terminado el diagnóstico.

## Validación local con identidad real

1. Ejecutar `pa app run` o utilizar el servidor de prueba activo; abrir el enlace Local Play que imprime el plugin, con una cuenta institucional. No abrir únicamente localhost.
2. Comprobar que los cuatro campos estén presentes. objectId es el identificador Entra, no el systemUserId de Dataverse. Algunos hosts/versiones pueden omitir campos; el SDK instalado los tipa como opcionales.
3. Confirmar que UPN/nombre correspondan al usuario actual. Comparar objectId/tenantId con la identidad institucional autorizada si hay acceso al directorio. No compartir esos valores para confirmar esta prueba.
4. Probar el botón de consulta. Si se cambia de cuenta, recargar la aplicación.
5. En DevTools, comprobar que las únicas llamadas de la integración actual a InsForge sean GET del catálogo y no contengan los cuatro campos como body, query o headers de autenticación.

## Validación publicada, después de publicación manual

1. Compilar con `npm run build` y publicar manualmente con `pa app push` cuando se decida. El agente no ejecutó push.
2. Abrir la URL normal de la app publicada, sin parámetros Local Play ni dependencia de localhost, y recargar para evitar artefactos anteriores.
3. Repetir la verificación de los cuatro campos. Probar una segunda cuenta institucional y confirmar que objectId cambia y tenantId corresponde al tenant esperado.
4. Registrar únicamente si los campos están completos y si pertenecen al usuario correcto, sin copiar PII a esta documentación.

## Investigación: access token para el backend

La [API getContext documentada](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/retrieve-context) proporciona contexto, no un access token verificable. La superficie pública `@microsoft/power-apps/app` instalada exporta getContext y configuración; no expone un método para solicitar al host un token destinado a una audiencia arbitraria. No usar métodos privados internos, cookies del host o interceptar tokens de otras APIs. Esta conclusión se limita a la versión instalada y documentación revisada.

La vía oficial preferida para Code Apps es un **conector personalizado con OAuth Microsoft Entra y permisos delegados**, conectado a una API registrada para el backend. Power Platform gestiona obtención/renovación y envía el token a la API; no es necesario obtenerlo en JavaScript. [Documentación oficial de Entra para conectores](https://learn.microsoft.com/en-us/connectors/custom-connectors/azure-active-directory-authentication) y [conexión de Code Apps a datos](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-data).

Requisitos futuros: registro de API single-tenant, scope delegado, cliente del conector con permisos mínimos, redirect URL del conector, consentimiento institucional y DLP/licencias del entorno. No usar el recurso Azure Resource Manager del ejemplo oficial: sustituirlo por la API propia. Preferir identidad federada del conector si está disponible en el tenant, o mantener su credencial confidencial solo en la configuración protegida. Este mecanismo puede requerir consentimiento/conexión inicial y MFA; no garantiza cero interacción adicional aunque use la cuenta Microsoft existente.

Si se necesita un token en el frontend para fetch directo, la alternativa oficial es MSAL con autorización PKCE, `ssoSilent` y `acquireTokenSilent` para el scope de la API. El UPN obtenido del contexto puede ser un loginHint para adquisición; no es prueba de identidad ni autorización. No convertir sessionId de Power Apps en sid de Entra: no son equivalentes. [Restricciones oficiales de MSAL en iframes](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/iframe-usage): cookies de terceros, CSP, consentimiento y Conditional Access pueden impedir el modo silencioso y requerir interacción. No se instaló MSAL ni se inició ese flujo.

Un token de Microsoft debe ser emitido para la API backend registrada. Para access tokens v2, el claim aud esperado es el clientId GUID de la API; el identificador de scope solicitado puede ser `api://<api-id>/<scope>`. No reutilizar tokens de Graph o Power Apps, ni ID tokens como autorización de la API. [Validación oficial de claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).

InsForge no debe tratar estos identificadores de contexto como autenticación. No se identificó un intercambio nativo documentado de token Power Apps/Entra a sesión InsForge en la investigación previa. Una futura Edge Function podría validar firma/JWKS, issuer, tenant, audiencia, vigencia, permiso delegado y cliente autorizado; derivar tid/oid del token; y autorizar cada operación mediante el padrón. Primero se debe demostrar que el endpoint de función recibe el token Microsoft sin rechazo previo del gateway. No se implementó esa ruta ni se desactivaron protecciones.

Para este proyecto se recomienda probar primero el conector delegado y la Edge Function con una cuenta institucional, sin emitir segunda sesión InsForge. La aceptación del token y las operaciones sensibles siguen pendientes; mostrar la identidad en esta tarjeta no completa la autenticación del backend.
