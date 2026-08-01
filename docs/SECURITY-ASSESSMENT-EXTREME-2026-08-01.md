# Evaluación extrema local de seguridad — 1 de agosto de 2026

Esta evaluación es el registro histórico que sirvió, junto con la auditoría de
estabilidad precedente, para crear el
[estándar interno de auditoría integral](./SECURITY-AUDIT-STANDARD.md).

## Resumen ejecutivo

GestTrain/OS fue sometido a una evaluación defensiva de caja negra, caja gris y
caja blanca sobre una instancia local aislada y datos de laboratorio. La prueba
cubrió la aplicación web, la API, autenticación, sesiones, roles, ciclo de vida
de cuentas, concurrencia, entradas hostiles, presión controlada y resistencia de
contraseñas generadas exclusivamente para el laboratorio.

La evaluación confirmó tres problemas reproducibles y todos quedaron
corregidos:

1. Las rutas manipuladas que se normalizaban fuera de `/api` devolvían el HTML
   predeterminado de Express. Ahora toda ruta no reconocida termina en una
   respuesta JSON controlada y existe una prueba de regresión.
2. Una base heredada con reservas activas duplicadas podía fallar al crear el
   índice único durante el arranque. La migración ahora conserva de forma
   determinista una reserva activa, cancela duplicados, limpia entradas de
   espera obsoletas y aplica después la restricción. La migración está cubierta
   con una base heredada reproducida automáticamente.
3. La política admitía contraseñas de hasta 128 caracteres aunque bcrypt solo
   utiliza los primeros 72 bytes. Dos entradas con el mismo prefijo podían
   validar contra el mismo hash. La API, los servicios y la interfaz rechazan
   ahora cualquier contraseña que supere 72 bytes UTF-8, con pruebas de
   regresión para creación, acceso y verificación sensible.

Tras las correcciones, 24 archivos y 78 pruebas automatizadas superan la
validación. Cliente y servidor compilan, las pruebas dinámicas locales superan
18 escenarios y la auditoría de dependencias no contiene avisos sin una
excepción explícita y acotada.

Esta evaluación no es una certificación, no prueba infraestructura de
producción y no autoriza ataques contra sistemas de terceros.

## Comparación con la versión anterior

La referencia anterior es `main` en `4b04c8e`, antes de iniciar esta evaluación.
No se han debilitado los controles que ya existían; las regresiones de sesión,
roles, CSRF, reservas y ciclo de vida de cuenta siguen superándose.

| Área                           | Versión anterior                      | Versión evaluada                                       |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| Pruebas automatizadas          | 68 pruebas en 22 archivos             | 78 pruebas en 24 archivos                              |
| Caja negra reproducible        | Comprobaciones manuales acotadas      | Sonda local de 18 escenarios                           |
| Presión HTTP                   | Sin batería reproducible propia       | Ráfaga, `TRACE`, framing, cabeceras y chunks           |
| Rutas normalizadas             | Podían devolver el HTML por defecto   | Respuesta JSON controlada y regresión                  |
| Base SQLite heredada           | Podía fallar al crear el índice único | Reconciliación determinista antes de aplicar el índice |
| Contraseñas de más de 72 bytes | Aceptadas y truncadas silenciosamente | Rechazadas en interfaz, API y servicios                |
| Caja gris por identidad y rol  | Controles existentes                  | Pruebas explícitas de rol, propiedad, cookie y replay  |

La mejora es aditiva: refuerza observabilidad, migración y autenticación sin
sustituir las defensas del análisis anterior.

## Qué se pudo evaluar

### Caja negra

La sonda trata la API como un objetivo local desconocido y comprueba:

- acceso anónimo a sesión y administración;
- cabeceras defensivas y ocultación de Express;
- mutaciones desde un origen hostil;
- entradas similares a SQL y objetos de inyección;
- asignación masiva de un rol administrativo;
- JSON malformado y cuerpos excesivos;
- recorrido codificado de rutas;
- preflight CORS hostil;
- ráfaga concurrente de 64 comprobaciones de salud;
- intentos de autenticación con `X-Forwarded-For` rotatorio;
- método `TRACE`;
- ambigüedad `Content-Length`/`Transfer-Encoding`;
- cabeceras HTTP excesivas;
- cuerpos fragmentados malformados.

La herramienta está restringida por diseño a `localhost`, `127.0.0.1` y `::1`.
No puede dirigirse accidentalmente a una aplicación pública.

### Caja gris

Con cuentas de laboratorio de socio, entrenador y administrador se comprobó:

- acceso directo por URL a paneles administrativos;
- acceso horizontal a reservas de otra persona;
- separación entre clases propias y ajenas de un entrenador;
- privilegios administrativos esperados;
- manipulación de cookies de sesión;
- reutilización de una sesión después de cerrar sesión;
- solicitud de borrado entre sitios con una sesión válida;
- intento de eludir el limitador mediante IP reenviada falsa.

### Caja blanca

La revisión del código y configuración incluyó:

- autenticación, cookies, MFA, passkeys y revocación de sesiones;
- autorización por rol y propiedad;
- validación estricta y límites de cuerpos;
- consultas Kysely y SQL estático de migración;
- transacciones, índices, claves foráneas y datos heredados;
- búsqueda de secretos y archivos sensibles versionados;
- búsqueda de ejecución dinámica y renderizado HTML inseguro;
- árbol de dependencias, auditoría y excepción temporal documentada;
- compilación de producción y configuración de origen.

No se encontraron secretos versionados, `eval`, `new Function`, HTML insertado
con `dangerouslySetInnerHTML` ni SQL construido con entradas del usuario.

