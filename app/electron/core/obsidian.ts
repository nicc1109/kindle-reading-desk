import path from "node:path";

export function obsidianOpenUrl(vaultPath: string, notePath: string): string {
  const resolvedVault = path.resolve(vaultPath);
  const resolvedNote = path.resolve(notePath);
  const relative = path.relative(resolvedVault, resolvedNote);
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error("The book note is outside the selected Obsidian vault.");
  }
  const file = relative.replace(/\\/g, "/").replace(/\.md$/i, "");
  return `obsidian://open?${new URLSearchParams({ vault: path.basename(resolvedVault), file }).toString()}`;
}
