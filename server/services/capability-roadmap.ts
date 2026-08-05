export type CapabilityStatus =
  "implemented" | "partial" | "prepared" | "missing";

export interface CapabilityAssessment {
  id: string;
  area: string;
  status: CapabilityStatus;
  current: string;
  gap: string;
  evidence: string[];
  marketReference: string;
  priority: "critical" | "high" | "medium" | "low";
  destination: string | null;
}

const capabilities: CapabilityAssessment[] = [
  {
    id: "account-security",
    area: "Identidad y seguridad de cuentas",
    status: "implemented",
    current:
      "Registro, sesiones revocables, MFA, passkeys, recuperación, CAPTCHA y control de riesgo en observación.",
    gap: "Validación operativa externa, monitorización continua y respuesta formal a incidentes.",
    evidence: [
      "server/services/account-security.ts",
      "server/services/security-manager.ts",
      "server/security/extreme-assessment.test.ts",
    ],
    marketReference:
      "Las plataformas maduras respaldan estos controles con operación 24/7, auditoría externa y certificaciones.",
    priority: "high",
    destination: "/account/security",
  },
  {
    id: "roles-and-operations",
    area: "Roles y operación diaria",
    status: "implemented",
    current:
      "Permisos de socio, entrenador y administrador; clases, paneles por rol y administración básica.",
    gap: "Permisos personalizados por centro, turnos del personal y flujos de aprobación más granulares.",
    evidence: [
      "server/middleware/authorization.ts",
      "client/src/pages/AdminDashboardPage.tsx",
      "client/src/pages/TrainerDashboardPage.tsx",
    ],
    marketReference:
      "Glofox, Virtuagym, WodBuster y GestiGym muestran operaciones de personal más maduras.",
    priority: "medium",
    destination: "/admin-dashboard",
  },
  {
    id: "booking-uncertainty",
    area: "Reservas, espera e incertidumbre",
    status: "implemented",
    current:
      "Aforo, lista de espera FIFO, ciclo de reserva, intención de asistencia y reputación recuperable.",
    gap: "Validación con centros reales, notificaciones multicanal y reglas configurables por negocio.",
    evidence: [
      "server/services/booking.ts",
      "server/services/booking-lifecycle.ts",
      "server/services/booking-reputation.ts",
    ],
    marketReference:
      "La reserva convencional está madura en el mercado; la gestión explícita de incertidumbre es la diferenciación propia.",
    priority: "high",
    destination: "/classes",
  },
  {
    id: "community",
    area: "Comunidad integrada",
    status: "partial",
    current:
      "Perfiles, contactos, canales, comentarios, moderación y contenido asociado a sesiones.",
    gap: "Notificaciones, experiencia móvil, límites antiabuso y validación de la convivencia entre centros.",
    evidence: [
      "server/routes/community.ts",
      "server/routes/moderation.ts",
      "client/src/pages/CommunityPage.tsx",
    ],
    marketReference:
      "WodBuster separa públicamente gestión, coaching y social; la integración en una sola experiencia puede diferenciar a Umbravia.",
    priority: "medium",
    destination: "/community",
  },
  {
    id: "commercial-onboarding",
    area: "Alta comercial y entorno de prueba",
    status: "implemented",
    current:
      "Prueba autoservicio de 31 días, catorce tipos de centro, plantillas editables y declaración de datos reales.",
    gap: "Aislamiento físico por cliente, aprovisionamiento completo y conversión verificada a producción.",
    evidence: [
      "server/services/commercial-trial.ts",
      "client/src/pages/CommercialTrialPage.tsx",
      "server/services/environment-manager.ts",
    ],
    marketReference:
      "El onboarding asistido reduce fricción, pero una demo autónoma y aislada evita el contacto comercial obligatorio.",
    priority: "critical",
    destination: "/admin/commercial-trial",
  },
  {
    id: "database-runtime",
    area: "Persistencia y promoción de entornos",
    status: "partial",
    current:
      "Fachada común Kysely, PostgreSQL para entornos reales y SQLite para desarrollo, demos y MVP aislados.",
    gap: "Ensayo contra un PostgreSQL real, migración autorizada de datos y restauración probada.",
    evidence: [
      "server/db/client.ts",
      "server/db/postgres-client.ts",
      "server/db/database-bridge.ts",
    ],
    marketReference:
      "La fiabilidad comercial exige PostgreSQL gestionado, copias restaurables y procedimientos de migración ensayados.",
    priority: "critical",
    destination: "/admin/environment-manager",
  },
  {
    id: "automation-engine",
    area: "Automatización basada en reglas",
    status: "prepared",
    current:
      "Gestores coordinados y tareas internas periódicas con exclusión por ámbitos.",
    gap: "Motor configurable condición-acción para asistencia, pagos, retención y comunicaciones.",
    evidence: [
      "server/services/resource-manager.ts",
      "server/services/manager-coordinator.ts",
    ],
    marketReference:
      "WodBuster muestra automatizaciones por inactividad, pagos, cumpleaños y comportamiento.",
    priority: "high",
    destination: "/admin/resource-manager",
  },
  {
    id: "billing",
    area: "Facturación y cobros",
    status: "partial",
    current:
      "Registros, estados, vencimientos, archivo y vista administrativa.",
    gap: "Proveedor de pagos, conciliación, impuestos, facturación legal y reembolsos.",
    evidence: ["server/routes/billing.ts", "client/src/pages/BillingPage.tsx"],
    marketReference:
      "Los competidores consolidados integran pagos recurrentes, impagos y conciliación en la operación diaria.",
    priority: "critical",
    destination: "/billing",
  },
  {
    id: "multi-tenant",
    area: "Aislamiento multi-centro",
    status: "missing",
    current: "La aplicación funciona como una instancia de centro único.",
    gap: "Tenant explícito en datos, autorización, claves, almacenamiento, límites y auditoría.",
    evidence: ["server/db/types.ts", "server/db/postgres-migrations.ts"],
    marketReference:
      "La operación multiubicación es una capacidad central en Glofox, Virtuagym y otros productos maduros.",
    priority: "critical",
    destination: "/admin/environment-manager",
  },
  {
    id: "physical-access",
    area: "Control de acceso físico",
    status: "missing",
    current:
      "No existe integración con tornos, QR, NFC ni controladores físicos.",
    gap: "Modelo de dispositivos, credenciales, funcionamiento sin conexión y registro de accesos.",
    evidence: [],
    marketReference:
      "Virtuagym, Glofox y GestiGym destacan integraciones de acceso físico como parte del servicio comercial.",
    priority: "medium",
    destination: null,
  },
  {
    id: "production-operations",
    area: "Operación de producción",
    status: "prepared",
    current:
      "Validación de configuración, health checks, cierre ordenado, documentación de despliegue y auditorías locales.",
    gap: "Servidor real, métricas, alertas, copias restauradas, alta disponibilidad y soporte operativo.",
    evidence: [
      "server/lib/production-config.ts",
      "server/index.ts",
      "DEPLOYMENT.md",
      "Security-Audit-Standard.md",
    ],
    marketReference:
      "La madurez comercial se demuestra con disponibilidad sostenida y operación, no solo con código compilable.",
    priority: "critical",
    destination: "/admin/resource-manager",
  },
];

export function getCapabilityRoadmap() {
  const summary = capabilities.reduce(
    (counts, capability) => {
      counts[capability.status] += 1;
      return counts;
    },
    { implemented: 0, partial: 0, prepared: 0, missing: 0 },
  );
  return {
    generatedAt: Date.now(),
    comparisonBasis:
      "Último diagnóstico de producto y revisión competitiva previa, contrastados con evidencia del repositorio actual.",
    caveat:
      "Las referencias de mercado son orientativas y deben volver a verificarse antes de tomar decisiones comerciales.",
    summary,
    capabilities,
  };
}
