import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const destination = path.resolve("dist-electron", "electron");
await mkdir(destination, { recursive: true });
await copyFile(path.resolve("electron", "preload.cjs"), path.join(destination, "preload.cjs"));
