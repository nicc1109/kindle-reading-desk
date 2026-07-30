import { app, BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.DISPLAY) app.commandLine.appendSwitch("headless");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");

const output = path.resolve(process.argv[2] || "design-qa-implementation.png");
const target = process.env.READING_DESK_QA_URL || "http://127.0.0.1:4173";
const consoleErrors = [];
const interactionChecks = [];
const failSafe = setTimeout(() => {
  console.error("QA capture timed out before Electron became ready");
  app.exit(2);
}, 20000);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

console.log(`Starting QA capture at ${target} on ${process.env.DISPLAY || "headless"}`);
await app.whenReady();
console.log("Electron ready; creating renderer");
const window = new BrowserWindow({
  width: 1440,
  height: 1024,
  show: false,
  backgroundColor: "#f8f5ef",
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
});
window.webContents.on("console-message", (_event, level, message) => {
  if (level >= 2) consoleErrors.push(message);
});
await window.loadURL(target);
console.log("Renderer loaded");
await wait(1800);

async function clickText(text) {
  return window.webContents.executeJavaScript(`(() => {
    const element = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().includes(${JSON.stringify(text)}));
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

async function hasText(text) {
  return window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(text)})`);
}

interactionChecks.push(["library loaded", await hasText("Geopolitical Alpha")]);
interactionChecks.push(["author navigation click", await clickText("Authors")]);
await wait(250);
interactionChecks.push(["author view rendered", await hasText("Your authors")]);
interactionChecks.push(["import navigation click", await clickText("Imports")]);
await wait(250);
interactionChecks.push(["import view rendered", await hasText("Renew your vault")]);
interactionChecks.push(["library navigation click", await clickText("Library")]);
await wait(300);
interactionChecks.push(["book reflection tab click", await clickText("Book reflection")]);
await wait(200);
interactionChecks.push(["book reflection rendered", await hasText("What stayed with you?")]);
interactionChecks.push(["highlights tab click", await clickText("Highlights")]);
await wait(250);
interactionChecks.push(["highlight reflection rendered", await hasText("Your reflection")]);

const image = await window.webContents.capturePage();
await writeFile(output, image.toPNG());
console.log(JSON.stringify({ output, target, interactionChecks, consoleErrors }, null, 2));
clearTimeout(failSafe);
window.destroy();
app.quit();
