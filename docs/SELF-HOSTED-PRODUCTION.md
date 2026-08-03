# Despliegue de GestTrain/OS en servidor propio

Fecha: 3 de agosto de 2026

## Arquitectura objetivo

- **Aplicación:** servidor Linux con Node.js 24 LTS.
- **Datos normales:** PostgreSQL en una instancia separada o en el mismo
  servidor con acceso restringido.
- **MVP autocontenido:** SQLite únicamente para demostraciones y pruebas sin
  requisitos de alta disponibilidad.
- **Entrada HTTPS:** proxy inverso como Nginx o Caddy.
- **Proceso:** servicio del sistema o gestor equivalente con reinicio
  controlado.
- **Interfaz:** React compilado y servido por Express desde `dist/public`.
- **API:** Express escuchando solo en la interfaz y puerto configurados.

## Preparación disponible

El proyecto incluye:

- controlador PostgreSQL y migraciones versionadas;
- pool con límites, tiempos de espera y TLS configurable;
- comprobación estricta de variables de producción;
- compilación reproducible de cliente y servidor;
- paquete de despliegue independiente del proveedor;
- endpoints `/api/health/live` y `/api/health`;
- validación local de la configuración PostgreSQL sin abrir conexiones.

La activación del cliente PostgreSQL compartido debe realizarse después de
probar las migraciones contra una instancia de staging autorizada. Hasta ese
momento el servidor rechaza un arranque de producción que anuncie PostgreSQL
pero continúe usando el cliente SQLite.

## Perfiles de entorno

| Perfil        | Uso                            | Datos                     | Protección obligatoria                             |
| ------------- | ------------------------------ | ------------------------- | -------------------------------------------------- |
| `development` | trabajo local                  | SQLite y datos demo       | configuración local                                |
| `demo`        | MVP autocontenido y desechable | SQLite sin datos críticos | acceso restringido                                 |
| `staging`     | ensayo previo al lanzamiento   | PostgreSQL independiente  | mismas barreras que producción                     |
| `production`  | servicio real                  | PostgreSQL                | HTTPS, CAPTCHA, secretos y datos demo desactivados |

Los perfiles se seleccionan con `APP_ENV`. `staging` y `production` comparten
las mismas validaciones de seguridad para evitar que el lanzamiento dependa de
corregir diferencias de última hora. Cada entorno debe tener base de datos,
credenciales, dominio y CAPTCHA propios.

Las plantillas disponibles son:

- `.env.example` para desarrollo;
- `.env.staging.example` para el ensayo real;
- `.env.production.example` para producción.

No se debe copiar un `.env` entre entornos. Solo se copia la estructura y se
inyectan secretos diferentes desde el servidor.

## Construcción y paquete

```text
npm ci
npm run ci:validate
npm run deploy:package
npm ci --omit=dev --prefix .deployment-package
```

El paquete resultante queda en `.deployment-package`. No contiene `.env`, datos
SQLite ni secretos. Debe copiarse a una nueva versión del servidor y activarse
mediante un enlace o cambio atómico que permita volver a la versión anterior.

## Variables mínimas

```text
NODE_ENV=production
APP_ENV=production
PORT=3001
HOST=127.0.0.1
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
```

Antes del despliegue puede revisarse la configuración sin conectar:

```text
npm run db:postgres:validate-config
```

## Red y proxy

- Exponer públicamente solo los puertos 80 y 443.
- Mantener `HOST=127.0.0.1` para que el puerto de Node.js sea accesible
  únicamente desde el proxy local. Cambiarlo solo dentro de una red o contenedor
  expresamente aislado.
- Limitar PostgreSQL a la red privada o a `localhost` cuando comparta servidor.
- Configurar HTTPS, HSTS y renovación automática de certificados en el proxy.
- Enviar al proceso Node.js un único salto de proxy de confianza.
- Restringir SSH por clave, usuario sin privilegios y firewall.

## PostgreSQL

La primera prueba debe usar una base vacía de staging. El orden recomendado es:

1. crear usuario y base exclusivos con privilegios mínimos;
2. verificar TLS y conectividad desde la aplicación;
3. ejecutar y revisar las migraciones;
4. comprobar integridad referencial y recuentos;
5. validar autenticación, reservas, facturación y ciclo de cuentas;
6. reiniciar aplicación y base para comprobar persistencia;
7. ensayar copia de seguridad y restauración antes de admitir datos reales.

Los datos SQLite no se migran automáticamente. Cualquier traslado requiere
detener escrituras, respaldar, clasificar datos reales y ficticios, transformar,
cargar por dependencias y conservar una vía de reversión.

## Operación y recuperación

- Ejecutar el proceso con un usuario del sistema sin acceso administrativo.
- Reiniciar ante fallos con límites para evitar bucles.
- Rotar y conservar logs sin incluir secretos ni datos sensibles.
- Monitorizar salud, espacio, memoria, certificados y conexiones de base.
- Hacer copias cifradas de PostgreSQL y probar periódicamente su restauración.
- Mantener al menos una versión anterior desplegable.
- Aplicar actualizaciones primero en staging y después en producción.

## Primera puesta en marcha

1. Preparar un servidor de staging independiente.
2. Instalar Node.js, PostgreSQL o su cliente, y el proxy HTTPS.
3. Crear usuarios del sistema y reglas de firewall.
4. Configurar secretos fuera del repositorio.
5. Validar PostgreSQL y activar el cliente compartido tras la revisión.
6. Construir y desplegar una versión inmutable.
7. Confirmar salud, autenticación, passkeys, CAPTCHA y reservas.
8. Reiniciar todos los servicios y comprobar persistencia.
9. Probar copia, restauración y reversión de versión.

## Promoción de staging a producción

1. etiquetar el mismo commit validado en staging;
2. volver a construir desde el lockfile, sin copiar `node_modules`;
3. crear una copia de seguridad previa de producción;
4. revisar las migraciones pendientes y su reversibilidad;
5. desplegar una carpeta de versión nueva;
6. cambiar secretos y dominios mediante el entorno, nunca en el código;
7. ejecutar comprobaciones de salud antes de abrir tráfico;
8. mantener la versión anterior disponible para reversión rápida.

La promoción mueve código, no bases de datos ni archivos `.env`. Los datos de
staging nunca se convierten en datos de producción.

No se deben procesar datos reales ni abrir tráfico comercial antes de completar
estas comprobaciones.
