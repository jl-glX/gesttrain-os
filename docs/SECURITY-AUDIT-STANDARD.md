# Estándar interno de auditoría integral de seguridad

**Versión:** 1.0

**Estado:** base oficial interna

**Ámbito:** GestTrain/OS y sus futuros entornos autorizados

## 1. Propósito

Este estándar convierte las revisiones de seguridad en un proceso repetible,
trazable y proporcional al riesgo. Define qué comprobar, bajo qué autorización,
qué evidencias conservar y cuándo una evaluación puede considerarse cerrada.

No es una certificación, una autorización permanente para atacar sistemas ni un
dictamen jurídico. Cada ejecución debe tener alcance, entorno, responsables y
reglas de intervención propios.

## 2. Principios obligatorios

1. **Autorización previa y escrita.** Deben constar activos, fechas, técnicas
   permitidas, límites de carga, contactos y procedimiento de parada.
2. **Entorno adecuado.** Las pruebas destructivas, de persistencia, radio,
   fuerza bruta de alto volumen o movimiento lateral solo se realizan en un
   laboratorio desechable o preproducción expresamente preparado.
3. **Datos sintéticos.** No se usan credenciales filtradas, hashes ajenos ni
   datos personales reales salvo autorización y necesidad documentadas.
4. **Mínimo impacto.** Se prueba el control con la menor explotación necesaria.
   Una prueba se detiene si amenaza disponibilidad, integridad o terceros.
5. **Evidencia reproducible.** Todo hallazgo debe incluir activo, precondición,
   pasos, resultado, impacto, severidad y evidencia saneada.
6. **Corrección verificable.** Un hallazgo no se cierra por modificar código,
   sino después de una prueba de regresión y una nueva validación.
7. **Separación entre hecho e hipótesis.** Los informes distinguen resultados
   observados, riesgos inferidos, controles no probados y trabajo futuro.

## 3. Puerta de entrada de cada auditoría

Antes de ejecutar pruebas se crea una ficha con:

- identificador, objetivo y responsable de la evaluación;
- commit, versión, entorno y arquitectura evaluados;
- dominios, IP, API, aplicaciones, cuentas y dispositivos incluidos;
- exclusiones explícitas y proveedores de terceros;
- modalidades autorizadas: caja negra, gris o blanca;
- intensidad máxima, concurrencia y ventanas de mantenimiento;
- datos de laboratorio, cuentas por rol y procedimiento de restauración;
- contactos de emergencia, señal de parada y tratamiento de evidencias;
- autorización específica para red, AD, Wi-Fi, físico o ingeniería social.

Sin esta ficha solo se permiten análisis estáticos y pruebas locales no
destructivas dentro del repositorio propio.

## 4. Fases del estándar

### Fase A — Estabilidad y línea base

- instalación reproducible desde el archivo de bloqueo;
- formato, lint, tipos, pruebas y compilación;
- arranque y apagado limpios, puertos y procesos residuales;
- migraciones, semillas idempotentes e integridad de la base;
- auditoría de dependencias, secretos y configuración insegura;
- copia y restauración cuando exista infraestructura persistente.

Un fallo de estabilidad que invalide resultados se corrige antes de continuar.

### Fase B — Caja blanca

Revisión del código, configuración y modelo de amenazas:

- autenticación, recuperación, MFA, passkeys y sesiones;
- autorización por rol, propiedad y centro;
- validación, serialización, cargas y tratamiento de errores;
- consultas, transacciones, concurrencia y restricciones de datos;
- cookies, CORS, CSRF, CSP, cabeceras, proxy y TLS;
- secretos, dependencias, CI, logs y datos sensibles;
- reservas, delegaciones, facturación, exportaciones y ciclo de cuenta;
- puntos de ejecución dinámica, subida/descarga y renderizado inseguro.

### Fase C — Caja gris

Con cuentas sintéticas de cada rol se comprueban:

- escalada vertical y acceso horizontal;
- rutas directas aunque la interfaz oculte el enlace;
- separación entre centros, entrenadores y socios;
- manipulación, caducidad, revocación y repetición de sesiones o tokens;
- operaciones entre sitios y cambios sensibles sin reautenticación;
- asignación masiva, parámetros inesperados y estados concurrentes.

### Fase D — Caja negra web y API

Desde una perspectiva externa y sin leer la implementación durante la prueba:

- inventario de rutas y métodos dentro del alcance;
- autenticación, autorización y limitación de intentos;
- entradas hostiles, JSON malformado, cuerpos y cabeceras excesivos;
- inyección, recorrido de rutas, cargas, exportaciones y errores;
- CORS, métodos no esperados, framing y cabeceras defensivas;
- concurrencia y presión acotada con umbrales acordados;
- esquemas, códigos de estado y ausencia de datos internos en respuestas.

La sonda incluida en el repositorio solo acepta objetivos locales. Probar una
preproducción requiere una herramienta y autorización separadas.

### Fase E — Identidad y resistencia de contraseñas

- política de longitud, bytes, previsibilidad y contraseñas comprometidas;
- coste y configuración del hash;
- enumeración de cuentas, limitación, CAPTCHA y bloqueo seguro;
- recuperación, verificación de correo, MFA, passkeys y revocación;
- prueba de diccionario exclusivamente sobre hashes sintéticos del laboratorio.