## Breach and Attack Simulation y Red Team limitado

La simulación se limitó a la superficie de la aplicación y representó estos
escenarios:

| Escenario                                | Control validado                      | Resultado                 |
| ---------------------------------------- | ------------------------------------- | ------------------------- |
| Credencial de sesión alterada            | Token opaco y validación del servidor | Rechazada con `401`       |
| Sesión robada reutilizada tras logout    | Revocación persistente                | Rechazada con `401`       |
| Socio que solicita datos administrativos | Autorización por rol                  | Rechazada con `403`       |
| Socio que consulta reservas ajenas       | Autorización por propiedad            | Rechazada con `403`       |
| Entrenador que consulta otra clase       | Propiedad de la clase                 | Rechazada con `403`       |
| Borrado iniciado desde un sitio hostil   | Origen y metadatos Fetch              | Rechazado con `403`       |
| Elevación mediante campo `role`          | Esquema estricto                      | Rechazada con `400`       |
| Intentos repetidos con IP falsa          | Proxy no confiado y limitador         | Bloqueados con `429`      |
| Ráfaga controlada de lectura             | Estabilidad de API                    | 64 de 64 respuestas `200` |

No se realizó persistencia, phishing, exfiltración ni movimiento lateral real.

## Evaluación controlada de contraseñas

Se generaron hashes bcrypt de coste 12 para contraseñas exclusivas del
laboratorio y se probó un diccionario de seis candidatos. En esta ejecución:

- creación del hash débil: 656 ms;
- seis comparaciones contra el hash débil: 3710 ms;
- rendimiento observado: 1,62 comparaciones por segundo;
- resultado débil: el candidato de laboratorio fue encontrado;
- seis comparaciones contra una contraseña aleatoria: 4009 ms, sin coincidencia;
- bcrypt aceptó en bruto dos entradas distintas con el mismo prefijo de 72
  bytes; la política de GestTrain/OS rechaza ambas antes de alcanzar el hash;
- credenciales reales, filtradas o pertenecientes a usuarios: ninguna.

El resultado demuestra que bcrypt encarece cada intento, pero no convierte una
contraseña predecible en segura. La protección depende también de la política de
contraseñas, MFA/passkeys, limitación, detección y respuesta a incidentes.

## Superficies que no se probaron

### Red interna

No había un rango de red, inventario, ventana de mantenimiento ni autorización
para escanear equipos. Una prueba futura necesita una red de laboratorio o
preproducción aislada con IPs expresamente incluidas.

### Active Directory

El proyecto no incluye un dominio Windows de laboratorio, controladores de
dominio, cuentas señuelo ni políticas de AD. Debe construirse un dominio
desechable y aislado antes de probar Kerberos, LDAP, delegaciones, GPO o rutas de
escalada.

### Red inalámbrica

No había adaptador compatible, punto de acceso de laboratorio ni autorización
radioeléctrica. Solo debe evaluarse un SSID propio y aislado con hardware de
prueba.

### Seguridad física

No existe una sede dentro del alcance. Solo se revisaron conceptualmente el
dispositivo desatendido, la revocación de sesiones, la privacidad del ID de
soporte y la recuperación de cuenta. Una evaluación física necesita reglas
escritas sobre acceso, horarios, personal, cámaras, credenciales y acciones
prohibidas.

### Crackeo agresivo real

No se usaron volcados, hashes ajenos, contraseñas reales ni campañas masivas.
Una prueba de alto volumen solo sería aceptable con hashes sintéticos, capacidad
acotada y una máquina de laboratorio que no afecte a terceros.

## Riesgos residuales

### Altos antes de producción

1. El borrado real continúa desactivado. Antes de activarlo necesita
   reautenticación reciente, confirmación reforzada, auditoría, cola recuperable
   y políticas legales aprobadas.
2. SQLite es adecuado para la demo local, no para coordinación entre varias
   instancias. Una producción horizontal requiere una base transaccional
   compartida y migraciones versionadas.
3. Las políticas de retención son una base demostrativa, no plazos legales
   aprobados. Deben definirse por jurisdicción y categoría con revisión
   profesional.

### Medios

4. El limitador en memoria no comparte estado entre servidores y puede afectar
   conjuntamente a usuarios detrás de una misma IP. Producción necesita un
   almacén compartido y señales combinadas de IP, cuenta y riesgo.
5. Faltan verificación de correo y recuperación completa de cuenta.
6. Faltan monitorización centralizada, alertas y un procedimiento operativo de
   respuesta a incidentes.
7. La infraestructura real de proxy, TLS, copias de seguridad y restauración no
   ha sido probada.

### Dependencia temporal

`react-router` y `react-router-dom` 7.18.2 mantienen la excepción
`GHSA-qwww-vcr4-c8h2`, limitada al modo React Server Components que GestTrain/OS
no utiliza. `npm run audit:ci` bloquea cualquier aviso o versión distinta. La
excepción debe retirarse en cuanto exista una versión corregida compatible.

## Reproducción segura

Con una instancia local en ejecución:

```bash
npm run security:probe
npm run security:password-resilience
npm run check
npm run audit:ci
```

La sonda de caja negra rechaza objetivos no locales. El análisis de contraseñas
usa únicamente datos definidos dentro del propio script de laboratorio.

## Conclusión

La superficie local evaluada queda estable frente a los escenarios probados y
los tres fallos reproducibles han sido corregidos con regresiones automáticas.
El siguiente nivel de seguridad no consiste en ampliar ataques indiscriminados,
sino en construir una preproducción representativa con autorización, telemetría
y laboratorios separados para red, AD, Wi-Fi e infraestructura.
