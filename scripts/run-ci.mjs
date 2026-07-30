import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const protectedFiles = ["package.json", "package-lock.json"];

async function digest(file) {
  const contents = await readFile(file);
  return createHash("sha256").update(contents).digest("hex");
}

async function snapshot() {
  return new Map(
    await Promise.all(
      protectedFiles.map(async (file) => [file, await digest(file)]),
    ),
  );
}

function runNpm(args) {
  const environment = { ...process.env };
  const npmEntryPoint = process.env.npm_execpath;

  // `npm run CI --force` must not weaken the clean install or validation steps.
  delete environment.npm_config_force;
  delete environment.NPM_CONFIG_FORCE;

  const command = npmEntryPoint
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const commandArguments = npmEntryPoint ? [npmEntryPoint, ...args] : args;

  const result = spawnSync(command, commandArguments, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const before = await snapshot();

// Dependency auditing runs after the complete validation suite. Disabling the
// duplicate install-time audit keeps clean installs deterministic and avoids a
// second registry request before tests have even started.
runNpm([
  "ci",
  "--ignore-scripts=false",
  "--audit=false",
  "--fund=false",
  "--prefer-offline",
]);
runNpm(["run", "ci:validate"]);

const after = await snapshot();
for (const file of protectedFiles) {
  if (before.get(file) !== after.get(file)) {
    throw new Error(
      `${file} cambió durante la validación. Restaura el archivo y revisa la actualización antes de continuar.`,
    );
  }
}

console.log(
  "CI local completada: instalación reproducible, controles y auditoría superados.",
);
