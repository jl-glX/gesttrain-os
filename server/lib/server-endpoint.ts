export function parseServerPort(value: string | number): number {
  const port = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid server port: ${String(value)}`);
  }

  return port;
}
