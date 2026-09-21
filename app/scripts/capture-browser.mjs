import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const output = path.resolve(process.argv[2] || "design-qa-implementation.png");
const target = process.env.READING_DESK_QA_URL || pathToFileURL(path.resolve("dist/client/index.html")).href;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch({
  headless: true,
  executablePath: executablePath || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const interactionChecks = [];
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto(target, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
try {
  await page.getByText("Geopolitical Alpha", { exact: true }).first().waitFor({ timeout: 8000 });
  const geopoliticalRow = page.getByRole("option").filter({ hasText: "Geopolitical Alpha" });
  if (await geopoliticalRow.count()) await geopoliticalRow.click();
  await page.getByRole("heading", { name: "Geopolitical Alpha" }).waitFor({ timeout: 8000 });
} catch (error) {
  await page.screenshot({ path: path.resolve("design-qa-debug.png"), fullPage: false });
  console.error(JSON.stringify({ title: await page.title(), body: (await page.locator("body").innerText()).slice(0, 1200), consoleErrors }, null, 2));
  throw error;
}

interactionChecks.push(["library loaded", await page.getByText("Geopolitical Alpha", { exact: true }).first().isVisible()]);
const selectedBookOption = page.getByRole("option", { name: /Geopolitical Alpha/ });
await selectedBookOption.focus();
await page.keyboard.press("ArrowDown");
interactionChecks.push(["book list arrow navigation moves focus", await page.locator('[role="option"]:focus').count() === 1 && !await selectedBookOption.evaluate((element) => element === document.activeElement)]);
await page.keyboard.press("ArrowUp");
interactionChecks.push(["book list arrow navigation wraps back", await selectedBookOption.evaluate((element) => element === document.activeElement)]);
const accessibilitySession = await page.context().newCDPSession(page);
const accessibilityTree = await accessibilitySession.send("Accessibility.getFullAXTree");
interactionChecks.push(["accessibility tree exposes the book list", accessibilityTree.nodes.some((node) => node.role?.value === "listbox" && node.name?.value === "Book library")]);
interactionChecks.push(["accessibility tree exposes named book options", accessibilityTree.nodes.some((node) => node.role?.value === "option" && String(node.name?.value || "").includes("Geopolitical Alpha"))]);
await accessibilitySession.detach();
await page.locator(".book-actions").getByRole("button", { name: "Hide books list" }).click();
interactionChecks.push(["books list hides independently", await page.locator(".library-panel").count() === 0]);
await page.locator(".book-actions").getByRole("button", { name: "Show books list" }).click();
interactionChecks.push(["books list restores independently", await page.locator(".library-panel").isVisible()]);
await page.locator(".book-actions").getByRole("button", { name: "Hide main menu" }).click();
interactionChecks.push(["main menu hides independently", await page.locator(".sidebar").count() === 0]);
await page.locator(".book-actions").getByRole("button", { name: "Show main menu" }).click();
interactionChecks.push(["main menu restores independently", await page.locator(".sidebar").isVisible()]);
interactionChecks.push(["removed full-page control stays absent", await page.getByRole("button", { name: /full-page book view/i }).count() === 0]);
await page.getByRole("button", { name: "Authors" }).click();
interactionChecks.push(["author view rendered", await page.getByRole("heading", { name: "Your authors" }).isVisible()]);
await page.getByRole("button", { name: "Imports" }).click();
interactionChecks.push(["import view rendered", await page.getByRole("heading", { name: "Renew your vault" }).isVisible()]);
await page.getByRole("button", { name: "Choose My Clippings.txt" }).click();
interactionChecks.push(["import preview rendered", await page.getByText("READY TO IMPORT").isVisible()]);
interactionChecks.push(["conflict defaults to skip", await page.getByRole("button", { name: "Skip", exact: true }).evaluate((button) => button.classList.contains("active"))]);
await page.getByRole("button", { name: "Add separately", exact: true }).click();
await page.waitForTimeout(250);
interactionChecks.push(["conflict can be added separately", await page.getByRole("button", { name: "Add separately", exact: true }).evaluate((button) => button.classList.contains("active"))]);
await page.getByRole("button", { name: /^Add \d+ new clippings$/ }).click();
interactionChecks.push(["import commit completed", await page.getByText(/new clippings added/).isVisible()]);
await page.getByRole("button", { name: "Library" }).click();
await page.getByRole("button", { name: /Open in Obsidian/ }).click();
interactionChecks.push(["open in Obsidian action available", await page.getByRole("button", { name: /Open in Obsidian/ }).isVisible()]);
const highlightsTab = page.getByRole("tab", { name: "Highlights" });
await highlightsTab.focus();
await page.keyboard.press("ArrowRight");
interactionChecks.push(["tab arrow navigation activates reflection", await page.getByRole("tab", { name: "Book reflection" }).getAttribute("aria-selected") === "true"]);
await page.getByRole("tab", { name: "Book reflection" }).click();
interactionChecks.push(["book reflection rendered", await page.getByRole("heading", { name: "Make the book useful." }).isVisible()]);
await page.getByRole("tab", { name: "Highlights" }).click();
await page.getByRole("button", { name: "Notes" }).click();
interactionChecks.push(["clipping notes editor rendered", await page.getByRole("textbox", { name: "Notes" }).isVisible()]);
const reflection = page.getByRole("textbox", { name: "Notes" });
await reflection.fill("A QA reflection saved from the reading workspace.");
await reflection.blur();
interactionChecks.push(["highlight reflection edited", await reflection.inputValue() === "A QA reflection saved from the reading workspace."]);
await page.getByRole("button", { name: "Settings" }).click();
interactionChecks.push(["settings view rendered", await page.getByRole("heading", { name: "Your reading desk, kept local" }).isVisible()]);
interactionChecks.push(["release version rendered", await page.getByText(packageJson.version, { exact: true }).isVisible()]);
await page.getByRole("button", { name: "Help" }).click();
interactionChecks.push(["help view rendered", await page.getByRole("heading", { name: "From Kindle export to reading notes" }).isVisible()]);

await page.screenshot({ path: output, fullPage: false });
for (const width of [1180, 980]) {
  await page.setViewportSize({ width, height: 800 });
  await page.waitForTimeout(150);
  interactionChecks.push([`${width}px desktop layout has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)]);
}
for (const [name, passed] of interactionChecks) assert.equal(passed, true, `Browser QA failed: ${name}`);
assert.deepEqual(consoleErrors, [], `Browser QA observed console errors:\n${consoleErrors.join("\n")}`);
console.log(JSON.stringify({ output, target, interactionChecks, consoleErrors }, null, 2));
await browser.close();
