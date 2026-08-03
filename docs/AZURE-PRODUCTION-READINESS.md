# Preparación de GestTrain/OS para Microsoft Azure

Fecha: 3 de agosto de 2026

## Arquitectura objetivo

- **Aplicación:** Azure App Service para Linux con Node.js 24 LTS.
- **Datos:** Azure Database for PostgreSQL Flexible Server.
- **Despliegue:** GitHub Actions manual con OpenID Connect.
- **Interfaz:** React compilado y servido por Express desde `dist/public`.
- **API:** Express en el puerto que Azure entrega mediante `PORT`.
- **Salud:** `/api/health/live` para proceso y `/api/health` para disponibilidad
  de la aplicación y su base de datos.

SQLite se conserva exclusivamente para desarrollo y pruebas. No se debe usar
como base comercial en App Service ni copiar `data/database.sqlite` al servidor.

## Estado de esta entrega

Se incluyen:

- controlador PostgreSQL y esquema inicial versionado;
- pool con límites, tiempo de espera y TLS verificable;
- selección y validación del proveedor de base de datos;
- comprobación estricta de variables de producción;
- paquete reproducible para App Service;
- workflow manual de staging, desactivado por defecto;
- comprobaciones de salud y arranque sobre artefactos compilados.

La activación del proveedor PostgreSQL en el cliente compartido permanece
bloqueada hasta probar el esquema contra una instancia PostgreSQL real. El
servidor falla de forma segura si se intenta iniciar producción mientras el
proveedor activo continúa siendo SQLite.

## Configuración de App Service

Configurar el stack de Linux como `NODE|24-lts` y el comando de inicio como:

```text
npm start
```

Variables mínimas de la aplicación:

```text
NODE_ENV=production
DATABASE_PROVIDER=postgresql
DATABASE_URL=<secreto de PostgreSQL>
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
CLIENT_ORIGIN=https://<dominio>
WEBAUTHN_ORIGIN=https://<dominio>
WEBAUTHN_RP_ID=<dominio sin protocolo>
TURNSTILE_SECRET_KEY=<secreto>
MFA_ENCRYPTION_KEY=<clave aleatoria segura>
SEED_DEMO_DATA=false
COMMERCIAL_TRIALS_ENABLED=false
SCM_DO_BUILD_DURING_DEPLOYMENT=false
```

`VITE_TURNSTILE_SITE_KEY` se configura como secreto de GitHub porque se inserta
durante la compilación del frontend. No es un secreto privado, pero debe
corresponder al dominio desplegado.

## GitHub Actions

El workflow `.github/workflows/azure-staging.yml` solo se ejecuta manualmente y
requiere:

Variables del repositorio:

- `ENABLE_AZURE_STAGING_DEPLOYMENT=true`
- `AZURE_WEBAPP_NAME`

Secretos:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `VITE_TURNSTILE_SITE_KEY`

La identidad de Azure debe disponer únicamente del permiso necesario sobre la
aplicación de staging. No se usa un perfil de publicación permanente.

## PostgreSQL y red

Para una prueba inicial puede emplearse acceso público limitado mediante reglas
de firewall. Antes de procesar datos reales se recomienda integrar App Service
y PostgreSQL mediante red privada o Private Link, usar el nombre DNS completo
del servidor y desactivar el acceso público.

TLS permanece activado y la aplicación rechaza certificados no verificables por
defecto. La variable `DATABASE_SSL_REJECT_UNAUTHORIZED=false` solo sirve para un
laboratorio controlado y no debe establecerse en Azure.

## Migración desde SQLite

El primer despliegue de PostgreSQL debe comenzar vacío. Los datos de demostración
locales no se migran automáticamente. Si la base SQLite llegase a contener datos
reales, la migración deberá ser un proceso separado:

1. detener escrituras;
2. crear una copia verificable de SQLite;
3. clasificar datos reales y ficticios;
4. transformar y cargar por dependencias;
5. comparar recuentos e integridad referencial;
6. ejecutar pruebas de acceso y reservas;
7. conservar una vía de reversión antes del cambio definitivo.

## Primera puesta en marcha

1. Crear un App Service de staging, no el entorno comercial definitivo.
2. Crear PostgreSQL Flexible Server y una base vacía.
3. Configurar red, TLS y secretos.
4. Validar las migraciones contra esa instancia.
5. Activar el cliente PostgreSQL tras la revisión específica.
6. Ejecutar el workflow manual.
7. Confirmar `/api/health`, autenticación, passkeys, CAPTCHA y reservas.
8. Revisar logs y reiniciar la instancia para comprobar persistencia.

No se debe habilitar tráfico comercial ni datos reales hasta completar estos
ocho pasos.

## Referencias oficiales

- [Configurar aplicaciones Node.js en Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [Desplegar App Service mediante GitHub Actions](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions)
- [TLS en Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls-how-to-connect)
- [Red privada para PostgreSQL Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking-private)
