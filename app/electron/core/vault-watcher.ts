import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";

export type VaultFileEvent = "add" | "change" | "unlink";

export function isVaultMarkdownFile(filePath: string): boolean {
  return path.extname(filePath).toLocaleLowerCase("en") === ".md";
}

export async function watchVaultDirectories(
  vaultPath: string,
  onChange: (event: VaultFileEvent, filePath: string) => void,
  onError: (error: Error) => void,
): Promise<FSWatcher> {
  const watcher = chokidar.watch([
    path.join(vaultPath, "Books"),
    path.join(vaultPath, "Authors"),
  ], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
  });

  watcher.on("all", (event, filePath) => {
    if ((event === "add" || event === "change" || event === "unlink") && isVaultMarkdownFile(filePath)) {
      onChange(event, filePath);
    }
  });
  watcher.on("error", (error) => onError(error instanceof Error ? error : new Error(String(error))));

  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      watcher.off("error", reject);
      resolve();
    };
    watcher.once("ready", ready);
    watcher.once("error", reject);
  });
  return watcher;
}
