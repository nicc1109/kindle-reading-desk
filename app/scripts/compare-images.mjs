import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2];
const implementationPath = process.argv[3];
const outputPath = path.resolve(process.argv[4] || "design-qa-comparison.png");
if (!sourcePath || !implementationPath) throw new Error("Usage: compare-images <source> <implementation> [output]");

const [source, implementation] = await Promise.all([readFile(sourcePath), readFile(implementationPath)]);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1480, height: 590 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  *{box-sizing:border-box}body{margin:0;background:#282521;color:#f8f4ec;font-family:Arial,sans-serif}
  main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}
  figure{margin:0;min-width:0}figcaption{height:28px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center}
  img{display:block;width:100%;height:512px;object-fit:fill;background:white;border:1px solid #6c665e}
</style></head><body><main>
  <figure><figcaption>Approved visual target</figcaption><img src="data:image/png;base64,${source.toString("base64")}"></figure>
  <figure><figcaption>Rendered implementation</figcaption><img src="data:image/png;base64,${implementation.toString("base64")}"></figure>
</main></body></html>`);
await page.screenshot({ path: outputPath, fullPage: false });
console.log(JSON.stringify({ sourcePath, implementationPath, outputPath }, null, 2));
await browser.close();
