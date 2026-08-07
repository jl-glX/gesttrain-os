# Despliegue protegido en un único servidor

Estos archivos preparan la topología inicial de Umbravia Forge:

```text
Internet -> Caddy :443 -> Node 127.0.0.1:3001 -> PostgreSQL 127.0.0.1:5432
```

Solo Caddy queda expuesto. Node y PostgreSQL permanecen en la interfaz local.

## Archivos

- `Caddyfile`: HTTPS, rechazo temprano de sondas automáticas, límite exterior
  de cuerpo, registro JSON rotado y proxy con comprobación de salud.
- `umbravia-forge.service`: servicio `systemd` sin privilegios, con reinicio
  limitado, cierre mediante `SIGTERM` y aislamiento del sistema de archivos.

## Instalación resumida

1. Crear el usuario y las carpetas:

   ```text
   sudo useradd --system --home /var/lib/umbravia-forge --shell /usr/sbin/nologin umbravia
   sudo install -d -o root -g root -m 0755 /opt/umbravia-forge/releases
   sudo install -d -o root -g umbravia -m 0750 /etc/umbravia-forge
   sudo install -d -o caddy -g caddy -m 0750 /var/log/caddy
   ```

2. Copiar una versión construida a
   `/opt/umbravia-forge/releases/<version>` y crear el enlace
   `/opt/umbravia-forge/current`.
   `npm run deploy:package` exige una clave pública real de Turnstile mediante
   `VITE_TURNSTILE_SITE_KEY` o un `.env.production` local no versionado; así se
   evita construir una interfaz de producción que no pueda verificar usuarios.
3. Copiar `.env.production.example` a
   `/etc/umbravia-forge/umbravia-forge.env`, sustituir todos los marcadores y
   aplicar permisos `0640` con grupo `umbravia`.
4. Copiar el servicio a `/etc/systemd/system/umbravia-forge.service`.
5. Copiar el `Caddyfile` a `/etc/caddy/Caddyfile`. Si se cambia el hostname,
   sustituirlo en el archivo o definir `UMBRAVIA_DOMAIN` para el servicio Caddy.
6. Validar antes de activar:

   ```text
   sudo systemd-analyze verify /etc/systemd/system/umbravia-forge.service
   sudo caddy fmt --overwrite /etc/caddy/Caddyfile
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl daemon-reload
   sudo systemctl enable --now umbravia-forge
   sudo systemctl reload caddy
   ```

7. Comprobar desde el servidor y desde el exterior:

   ```text
   curl --fail http://127.0.0.1:3001/api/health/live
   curl --fail http://127.0.0.1:3001/api/health
   curl --fail https://umbravia-forge.duckdns.org/api/health
   curl -i https://umbravia-forge.duckdns.org/.env
   ```

La última petición debe devolver `404`; nunca debe mostrar un archivo ni la
interfaz React. Los logs se consultan con `journalctl -u umbravia-forge` y en
`/var/log/caddy/umbravia-forge-access.log`.

## Red y base de datos

- El firewall solo debe permitir SSH administrado, HTTP 80 y HTTPS 443.
- `HOST` debe permanecer en `127.0.0.1`.
- PostgreSQL debe usar `listen_addresses = 'localhost'` y reglas `pg_hba.conf`
  limitadas al usuario y base de Umbravia.
- Una conexión PostgreSQL local puede usar `DATABASE_SSL=false`; una base
  remota debe usar TLS con verificación de certificado.
- Antes de datos reales deben probarse copia, restauración y reversión de una
  versión completa.
