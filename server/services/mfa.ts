import fs from "node:fs";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { db } from "../db/client.js";
import { recordSecurityEvent } from "./security-events.js";

const ISSUER = "GestTrain/OS";
const RECOVERY_CODE_COUNT = 10;

function encryptionKey(): Buffer {
  const configuredKey = process.env.MFA_ENCRYPTION_KEY;
  if (configuredKey) {
    const key = Buffer.from(configuredKey, "base64");
    if (key.length !== 32) {
      throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes encoded as base64");
    }
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MFA_ENCRYPTION_KEY is required in production");
  }

  const dataDirectory =
    process.env.DATA_DIRECTORY ?? path.join(process.cwd(), "data");
  const keyPath = path.join(dataDirectory, "mfa-encryption.key");
  fs.mkdirSync(dataDirectory, { recursive: true });

  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, randomBytes(32).toString("base64"), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  const key = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
  if (key.length !== 32) {
    throw new Error("The local MFA encryption key is invalid");
  }
  return key;
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted MFA secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function totp(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function normaliseCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function recoveryCodeHash(code: string): string {
  return createHmac("sha256", encryptionKey())
    .update(normaliseCode(code))
    .digest("hex");
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(6).toString("hex").toUpperCase();
    return `${value.slice(0, 6)}-${value.slice(6)}`;
  });
}

export async function mfaStatus(userId: string) {
  const credential = await db
    .selectFrom("mfaCredentials")
    .select(["enabledAt", "recoveryCodeHashes"])
    .where("userId", "=", userId)
    .executeTakeFirst();

  return {
    enabled: credential?.enabledAt != null,
    enabledAt: credential?.enabledAt ?? null,
    recoveryCodesRemaining: credential
      ? (JSON.parse(credential.recoveryCodeHashes) as string[]).length
      : 0,
  };
}

export async function beginMfaSetup(userId: string, email: string) {
  const existing = await db
    .selectFrom("mfaCredentials")
    .select("enabledAt")
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (existing?.enabledAt != null) {
    throw new Error("MFA is already enabled");
  }

  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const now = Date.now();

  await db
    .insertInto("mfaCredentials")
    .values({
      userId,
      secretEncrypted: encryptSecret(secret),
      recoveryCodeHashes: "[]",
      createdAt: now,
      updatedAt: now,
      enabledAt: null,
    })
    .onConflict((conflict) =>
      conflict.column("userId").doUpdateSet({
        secretEncrypted: encryptSecret(secret),
        recoveryCodeHashes: "[]",
        updatedAt: now,
        enabledAt: null,
      }),
    )
    .execute();

  const uri = totp(secret, email).toString();
  return {
    secret,
    uri,
    qrCodeDataUrl: await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    }),
  };
}

export async function enableMfa(
  userId: string,
  email: string,
  code: string,
): Promise<string[]> {
  const credential = await db
    .selectFrom("mfaCredentials")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (!credential || credential.enabledAt != null) {
    throw new Error("MFA setup has not been started");
  }

  const secret = decryptSecret(credential.secretEncrypted);
  if (
    totp(secret, email).validate({ token: normaliseCode(code), window: 1 }) ===
    null
  ) {
    throw new Error("Invalid verification code");
  }

  const recoveryCodes = createRecoveryCodes();
  const now = Date.now();
  await db
    .updateTable("mfaCredentials")
    .set({
      recoveryCodeHashes: JSON.stringify(recoveryCodes.map(recoveryCodeHash)),
      enabledAt: now,
      updatedAt: now,
    })
    .where("userId", "=", userId)
    .execute();
  await recordSecurityEvent("mfa_enabled", userId);
  return recoveryCodes;
}

export async function verifyMfaCode(
  userId: string,
  email: string,
  code: string,
): Promise<{ valid: boolean; usedRecoveryCode: boolean }> {
  const credential = await db
    .selectFrom("mfaCredentials")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (!credential?.enabledAt) return { valid: false, usedRecoveryCode: false };

  const normalised = normaliseCode(code);
  const secret = decryptSecret(credential.secretEncrypted);
  if (totp(secret, email).validate({ token: normalised, window: 1 }) !== null) {
    return { valid: true, usedRecoveryCode: false };
  }

  const hashes = JSON.parse(credential.recoveryCodeHashes) as string[];
  const candidateHash = recoveryCodeHash(normalised);
  const index = hashes.findIndex((hash) => safeHashEquals(hash, candidateHash));
  if (index === -1) return { valid: false, usedRecoveryCode: false };

  hashes.splice(index, 1);
  await db
    .updateTable("mfaCredentials")
    .set({ recoveryCodeHashes: JSON.stringify(hashes), updatedAt: Date.now() })
    .where("userId", "=", userId)
    .execute();
  return { valid: true, usedRecoveryCode: true };
}

export async function regenerateRecoveryCodes(
  userId: string,
): Promise<string[]> {
  const recoveryCodes = createRecoveryCodes();
  await db
    .updateTable("mfaCredentials")
    .set({
      recoveryCodeHashes: JSON.stringify(recoveryCodes.map(recoveryCodeHash)),
      updatedAt: Date.now(),
    })
    .where("userId", "=", userId)
    .where("enabledAt", "is not", null)
    .executeTakeFirstOrThrow();
  await recordSecurityEvent("recovery_codes_regenerated", userId);
  return recoveryCodes;
}

export async function disableMfa(userId: string): Promise<void> {
  await db.deleteFrom("mfaCredentials").where("userId", "=", userId).execute();
  await recordSecurityEvent("mfa_disabled", userId);
}
