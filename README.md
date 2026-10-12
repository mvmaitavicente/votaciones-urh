# URH — Sistema de Votaciones

Aplicación React y TypeScript para Power Apps Code Apps, con InsForge Edge Functions y PostgreSQL. Incluye administración electoral, padrones, candidaturas, participación, emisión atómica de votos y navegación por roles.

## Estado actual

La fase funcional utiliza `getContext()` para obtener identificadores Microsoft y consultar roles en el backend. **Estos identificadores no constituyen autenticación criptográfica. Este modo está limitado a pruebas controladas y no debe utilizarse para una elección real.** La implementación JWT se conserva por separado.

Consulta [la guía funcional](docs/sistema-votaciones-funcional.md) para el modelo de datos, permisos, pruebas realizadas, despliegue y limitaciones pendientes.

## Preparación local

```powershell
npm ci
Copy-Item .env.example .env.local
```

Completa únicamente la configuración pública del cliente en `.env.local`. Las claves administrativas, tokens y conexiones PostgreSQL deben permanecer en configuración privada del servidor. Los archivos `.env.*.local` y la configuración local de InsForge están excluidos de Git.

```powershell
npm run dev
pa app run
```

Abre Local Play de Power Apps para obtener el contexto Microsoft. Las funciones remotas y los permisos deben estar configurados siguiendo la guía; clonar el frontend no despliega el backend ni habilita cuentas automáticamente.

## Verificación

```powershell
npm run check:rbac
npm run lint
npm test
npm run build
npm run build:functional
```

Los artefactos se generan en `dist` y `artifacts`, excluidos de Git. La publicación en Power Apps se realiza manualmente con `pa app push`, después de revisar y compilar la versión deseada.

## Documentación

- [Sistema electoral: configuración y resultados de pruebas](docs/sistema-votaciones-funcional.md)
- [Autenticación Microsoft Entra ID: implementación JWT separada](docs/autenticacion-entra-insforge.md)
- [Catálogo público de segmentos](docs/prueba-catalogo-anonimo.md)
- [Diagnóstico de identidad Power Apps](docs/diagnostico-identidad-power-apps.md)
