import assert from "node:assert/strict";
import { chromium, _electron as electron } from "playwright";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { VaultRepository } from "../dist-electron/electron/core/vault.js";

const testRoot = path.resolve(".test-tmp");
await mkdir(testRoot, { recursive: true });
const root = await mkdtemp(path.join(testRoot, "google-docs-qa-"));
assert.ok(path.resolve(root).startsWith(`${testRoot}${path.sep}`));
const checks = [];
const errors = [];
let browser, desktop;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.READING_DESK_BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.READING_DESK_QA_URL || "http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Export to Google Docs", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export to Google Docs" });
  await dialog.waitFor();
  assert.ok(await dialog.getByRole("button", { name: "Sign in & create document" }).isDisabled());
  assert.ok(await dialog.getByText(/Document preview only/).isVisible());
  assert.ok(await dialog.locator(".export-highlight strong").count() > 0);
  assert.equal(await dialog.locator(".export-notes").first().evaluate((element) => getComputedStyle(element).fontWeight), "400");
  assert.ok(await dialog.locator(".export-highlight strong").first().evaluate((element) => Number(getComputedStyle(element).fontWeight) >= 600));
  checks.push("browser preview: full highlight text is bold, Notes paragraphs normal, real export unavailable");
  await page.screenshot({ path: "google-docs-qa-preview.png" });
  for (const width of [1180, 980]) {
    await page.setViewportSize({ width, height: 800 });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.ok(await dialog.getByRole("button", { name: "Close" }).isVisible());
    checks.push(`${width}px dialog fits desktop viewport`);
  }
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checks.push("Escape closes preview");

  const vaultPath = path.join(root, "Vault");
  const userData = path.join(root, "UserData");
  await mkdir(userData);
  await writeFile(path.join(userData, "settings.json"), JSON.stringify({ vaultPath }));
  const sample = path.join(root, "My Clippings.txt");
  await writeFile(sample, "Example (Test Author)\n- Your Highlight on page 1 | Location 1-2 | Added on Friday, October 13, 2023 04:15:54 PM\n\nA complete highlight for export.\n==========\n");
  const vault = new VaultRepository(vaultPath);
  await vault.commitImport((await vault.previewImport(sample)).token);
  const before = await readFile((await vault.scanBooks())[0].vaultPath, "utf8");
  desktop = await electron.launch({ args: [".", `--user-data-dir=${userData}`, "--disable-gpu"], env: { ...process.env, VITE_DEV_SERVER_URL: "", READING_DESK_GOOGLE_OAUTH_CONFIG: path.join(root, "not-configured.json") } });
  const window = await desktop.firstWindow();
  window.on("pageerror", (error) => errors.push(error.message));
  await window.getByRole("heading", { name: "Example", exact: true }).waitFor();
  const availability = await window.evaluate(() => window.readingDesk.getGoogleDocsAvailability());
  assert.equal(availability.available, false);
  assert.ok(await window.evaluate(() => typeof window.readingDesk.exportBookToGoogleDocs === "function" && typeof window.readingDesk.cancelGoogleDocsExport === "function"));
  await window.getByRole("button", { name: "Export to Google Docs", exact: true }).click();
  await window.getByRole("dialog").waitFor();
  assert.ok(await window.getByText(/Add a Google Desktop OAuth JSON/).isVisible());
  assert.equal((await window.locator(".export-highlight strong").innerText()).trimEnd(), "A complete highlight for export.");
  assert.equal(await readFile((await vault.scanBooks())[0].vaultPath, "utf8"), before);
  checks.push("fresh Electron build: preload IPC, unconfigured state, actual vault preview, no vault mutation");
  await window.screenshot({ path: "google-docs-qa-desktop.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, runtimeErrors: errors }, null, 2));
} finally {
  await desktop?.close();
  await browser?.close();
  assert.ok(path.resolve(root).startsWith(`${testRoot}${path.sep}`));
  await rm(root, { recursive: true, force: true });
}
