# Borrador futuro: Cloudflare WAF/CDN delante de Umbravia Forge

Estado: **pendiente y no activado**.

Este borrador se retomará cuando Umbravia Forge disponga de un dominio propio.
El despliegue actual con DuckDNS, Caddy y Node en la interfaz local no depende
de Cloudflare.

## Objetivo

Añadir una capa exterior que absorba tráfico abusivo y aplique reglas WAF,
limitación y observación antes de que las peticiones alcancen el servidor.

```text
Internet -> Cloudflare WAF/CDN -> Caddy :443 -> Node 127.0.0.1:3001
                                             -> PostgreSQL localhost
```

## Requisitos previos

- dominio propio bajo control de Umbravia;
- staging estable con el mismo commit que producción;
- copias y restauración de PostgreSQL comprobadas;
- monitorización del origen y de Caddy;
- inventario de rutas que pueden almacenarse en caché y rutas que nunca deben
  almacenarse;
- revisión de privacidad, transferencias y conservación de logs.

## Trabajo previsto

1. Incorporar el dominio a Cloudflare sin activar todavía el proxy.
2. Configurar TLS estricto de extremo a extremo y verificar la renovación del
   certificado del origen.
3. Activar el proxy primero en staging.
4. Habilitar reglas WAF administradas y reglas explícitas para rutas de escaneo
   (`.env`, `.git`, WordPress, phpMyAdmin y equivalentes).
5. Aplicar límites distintos a login, registro, recuperación, CAPTCHA y API
   general, manteniendo también los límites internos de Express.
6. Mantener reCAPTCHA v3 con validación en el servidor; el WAF no
   sustituye esa comprobación.
7. Cachear únicamente recursos estáticos versionados. No cachear API, HTML
   autenticado, cookies, datos de cuenta ni respuestas de error sensibles.
8. Configurar Caddy y Express para reconstruir la IP real solo desde proxies de
   Cloudflare autorizados. El número actual de saltos de confianza tendrá que
   revisarse: Cloudflare añadirá otra capa delante de Caddy.
9. Restringir el firewall del origen a las redes publicadas por Cloudflare, sin
   perder un acceso administrativo y una vía de reversión probados.
10. Crear alertas sobre bloqueos, picos de 401/403/429/5xx, fallos de reCAPTCHA
    y cambios de disponibilidad del origen.

## Criterios de aceptación

- no es posible alcanzar el origen público evitando Cloudflare;
- Caddy y Node conservan la IP real sin confiar en cabeceras arbitrarias;
- las rutas de autenticación no se almacenan en caché;
- las reglas no bloquean WebAuthn, reCAPTCHA ni operaciones legítimas;
- existe una prueba de carga moderada y una prueba de reglas en staging;
- el cambio se puede revertir a DNS directo de forma documentada;
- los logs no contienen contraseñas, tokens, cookies ni secretos.

## Decisiones que se tomarán entonces

- plan de Cloudflare y funciones disponibles en ese momento;
- certificado público de Caddy, Origin CA o desafío DNS;
- reglas WAF exactas y umbrales basados en tráfico medido;
- duración y ubicación de logs;
- estrategia de caché y purga;
- continuidad si Cloudflare o el origen fallan.

No deben fijarse ahora rangos IP, precios ni nombres de reglas administradas:
son datos cambiantes y se verificarán en la documentación oficial al ejecutar
esta fase.