El crackeo agresivo real, los volcados ajenos y las campañas contra cuentas
reales quedan prohibidos. Una prueba de gran volumen exige equipo aislado,
presupuesto de recursos y límites aprobados.

### Fase F — Breach and Attack Simulation y Red Team

La simulación defensiva valida cadenas previamente acordadas, por ejemplo:

- sesión alterada o reutilizada tras revocación;
- usuario que intenta acceder a datos de otro rol o propietario;
- petición sensible iniciada desde un origen hostil;
- elevación mediante campos no permitidos;
- abuso distribuido simulado dentro de límites de laboratorio.

Un Red Team completo requiere objetivos, reglas de intervención y equipos
separados. Persistencia, phishing, exfiltración y movimiento lateral no se
suponen autorizados por este documento.

### Fase G — Infraestructura especializada

Estas superficies se evalúan únicamente cuando existan activos de laboratorio,
especialistas y autorización específica:

| Superficie       | Requisitos mínimos                                                   |
| ---------------- | -------------------------------------------------------------------- |
| Red interna      | Inventario, rangos propios, segmentación, ventana y restauración     |
| Active Directory | Dominio desechable, cuentas señuelo, GPO y controladores propios     |
| Red inalámbrica  | SSID y punto de acceso propios, adaptador compatible y límites radio |
| Seguridad física | Sede, horarios, zonas, acciones permitidas y coordinación presencial |

La ausencia de esos requisitos se registra como **no evaluado**, nunca como
control superado.

## 5. Clasificación y tratamiento de hallazgos

La severidad combina explotabilidad, impacto técnico, impacto para el negocio,
datos afectados y controles compensatorios:

- **Crítica:** compromiso sistémico, exposición masiva o control administrativo
  con explotación viable.
- **Alta:** acceso relevante no autorizado, pérdida grave de integridad o
  disponibilidad, o elusión de un control esencial.
- **Media:** impacto limitado, precondiciones importantes o defensa incompleta.
- **Baja:** endurecimiento, exposición menor o condición de baja probabilidad.
- **Informativa:** observación sin vulnerabilidad demostrada.

Cada hallazgo pasa por `detectado → confirmado → en corrección → retest →
cerrado`, o queda `aceptado temporalmente` con responsable, motivo, controles
compensatorios y fecha de revisión.

## 6. Evidencias y entregables

Cada auditoría produce:

1. resumen ejecutivo y limitaciones;
2. alcance, commit y entorno exactos;
3. matriz de pruebas con esperado, observado y evidencia;
4. hallazgos priorizados con reproducción saneada;
5. correcciones aplicadas y pruebas de regresión;
6. riesgos residuales y superficies no evaluadas;
7. comandos o herramientas reproducibles que no contengan secretos;
8. comparación con la línea base anterior;
9. resultado final: superada, superada con excepciones o no superada.

Las capturas y logs deben ocultar tokens, cookies, contraseñas, datos personales
y detalles que faciliten abuso fuera del equipo autorizado.

## 7. Criterios de salida

Una auditoría de versión queda cerrada cuando:

- la línea base de estabilidad supera todos sus controles;
- no quedan hallazgos críticos o altos sin corregir o aceptar formalmente;
- las correcciones tienen regresiones y retest satisfactorio;
- las excepciones incluyen propietario y fecha de revisión;
- el informe refleja claramente todo lo no evaluado;
- no quedan procesos, datos o credenciales temporales del laboratorio.

## 8. Cadencia recomendada

- **Cada cambio:** formato, lint, tipos, pruebas y compilación.
- **Cada dependencia o versión:** auditoría de paquetes y regresiones de
  seguridad automatizadas.
- **Antes de publicar:** caja blanca, gris, negra local y revisión de secretos.
- **Antes de producción:** preproducción representativa, infraestructura,
  copias, restauración, monitorización y prueba externa autorizada.
- **Tras un incidente o cambio crítico:** evaluación dirigida y retest completo
  de los controles afectados.
- **Periódicamente en producción:** ejercicio de respuesta, restauración y
  revisión independiente según riesgo y obligaciones aplicables.

## 9. Automatización disponible actualmente

```bash
npm run security:probe
npm run security:password-resilience
npm run check
npm run audit:ci
```

- `security:probe` ejecuta escenarios defensivos contra una API local y rechaza
  objetivos que no sean loopback.
- `security:password-resilience` usa únicamente contraseñas y hashes sintéticos.
- `check` valida formato, lint, tipos, pruebas y compilaciones.
- `audit:ci` bloquea avisos de dependencias no incluidos en una excepción
  explícita y acotada.

## 10. Registro inicial que fundamenta este estándar

- [Auditoría de estabilidad y seguridad — 1 de agosto de 2026](./SECURITY-AUDIT-2026-08-01.md)
- [Evaluación extrema local de seguridad — 1 de agosto de 2026](./SECURITY-ASSESSMENT-EXTREME-2026-08-01.md)

Esos informes documentan lo ejecutado y sus resultados. Este estándar define
cómo deben planificarse, limitarse, comparar y cerrar las siguientes auditorías.
