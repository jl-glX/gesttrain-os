# Auditoría de estabilidad y seguridad — 1 de agosto de 2026

Esta auditoría es un registro histórico. El procedimiento repetible para futuras
evaluaciones se mantiene en el
[estándar interno de auditoría integral](./SECURITY-AUDIT-STANDARD.md).

## Resumen ejecutivo

Se realizó una revisión defensiva de caja blanca del repositorio, acompañada de
pruebas dinámicas contra una instancia local aislada. La revisión confirmó
problemas de configuración, control de origen, integridad de reservas,
autorización administrativa, validación y exportación de datos. Los fallos
confirmados y reproducibles se corrigieron y quedaron cubiertos por pruebas de
regresión.

La rama auditada supera actualmente el formato, lint, comprobación de tipos, 68
pruebas automatizadas y las compilaciones de cliente y servidor. La instalación
limpia mediante el archivo de bloqueo también fue reproducida correctamente.

Esta auditoría no es una certificación de seguridad ni sustituye una prueba
externa sobre la infraestructura de producción. Tampoco valida por sí sola el
cumplimiento del RGPD, la LOPDGDD, la normativa fiscal o los plazos legales de
conservación. Esas decisiones requieren definir países, responsable del
tratamiento, encargados, finalidades, contratos y plazos con asesoramiento
jurídico antes de activar el borrado real.

## Alcance y método

- Revisión de rutas, autenticación, autorización, cookies, passkeys, MFA,
  delegaciones, reservas, administración, borrado y retención.
- Revisión de CORS, cabeceras, límites de peticiones, configuración de proxy y
  tratamiento de errores.
- Revisión de SQLite, claves foráneas, transacciones e índices de unicidad.
- Instalación limpia, análisis de dependencias y búsqueda de secretos en
  archivos versionados.
- Pruebas dinámicas locales de origen cruzado, acceso no autenticado, inyección
  en login, JSON malformado, cuerpo excesivo y recorrido codificado de rutas.
- Pruebas de concurrencia, repetición de tokens, bloqueo administrativo y
  neutralización de fórmulas CSV.

No se efectuaron ataques contra servicios de terceros, infraestructura pública,
cuentas reales ni redes ajenas.

## Hallazgos corregidos

| ID      | Severidad | Hallazgo                                                                                                                                                       | Corrección y evidencia                                                                                                                                                                                                   |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-01  | Crítica   | `SEED_DEMO_DATA=true` podía crear en producción cuentas con contraseñas demo públicas.                                                                         | El arranque de producción rechaza expresamente esa configuración. La política tiene pruebas unitarias.                                                                                                                   |
| SEC-02  | Alta      | CORS no impedía por sí solo mutaciones entre sitios o subdominios con cookies.                                                                                 | Las operaciones mutables rechazan `Sec-Fetch-Site: cross-site` y orígenes no confiables antes de autenticar o procesar el cuerpo.                                                                                        |
| SEC-03  | Alta      | WebAuthn podía derivar el origen y RP ID de cabeceras controladas por la petición.                                                                             | Origen y RP ID quedan ligados a configuración confiable; producción exige HTTPS y `CLIENT_ORIGIN`.                                                                                                                       |
| SEC-04  | Alta      | Reservas simultáneas podían sobrepasar el aforo o dejar una cancelación y promoción a medias.                                                                  | Reserva, cancelación y promoción utilizan transacciones; un índice parcial impide dos reservas activas para la misma clase y persona. Una prueba concurrente confirma una sola plaza para cinco solicitudes simultáneas. |
| SEC-05  | Alta      | SQLite no activaba claves foráneas, permitiendo registros huérfanos.                                                                                           | Se activa `PRAGMA foreign_keys=ON`, WAL y espera ante bloqueo. Una prueba confirma el rechazo de reservas huérfanas.                                                                                                     |
| SEC-06  | Media     | Un administrador podía eliminar o degradar la misma cuenta con la que operaba.                                                                                 | Se bloquean eliminación individual, eliminación masiva y cambio de rol de la cuenta administrativa activa.                                                                                                               |
| SEC-07  | Media     | La eliminación masiva de usuarios no era atómica y ocultaba errores parciales.                                                                                 | La operación completa usa una transacción y propaga los fallos.                                                                                                                                                          |
| SEC-08  | Media     | Un token de delegación ya canjeado podía repetirse por la misma persona.                                                                                       | Todo segundo canje se rechaza como token usado; existe prueba de regresión.                                                                                                                                              |
| SEC-09  | Media     | Varias rutas de ciclo de vida, retención, delegaciones y gestor de recursos aceptaban cuerpos insuficientemente definidos.                                     | Se añadieron esquemas estrictos, límites, enumeraciones y rechazo de campos inesperados.                                                                                                                                 |
| SEC-10  | Media     | Los CSV de asistentes permitían fórmulas de hoja de cálculo introducidas mediante nombre o correo.                                                             | Se neutralizan celdas que comienzan por `=`, `+`, `-` o `@`, incluso tras espacios y tabulaciones.                                                                                                                       |
| SEC-11  | Media     | La programación concurrente del borrado podía chocar con su índice único y las rutas sin cuerpo aceptaban campos dirigidos a otra cuenta aunque los ignorasen. | La inserción es idempotente ante concurrencia; programar y cancelar rechazan cuerpos o consultas inesperados y siempre actúan sobre la sesión autenticada.                                                               |
| STAB-01 | Media     | El proyecto exigía Node 26 y npm 12, incompatibles con el entorno LTS disponible y con una instalación limpia.                                                 | Proyecto, CI, tipos y documentación se alinearon con Node 24 LTS y npm 11.                                                                                                                                               |
| STAB-02 | Baja      | Reejecutar la semilla demo generaba errores de unicidad ruidosos aunque terminara correctamente.                                                               | La semilla comprueba reservas activas existentes y ahora es idempotente sin usar excepciones como flujo normal.                                                                                                          |

