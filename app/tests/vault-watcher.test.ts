import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { watchVaultDirectories, type VaultFileEvent } from "../electron/core/vault-watcher";

const tempDirectories: string[] = [];

async function waitFor(predicate: () => boolean, timeout = 5_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for vault watcher event");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("vault directory watcher", () => {
  it("reports Markdown create, modify, rename, and delete events", async () => {
    const vaultPath = await mkdtemp(path.join(os.tmpdir(), "reading-desk-watcher-"));
    tempDirectories.push(vaultPath);
    const booksPath = path.join(vaultPath, "Books");
    const authorsPath = path.join(vaultPath, "Authors");
    await Promise.all([mkdir(booksPath), mkdir(authorsPath)]);
    const events: Array<{ event: VaultFileEvent; filePath: string }> = [];
    const watcher = await watchVaultDirectories(
      vaultPath,
      (event, filePath) => events.push({ event, filePath }),
      (error) => { throw error; },
    );

    try {
      const original = path.join(booksPath, "Original.md");
      const renamed = path.join(booksPath, "Renamed.md");
      await writeFile(original, "first", "utf8");
      await waitFor(() => events.some(({ event, filePath }) => event === "add" && filePath === original));
      await writeFile(original, "second", "utf8");
      await waitFor(() => events.some(({ event, filePath }) => event === "change" && filePath === original));
      await rename(original, renamed);
      await waitFor(() => events.some(({ event, filePath }) => event === "unlink" && filePath === original));
      await waitFor(() => events.some(({ event, filePath }) => event === "add" && filePath === renamed));
      await rm(renamed);
      await waitFor(() => events.some(({ event, filePath }) => event === "unlink" && filePath === renamed));

      const ignored = path.join(authorsPath, "ignored.txt");
      await writeFile(ignored, "not Markdown", "utf8");
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(events.some(({ filePath }) => filePath === ignored)).toBe(false);
    } finally {
      await watcher.close();
    }
  }, 15_000);
});
