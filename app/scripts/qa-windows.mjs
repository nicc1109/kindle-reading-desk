import { _electron as electron } from "playwright";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VaultRepository } from "../dist-electron/electron/core/vault.js";

const root = await mkdtemp(path.join(os.tmpdir(), "reading-desk-windows-qa-"));
const vaultPath = path.join(root, "QA Vault");
const userDataPath = path.join(root, "User Data");
const exportPath = path.join(root, "My Clippings.txt");
const output = path.resolve(process.env.READING_DESK_QA_OUTPUT || "windows-app-qa.png");
const executablePath = path.resolve(process.env.READING_DESK_QA_EXECUTABLE || path.join("release", "win-unpacked", "Reading Desk.exe"));
const checks = [];
const runtimeErrors = [];

const sample = [
  "Constraints (Jane Doe)",
  "- Your Highlight on page 5 | Location 50-51 | Added on Friday, October 13, 2023 04:15:54 PM",
  "",
  "Preferences are optional; constraints are not.",
  "==========",
  "Constraints (Jane Doe)",
  "- Your Note on page 8 | Location 80 | Added on Saturday, October 14, 2023 10:10:10 AM",
  "",
  "Use this distinction when reading institutions.",
  "==========",
].join("\r\n");

await writeFile(exportPath, sample, "utf8");
const repository = new VaultRepository(vaultPath);
const preview = await repository.previewImport(exportPath);
await repository.commitImport(preview.token);
await mkdir(userDataPath, { recursive: true });
await writeFile(path.join(userDataPath, "settings.json"), `${JSON.stringify({ vaultPath }, null, 2)}\n`, "utf8");

let app;
try {
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${userDataPath}`, "--disable-gpu"] });
  const window = await app.firstWindow();
  window.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  window.on("pageerror", (error) => runtimeErrors.push(error.message));
  await window.waitForLoadState("domcontentloaded");
  try {
    await window.getByRole("heading", { name: "Constraints" }).waitFor({ timeout: 15000 });
  } catch (error) {
    const debugOutput = path.resolve("windows-app-qa-debug.png");
    await window.screenshot({ path: debugOutput });
    console.error(JSON.stringify({ debugOutput, title: await window.title(), body: (await window.locator("body").innerText()).slice(0, 2000), runtimeErrors }, null, 2));
    throw error;
  }

  checks.push(["packaged executable launched", true]);
  checks.push(["secure preload bridge available", await window.evaluate(() => typeof window.readingDesk?.getSnapshot === "function")]);
  checks.push(["book workspace loaded from Markdown vault", await window.getByText("Preferences are optional; constraints are not.", { exact: true }).first().isVisible()]);

  await window.getByRole("button", { name: "Authors" }).click();
  checks.push(["author page lists imported book", await window.getByRole("button", { name: /Constraints/ }).isVisible()]);
  await window.getByRole("button", { name: "Reading insights" }).click();
  checks.push(["reading insights rendered", await window.getByRole("heading", { name: "A quiet view of your reading" }).isVisible()]);
  await window.getByRole("button", { name: "Settings" }).click();
  checks.push(["settings rendered", await window.getByRole("heading", { name: "Your reading desk, kept local" }).isVisible()]);
  checks.push(["release version rendered", await window.getByText("0.2.0", { exact: true }).isVisible()]);
  await window.getByRole("button", { name: "Help" }).click();
  checks.push(["help rendered", await window.getByRole("heading", { name: "From Kindle export to reading notes" }).isVisible()]);
  await window.getByRole("button", { name: "Library" }).click();

  const reflection = window.getByLabel("Highlight reflection");
  await reflection.fill("Saved through the packaged Windows app.");
  await reflection.blur();
  await window.waitForTimeout(500);
  checks.push(["reflection saved through Electron IPC", (await readFile((await repository.scanBooks())[0].vaultPath, "utf8")).includes("Saved through the packaged Windows app.")]);
  checks.push(["open in Obsidian action rendered", await window.getByRole("button", { name: /Open in Obsidian/ }).isVisible()]);

  await window.screenshot({ path: output });
  checks.push(["native Windows screenshot captured", true]);
  console.log(JSON.stringify({ executablePath, output, checks }, null, 2));
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
