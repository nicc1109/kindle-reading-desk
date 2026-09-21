import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export async function verifyReleaseArtifacts(directory = path.resolve("release")) {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const manifestPath = path.join(directory, "latest.yml");
  const manifest = YAML.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.version, packageJson.version, "latest.yml version must match package.json");
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, "latest.yml must list at least one installer");
  assert.equal(manifest.path, manifest.files[0].url, "legacy and current updater paths must agree");

  for (const entry of manifest.files) {
    assert.match(entry.url, new RegExp(`^Reading-Desk-Setup-${packageJson.version.replace(/\./g, "\\.")}\\.exe$`));
    const installerPath = path.join(directory, entry.url);
    const installer = await readFile(installerPath);
    assert.equal((await stat(installerPath)).size, entry.size, `${entry.url} size must match latest.yml`);
    assert.equal(createHash("sha512").update(installer).digest("base64"), entry.sha512, `${entry.url} hash must match latest.yml`);
    await stat(`${installerPath}.blockmap`);
  }
  return { version: manifest.version, files: manifest.files.map((entry) => entry.url) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyReleaseArtifacts(path.resolve(process.argv[2] || "release")), null, 2));
}
