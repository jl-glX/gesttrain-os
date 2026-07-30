import { randomBytes } from "node:crypto";

const SUPPORT_ID_PREFIX = "GT-U";
const SUPPORT_ID_BYTES = 6;

export function generateSupportId(): string {
  const value = randomBytes(SUPPORT_ID_BYTES).toString("hex").toUpperCase();
  return `${SUPPORT_ID_PREFIX}-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

export function isSupportId(value: string): boolean {
  return /^GT-U-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(value);
}
