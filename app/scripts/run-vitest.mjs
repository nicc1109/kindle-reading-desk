import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tempDirectory = path.resolve(process.cwd(), ".test-tmp");
mkdirSync(tempDirectory, { recursive: true });

const environment = {
  ...process.env,
  TMPDIR: tempDirectory,
  TMP: tempDirectory,
  TEMP: tempDirectory,
};

const executable = path.resolve(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [executable, "run", "tests/parser.test.ts", "tests/vault.test.ts"], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
