import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

const output = path.resolve(process.argv[2] || "design-qa-implementation.png");
const target = process.env.READING_DESK_QA_URL || pathToFileURL(path.resolve("dist/client/index.html")).href;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const interactionChecks = [];
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
await page.locator(".book-actions").getByRole("button", { name: "Hide books list" }).click();
interactionChecks.push(["books list hides independently", await page.locator(".library-panel").count() === 0]);
await page.locator(".book-actions").getByRole("button", { name: "Show books list" }).click();
interactionChecks.push(["books list restores independently", await page.locator(".library-panel").isVisible()]);
await page.locator(".book-actions").getByRole("button", { name: "Hide main menu" }).click();
interactionChecks.push(["main menu hides independently", await page.locator(".sidebar").count() === 0]);
await page.locator(".book-actions").getByRole("button", { name: "Show main menu" }).click();
interactionChecks.push(["main menu restores independently", await page.locator(".sidebar").isVisible()]);
await page.getByRole("button", { name: "Open full-page book view" }).click();
interactionChecks.push(["full-page book view hides both menus", await page.locator(".sidebar, .library-panel").count() === 0]);
await page.getByRole("button", { name: "Exit full-page book view" }).click();
interactionChecks.push(["full-page book view is optional", await page.locator(".sidebar").isVisible() && await page.locator(".library-panel").isVisible()]);
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
await page.getByRole("button", { name: /Add 76 new clippings/ }).click();
interactionChecks.push(["import commit completed", await page.getByText(/76 new clippings added/).isVisible()]);
await page.getByRole("button", { name: "Library" }).click();
await page.getByRole("button", { name: /Open in Obsidian/ }).click();
interactionChecks.push(["open in Obsidian action available", await page.getByRole("button", { name: /Open in Obsidian/ }).isVisible()]);
await page.getByRole("button", { name: "Book reflection" }).click();
interactionChecks.push(["book reflection rendered", await page.getByRole("heading", { name: "What stayed with you?" }).isVisible()]);
await page.getByRole("button", { name: "Highlights" }).click();
interactionChecks.push(["highlight reflection rendered", await page.getByRole("heading", { name: "Your reflection" }).isVisible()]);
const reflection = page.getByLabel("Highlight reflection");
await reflection.fill("A QA reflection saved from the reading workspace.");
await reflection.blur();
interactionChecks.push(["highlight reflection edited", await reflection.inputValue() === "A QA reflection saved from the reading workspace."]);
await page.getByRole("button", { name: "Settings" }).click();
interactionChecks.push(["settings view rendered", await page.getByRole("heading", { name: "Your reading desk, kept local" }).isVisible()]);
interactionChecks.push(["release version rendered", await page.getByText("0.2.0", { exact: true }).isVisible()]);
await page.getByRole("button", { name: "Help" }).click();
interactionChecks.push(["help view rendered", await page.getByRole("heading", { name: "From Kindle export to reading notes" }).isVisible()]);

await page.screenshot({ path: output, fullPage: false });
for (const width of [1180, 980]) {
  await page.setViewportSize({ width, height: 800 });
  await page.waitForTimeout(150);
  interactionChecks.push([`${width}px desktop layout has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)]);
}
console.log(JSON.stringify({ output, target, interactionChecks, consoleErrors }, null, 2));
await browser.close();
