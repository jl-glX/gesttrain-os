export const MAX_PASSWORD_BYTES = 72;

export function isPasswordWithinHashLimit(password: string): boolean {
  return new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES;
}
