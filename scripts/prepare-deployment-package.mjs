import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, ".deployment-package");

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
await cp(path.join(root, ".env.example"), path.join(output, ".env.example"));
await cp(
  path.join(root, ".env.staging.example"),
  path.join(output, ".env.staging.example"),
);
await cp(
  path.join(root, ".env.production.example"),
  path.join(output, ".env.production.example"),
);

console.log(`Deployment package prepared at ${output}`);
