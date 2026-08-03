import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, ".azure-package");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "scripts"), { recursive: true });
await cp(path.join(root, "dist"), path.join(output, "dist"), {
  recursive: true,
});
await cp(
  path.join(root, "scripts", "start-production.mjs"),
  path.join(output, "scripts", "start-production.mjs"),
);
await cp(path.join(root, "package.json"), path.join(output, "package.json"));
await cp(
  path.join(root, "package-lock.json"),
  path.join(output, "package-lock.json"),
);

console.log(`Azure package prepared at ${output}`);
