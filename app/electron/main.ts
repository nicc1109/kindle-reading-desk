import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import chokidar, { type FSWatcher } from "chokidar";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppUpdateState, BookPatch, ClippingPatch } from "../shared/types.js";
import { VaultRepository } from "./core/vault.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let repository: VaultRepository | null = null;
let watcher: FSWatcher | null = null;
let watcherTimer: NodeJS.Timeout | null = null;
let updateState: AppUpdateState = {
  stage: "idle",
  currentVersion: app.getVersion(),
};

interface Settings {
  vaultPath?: string;
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSettings(): Promise<Settings> {
  try { return JSON.parse(await readFile(settingsPath(), "utf8")) as Settings; } catch { return {}; }
}

async function saveSettings(settings: Settings): Promise<void> {
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function setVault(vaultPath: string | undefined): Promise<void> {
  await watcher?.close();
  watcher = null;
  if (!vaultPath) { repository = null; return; }
  repository = new VaultRepository(vaultPath);
  await repository.initialize();
  watcher = chokidar.watch([
    path.join(vaultPath, "Books", "*.md"),
    path.join(vaultPath, "Authors", "*.md"),
  ], { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 } });
  watcher.on("all", () => {
    repository?.invalidate();
    if (watcherTimer) clearTimeout(watcherTimer);
    watcherTimer = setTimeout(() => mainWindow?.webContents.send("vault:changed"), 350);
  });
}

async function snapshot() {
  if (!repository) return { vaultPath: null, books: [], authors: [], imports: [] };
  return repository.snapshot();
}

function requireRepository(): VaultRepository {
  if (!repository) throw new Error("Choose an Obsidian vault before importing clippings");
  return repository;
}

function updaterIsSupported(): boolean {
  return app.isPackaged && process.platform === "win32";
}

function publishUpdateState(patch: Partial<AppUpdateState>): AppUpdateState {
  updateState = { ...updateState, ...patch, currentVersion: app.getVersion() };
  mainWindow?.webContents.send("app:update:state", updateState);
  return updateState;
}

function configureUpdater(): void {
  if (!updaterIsSupported()) {
    publishUpdateState({
      stage: "unsupported",
      message: "Update checks are available in the installed Windows app.",
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => publishUpdateState({ stage: "checking", message: undefined }));
  autoUpdater.on("update-available", (info) => publishUpdateState({
    stage: "available",
    availableVersion: info.version,
    progress: undefined,
    message: `Reading Desk ${info.version} is ready to download.`,
  }));
  autoUpdater.on("update-not-available", () => publishUpdateState({
    stage: "up-to-date",
    availableVersion: undefined,
    progress: undefined,
    message: "You are using the latest version.",
  }));
  autoUpdater.on("download-progress", (progress) => publishUpdateState({
    stage: "downloading",
    progress: Math.max(0, Math.min(100, Math.round(progress.percent))),
    message: "Downloading the update…",
  }));
  autoUpdater.on("update-downloaded", (info) => publishUpdateState({
    stage: "downloaded",
    availableVersion: info.version,
    progress: 100,
    message: "The update is ready. Restart Reading Desk to install it.",
  }));
  autoUpdater.on("error", (error) => publishUpdateState({
    stage: "error",
    progress: undefined,
    message: `Update check failed: ${error.message}`,
  }));
}

async function checkForUpdates(): Promise<AppUpdateState> {
  if (!updaterIsSupported()) return publishUpdateState({
    stage: "unsupported",
    message: "Update checks are available in the installed Windows app.",
  });
  if (["checking", "downloading", "downloaded"].includes(updateState.stage)) return updateState;
  publishUpdateState({ stage: "checking", message: undefined });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publishUpdateState({
      stage: "error",
      message: `Update check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
  return updateState;
}

async function downloadUpdate(): Promise<AppUpdateState> {
  if (!updaterIsSupported() || updateState.stage !== "available") return updateState;
  publishUpdateState({ stage: "downloading", progress: 0, message: "Starting download…" });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    publishUpdateState({
      stage: "error",
      progress: undefined,
      message: `Update download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
  return updateState;
}

function registerIpc(): void {
  ipcMain.handle("app:snapshot", snapshot);
  ipcMain.handle("app:update:get-state", () => updateState);
  ipcMain.handle("app:update:check", checkForUpdates);
  ipcMain.handle("app:update:download", downloadUpdate);
  ipcMain.handle("app:update:install", () => {
    if (!updaterIsSupported() || updateState.stage !== "downloaded") return false;
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 100);
    return true;
  });
  ipcMain.handle("app:get-book", (_event, bookId: string) => requireRepository().getBook(bookId));
  ipcMain.handle("vault:select", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Choose or create your Reading Desk vault",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
      buttonLabel: "Use as vault",
    });
    if (result.canceled || !result.filePaths[0]) return snapshot();
    await saveSettings({ vaultPath: result.filePaths[0] });
    await setVault(result.filePaths[0]);
    return snapshot();
  });
  ipcMain.handle("import:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Import Kindle clippings",
      properties: ["openFile"],
      filters: [{ name: "Kindle clippings", extensions: ["txt"] }],
      buttonLabel: "Preview import",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return requireRepository().previewImport(result.filePaths[0]);
  });
  ipcMain.handle("import:preview-path", (_event, filePath: string) => requireRepository().previewImport(filePath));
  ipcMain.handle("import:set-resolution", (_event, token: string, identityKey: string, resolution: "skip" | "add-separately") =>
    requireRepository().setConflictResolution(token, identityKey, resolution));
  ipcMain.handle("import:commit", async (_event, token: string) => {
    const result = await requireRepository().commitImport(token);
    mainWindow?.webContents.send("vault:changed");
    return result;
  });
  ipcMain.handle("book:update", (_event, bookId: string, patch: BookPatch) => requireRepository().updateBook(bookId, patch));
  ipcMain.handle("clipping:update", (_event, bookId: string, clippingId: string, patch: ClippingPatch) =>
    requireRepository().updateClipping(bookId, clippingId, patch));
  ipcMain.handle("book:merge", (_event, sourceBookId: string, targetBookId: string) =>
    requireRepository().mergeBooks(sourceBookId, targetBookId));
  ipcMain.handle("author:merge", (_event, sourceName: string, targetName: string) =>
    requireRepository().mergeAuthors(sourceName, targetName));
  ipcMain.handle("book:open-obsidian", async (_event, bookId: string) => {
    const book = await requireRepository().getBook(bookId);
    if (!book?.vaultPath) return false;
    try {
      await shell.openExternal(`obsidian://open?path=${encodeURIComponent(book.vaultPath)}`);
      return true;
    } catch {
      shell.showItemInFolder(book.vaultPath);
      return false;
    }
  });
  ipcMain.handle("book:show-folder", async (_event, bookId: string) => {
    const book = await requireRepository().getBook(bookId);
    if (!book?.vaultPath) return false;
    shell.showItemInFolder(book.vaultPath);
    return true;
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f7f3ec",
    title: "Reading Desk",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("obsidian://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(path.resolve(currentDirectory, "../../dist/client/index.html"));
}

app.whenReady().then(async () => {
  app.setName("Reading Desk");
  updateState = { stage: "idle", currentVersion: app.getVersion() };
  configureUpdater();
  registerIpc();
  const settings = await readSettings();
  if (settings.vaultPath) await setVault(settings.vaultPath);
  await createWindow();
  if (updaterIsSupported()) setTimeout(() => { void checkForUpdates(); }, 5000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { void watcher?.close(); });
