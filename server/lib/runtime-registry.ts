import { access, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

interface DevelopmentLease {
  kind: "gesttrain-development-instance";
  pid: number;
  cwd: string;
  createdAt: number;
}

function runtimeDirectory(): string {
  const dataDirectory =
    process.env.DATA_DIRECTORY ?? path.join(process.cwd(), "data");
  return path.join(dataDirectory, "runtime");
}

function leasePath(): string {
  return path.join(runtimeDirectory(), "development-instance.json");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLease(): Promise<DevelopmentLease | null> {
  try {
    const value = JSON.parse(
      await readFile(leasePath(), "utf8"),
    ) as Partial<DevelopmentLease>;
    return value.kind === "gesttrain-development-instance" &&
      typeof value.pid === "number" &&
      typeof value.cwd === "string" &&
      typeof value.createdAt === "number"
      ? (value as DevelopmentLease)
      : null;
  } catch {
    return null;
  }
}

export async function cleanupStaleRuntimeRecords(): Promise<number> {
  try {
    await access(leasePath());
  } catch {
    return 0;
  }
  const lease = await readLease();
  if (lease && isProcessAlive(lease.pid)) return 0;
  await unlink(leasePath()).catch(() => undefined);
  return 1;
}

export async function acquireDevelopmentLease(): Promise<void> {
  await mkdir(runtimeDirectory(), { recursive: true });
  const lease: DevelopmentLease = {
    kind: "gesttrain-development-instance",
    pid: process.pid,
    cwd: process.cwd(),
    createdAt: Date.now(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const file = await open(leasePath(), "wx");
      await file.writeFile(`${JSON.stringify(lease, null, 2)}\n`);
      await file.close();
      return;
    } catch (error) {
      let existing = await readLease();
      if (!existing) {
        await delay(50);
        existing = await readLease();
      }
      if (existing && isProcessAlive(existing.pid)) {
        throw Object.assign(
          new Error(
            `GestTrain/OS development servers are already active (PID ${existing.pid}). Stop that instance before starting another one.`,
          ),
          { cause: error },
        );
      }
      await unlink(leasePath()).catch(() => undefined);
    }
  }
  throw new Error("Could not acquire the GestTrain/OS development lease");
}

export async function releaseDevelopmentLease(): Promise<void> {
  const lease = await readLease();
  if (lease?.pid === process.pid) {
    await unlink(leasePath()).catch(() => undefined);
  }
}
