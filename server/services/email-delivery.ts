import nodemailer from "nodemailer";

type SupportedLocale = "es" | "en" | "de" | "de-CH";

export type EmailDeliveryConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  password?: string;
  from: string;
};

type VerificationMessage = {
  subject: string;
  text: string;
  html: string;
};

export class EmailDeliveryUnavailableError extends Error {
  readonly cause?: Error;

  constructor(cause?: Error) {
    super("Email delivery is unavailable");
    this.name = "EmailDeliveryUnavailableError";
    this.cause = cause;
  }
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let transporterFingerprint = "";

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function resolveEmailDeliveryConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): EmailDeliveryConfiguration | null {
  const host = environment.SMTP_HOST?.trim();
  const from = environment.EMAIL_FROM?.trim();
  const user = environment.SMTP_USER?.trim();
  const password = environment.SMTP_PASSWORD?.trim();
  const hasAnyConfiguration = Boolean(
    host ||
    from ||
    environment.SMTP_PORT ||
    environment.SMTP_SECURE ||
    environment.SMTP_REQUIRE_TLS ||
    user ||
    password,
  );

  if (!hasAnyConfiguration) return null;
  if (!host)
    throw new Error("SMTP_HOST is required when email delivery is configured");
  if (!from)
    throw new Error("EMAIL_FROM is required when email delivery is configured");
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }

  const port = parsePort(environment.SMTP_PORT);
  const secure = parseBoolean(
    environment.SMTP_SECURE,
    port === 465,
    "SMTP_SECURE",
  );
  const requireTls = parseBoolean(
    environment.SMTP_REQUIRE_TLS,
    !secure && !isLoopbackHost(host),
    "SMTP_REQUIRE_TLS",
  );
  if (!isLoopbackHost(host) && !secure && !requireTls) {
    throw new Error(
      "Remote SMTP connections must use implicit TLS or require STARTTLS",
    );
  }
  return {
    host,
    port,
    secure,
    requireTls,
    user: user || undefined,
    password: password || undefined,
    from,
  };
}

export function emailDeliveryIsConfigured(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveEmailDeliveryConfiguration(environment) !== null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function buildEmailVerificationMessage(
  name: string,
  code: string,
  locale: SupportedLocale,
): VerificationMessage {
  const messages: Record<
    SupportedLocale,
    { subject: string; greeting: string; instruction: string; expiry: string }
  > = {
    es: {
      subject: "Confirma tu correo en Umbravia Forge",
      greeting: `Hola, ${name}:`,
      instruction:
        "Usa este código para confirmar tu cuenta de Umbravia Forge:",
      expiry:
        "El código caduca en 15 minutos. Si no has creado esta cuenta, puedes ignorar este mensaje.",
    },
    en: {
      subject: "Confirm your Umbravia Forge email",
      greeting: `Hello, ${name}:`,
      instruction: "Use this code to confirm your Umbravia Forge account:",
      expiry:
        "The code expires in 15 minutes. If you did not create this account, you can ignore this message.",
    },
    de: {
      subject: "E-Mail für Umbravia Forge bestätigen",
      greeting: `Hallo, ${name}:`,
      instruction:
        "Verwenden Sie diesen Code, um Ihr Umbravia-Forge-Konto zu bestätigen:",
      expiry:
        "Der Code läuft in 15 Minuten ab. Wenn Sie dieses Konto nicht erstellt haben, können Sie diese Nachricht ignorieren.",
    },
    "de-CH": {
      subject: "E-Mail für Umbravia Forge bestätigen",
      greeting: `Hallo, ${name}:`,
      instruction:
        "Verwenden Sie diesen Code, um Ihr Umbravia-Forge-Konto zu bestätigen:",
      expiry:
        "Der Code läuft in 15 Minuten ab. Wenn Sie dieses Konto nicht erstellt haben, können Sie diese Nachricht ignorieren.",
    },
  };
  const message = messages[locale] ?? messages.es;
  return {
    subject: message.subject,
    text: `${message.greeting}\n\n${message.instruction}\n\n${code}\n\n${message.expiry}`,
    html: `<p>${escapeHtml(message.greeting)}</p><p>${escapeHtml(message.instruction)}</p><p style="font-size:28px;font-weight:700;letter-spacing:0.2em">${escapeHtml(code)}</p><p>${escapeHtml(message.expiry)}</p>`,
  };
}

function configuredTransport(configuration: EmailDeliveryConfiguration) {
  const fingerprint = JSON.stringify(configuration);
  if (transporter && fingerprint === transporterFingerprint) return transporter;
  transporterFingerprint = fingerprint;
  transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    requireTLS: configuration.requireTls,
    ignoreTLS: !configuration.secure && !configuration.requireTls,
    auth:
      configuration.user && configuration.password
        ? { user: configuration.user, pass: configuration.password }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export async function sendEmailVerificationCode(input: {
  email: string;
  name: string;
  code: string;
  locale: SupportedLocale;
}): Promise<{ delivered: boolean; messageId?: string }> {
  const configuration = resolveEmailDeliveryConfiguration();
  if (!configuration) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailDeliveryUnavailableError();
    }
    return { delivered: false };
  }

  const message = buildEmailVerificationMessage(
    input.name,
    input.code,
    input.locale,
  );
  try {
    const result = await configuredTransport(configuration).sendMail({
      from: configuration.from,
      to: input.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true, messageId: result.messageId };
  } catch (cause) {
    throw new EmailDeliveryUnavailableError(
      cause instanceof Error ? cause : undefined,
    );
  }
}

export function resetEmailTransportForTests(): void {
  transporter = null;
  transporterFingerprint = "";
}
