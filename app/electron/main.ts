import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import electronUpdater from "electron-updater";
import type { FSWatcher } from "chokidar";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AppUpdateState, VaultWatchState } from "../shared/types.js";
import { VaultRepository } from "./core/vault.js";
import { watchVaultDirectories } from "./core/vault-watcher.js";
import { assertTrustedIpcEvent, requireBookPatch, requireClippingPatch, requireConflictResolution, requireString } from "./core/ipc-security.js";
import { authorizeGoogleDocs, parseGoogleOAuthClient } from "./core/google-oauth.js";
import { createHighlightsDocument } from "./core/google-docs.js";

const { autoUpdater } = electronUpdater;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let repository: VaultRepository | null = null;
let watcher: FSWatcher | null = null;
let watcherTimer: NodeJS.Timeout | null = null;
let vaultWatchState: VaultWatchState = { status: "stopped" };
let googleExportController: AbortController | null = null;
let trustedRendererUrl: string | null = null;

async function googleOAuthClient() {
  // Account tokens remain in the main process for one export and are never persisted.
  const configPath = process.env.READING_DESK_GOOGLE_OAUTH_CONFIG || path.join(app.getPath("userData"), "google-oauth-client.json");
  return parseGoogleOAuthClient(JSON.parse(await readFile(configPath, "utf8")));
}
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
  if (watcherTimer) clearTimeout(watcherTimer);
  watcherTimer = null;
  vaultWatchState = { status: "stopped" };
  if (!vaultPath) { repository = null; return; }
  const nextRepository = new VaultRepository(vaultPath);
  repository = nextRepository;
  await nextRepository.initialize();
  const onWatcherError = (error: Error) => {
    if (repository !== nextRepository) return;
    vaultWatchState = { status: "error", message: `Vault watcher stopped reporting reliably: ${error.message}` };
    mainWindow?.webContents.send("vault:changed");
  };
  try {
    watcher = await watchVaultDirectories(vaultPath, () => {
      if (repository !== nextRepository) return;
      nextRepository.invalidate();
      vaultWatchState = { status: "watching" };
      if (watcherTimer) clearTimeout(watcherTimer);
      watcherTimer = setTimeout(() => mainWindow?.webContents.send("vault:changed"), 350);
    }, onWatcherError);
    vaultWatchState = { status: "watching" };
  } catch (error) {
    onWatcherError(error instanceof Error ? error : new Error("Unknown watcher error"));
  }
}

async function snapshot() {
  if (!repository) return { vaultPath: null, books: [], authors: [], imports: [], vaultWatch: vaultWatchState };
  return { ...await repository.snapshot(), vaultWatch: vaultWatchState };
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
  const handle = (channel: string, handler: (...args: any[]) => any) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedIpcEvent(event, mainWindow?.webContents, mainWindow?.webContents.mainFrame, trustedRendererUrl);
      return handler(...args);
    });
  };
  handle("google-docs:availability", async () => {
    try {
      await googleOAuthClient();
      return { available: true, message: "Sign in to Google to create a new document. Only this book's highlights will be sent." };
    } catch {
      return { available: false, message: "Google Docs export is not configured in this installation yet. You can preview the document below." };
    }
  });
  handle("google-docs:export", async (bookId: unknown) => {
    const validatedBookId = requireString(bookId, "book ID");
    if (googleExportController) throw new Error("Another Google Docs export is in progress.");
    const controller = new AbortController();
    googleExportController = controller;
    try {
      const client = await googleOAuthClient();
      const vault = requireRepository();
      vault.invalidate();
      const book = await vault.getBook(validatedBookId);
      if (!book) throw new Error("Book not found.");
      if (!book.clippings.some((clip) => clip.type === "highlight")) throw new Error("This book has no highlights to export.");
      const token = await authorizeGoogleDocs(client, (url) => shell.openExternal(url), controller.signal);
      return await createHighlightsDocument(book, token, controller.signal);
    } finally { googleExportController = null; }
  });
  handle("google-docs:cancel", () => { googleExportController?.abort(); });
  handle("app:snapshot", snapshot);
  handle("app:update:get-state", () => updateState);
  handle("app:update:check", checkForUpdates);
  handle("app:update:download", downloadUpdate);
  handle("app:update:install", () => {
    if (!updaterIsSupported() || updateState.stage !== "downloaded") return false;
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 100);
    return true;
  });
  handle("app:get-book", (bookId: unknown) => requireRepository().getBook(requireString(bookId, "book ID")));
  handle("vault:select", async () => {
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
  handle("import:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Import Kindle clippings",
      properties: ["openFile"],
      filters: [{ name: "Kindle clippings", extensions: ["txt"] }],
      buttonLabel: "Preview import",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return requireRepository().previewImport(result.filePaths[0]);
  });
  handle("import:preview-path", (filePath: unknown) => requireRepository().previewImport(requireString(filePath, "import path", 32_768)));
  handle("import:set-resolution", (token: unknown, identityKey: unknown, resolution: unknown) =>
    requireRepository().setConflictResolution(requireString(token, "import token"), requireString(identityKey, "conflict identity"), requireConflictResolution(resolution)));
  handle("import:commit", async (token: unknown) => {
    const result = await requireRepository().commitImport(requireString(token, "import token"));
    mainWindow?.webContents.send("vault:changed");
    return result;
  });
  handle("book:update", (bookId: unknown, patch: unknown) => requireRepository().updateBook(requireString(bookId, "book ID"), requireBookPatch(patch)));
  handle("clipping:update", (bookId: unknown, clippingId: unknown, patch: unknown) =>
    requireRepository().updateClipping(requireString(bookId, "book ID"), requireString(clippingId, "clipping ID"), requireClippingPatch(patch)));
  handle("book:merge", (sourceBookId: unknown, targetBookId: unknown) =>
    requireRepository().mergeBooks(requireString(sourceBookId, "source book ID"), requireString(targetBookId, "target book ID")));
  handle("author:merge", (sourceName: unknown, targetName: unknown) =>
    requireRepository().mergeAuthors(requireString(sourceName, "source author"), requireString(targetName, "target author")));
  handle("book:open-obsidian", async (bookId: unknown) => {
    const book = await requireRepository().getBook(requireString(bookId, "book ID"));
    if (!book?.vaultPath) return false;
    try {
      await shell.openExternal(`obsidian://open?path=${encodeURIComponent(book.vaultPath)}`);
      return true;
    } catch {
      shell.showItemInFolder(book.vaultPath);
      return false;
    }
  });
  handle("book:show-folder", async (bookId: unknown) => {
    const book = await requireRepository().getBook(requireString(bookId, "book ID"));
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
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== trustedRendererUrl) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (url !== trustedRendererUrl) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { googleExportController?.abort(); });
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererFile = path.resolve(currentDirectory, "../../dist/client/index.html");
  trustedRendererUrl = developmentUrl || pathToFileURL(rendererFile).href;
  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(rendererFile);
  trustedRendererUrl = mainWindow.webContents.getURL();
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