## Dependencia con excepción temporal

`npm audit` informa del aviso alto `GHSA-qwww-vcr4-c8h2` para React Router
7.18.2. El aviso afecta al modo React Server Components; GestTrain/OS usa
`BrowserRouter` declarativo y no activa RSC. No existe una versión corregida
publicada dentro del rango actual.

El control `npm run audit:ci` permite únicamente ese aviso, únicamente para las
versiones y la cadena esperadas, y falla ante cualquier vulnerabilidad nueva o
cambio de alcance. No se rebajó React Router porque las versiones anteriores
introducían más avisos aplicables. Esta excepción debe retirarse en cuanto haya
una versión corregida compatible.

## Pruebas dinámicas locales

| Prueba                            | Resultado esperado                     | Resultado       |
| --------------------------------- | -------------------------------------- | --------------- |
| Salud y cabeceras defensivas      | `200`, `nosniff`, protección de marcos | Superada        |
| Mutación desde origen hostil      | `403 UNTRUSTED_ORIGIN`                 | Superada        |
| Ruta administrativa sin sesión    | `401`                                  | Superada        |
| Cadena de inyección en login      | Rechazo sin autenticación              | `400`, superada |
| JSON malformado                   | `400 INVALID_JSON`                     | Superada        |
| Cuerpo superior al límite         | `413 PAYLOAD_TOO_LARGE`                | Superada        |
| Recorrido codificado en descargas | Sin acceso al archivo                  | `401`, superada |
| Cinco reservas para una plaza     | Una confirmada, cuatro en espera       | Superada        |
| Fórmula en nombre exportado       | Celda neutralizada                     | Superada        |
| Clave foránea inexistente         | Inserción rechazada                    | Superada        |
| Borrado sin sesión                | Todas las operaciones rechazadas       | `401`, superada |
| Borrado dirigido a otro usuario   | Cuerpo rechazado, sin crear solicitud  | `400`, superada |
| Ocho programaciones simultáneas   | Una única solicitud lógica             | Superada        |
| Cancelación desde otra cuenta     | No modifica la solicitud del titular   | Superada        |
| Gracia vencida con motor demo     | No ejecuta un borrado accidental       | Superada        |
| Cancelación repetida              | Idempotente y cuenta conservada        | Superada        |

## Riesgos abiertos antes de producción

### Prioridad alta

1. **Borrado real con reautenticación.** La demo de revisión y programación no
   debe convertirse en ejecutor real hasta exigir autenticación reciente,
   segundo factor cuando esté configurado, confirmación explícita, registro de
   auditoría y proceso recuperable durante el periodo de gracia.
2. **Despliegue en varias instancias.** SQLite y sus transacciones protegen la
   instancia local actual, no coordinan varios servidores. Antes de escalar
   horizontalmente debe migrarse a PostgreSQL u otra base con transacciones y
   bloqueos compartidos, manteniendo las restricciones de unicidad.
3. **Políticas legales de retención.** Las categorías y textos actuales son una
   base funcional de demostración. Los plazos, excepciones, bloqueo, supresión y
   conservación fiscal deben aprobarse por jurisdicción antes de ejecutar
   eliminaciones irreversibles.

### Prioridad media

4. **Proxy y limitación por IP.** `trust proxy` permanece desactivado de forma
   segura. Si se despliega detrás de un proxy, debe configurarse una lista de
   proxies confiables; activarlo de forma genérica permitiría falsificar IP. La
   limitación debería combinar IP y cuenta para evitar bloqueos colectivos en
   redes de gimnasio.
5. **Migraciones y copias de seguridad.** Sustituir cambios de esquema en el
   arranque por migraciones versionadas, con copia previa y prueba periódica de
   restauración.
6. **Observabilidad e incidentes.** Centralizar eventos de seguridad, alertas,
   retención de logs, correlación y un procedimiento documentado de respuesta a
   incidentes, evitando registrar secretos o datos innecesarios.
7. **Recuperación y verificación de correo.** Completar verificación de correo,
   recuperación segura, caducidad de enlaces, revocación de sesiones y avisos
   ante cambios sensibles.
8. **Protección de abuso distribuido.** El limitador en memoria es adecuado para
   una demo de una instancia; producción necesita un almacén compartido y
   controles adicionales ante intentos distribuidos.

## Validación ejecutada

- Instalación limpia con `npm ci`: superada.
- Formato y lint: superados.
- TypeScript de cliente y servidor: superado.
- Pruebas: 22 archivos, 68 pruebas superadas.
- Compilación de cliente y servidor: superada.
- Auditoría controlada de dependencias: superada con la única excepción RSC
  documentada.
- Búsqueda de patrones de secretos y archivos sensibles versionados: sin
  hallazgos; `.env` y la base SQLite local están ignorados.

## Próximas acciones recomendadas

1. Mantener este conjunto de pruebas como barrera de CI.
2. Resolver la excepción de React Router cuando exista versión corregida.
3. Diseñar la reautenticación y el ejecutor de borrado antes de activar la
   eliminación real.
4. Definir migraciones, PostgreSQL, backups y configuración de proxy antes del
   primer despliegue multiusuario público.
5. Encargar una revisión jurídica de privacidad, retención, facturación y
   condiciones de uso cuando estén definidos los países y el modelo operativo.
6. Realizar una prueba externa autorizada sobre un entorno de preproducción con
   la misma infraestructura que producción.
