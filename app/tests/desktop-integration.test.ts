import path from "node:path";
import { describe, expect, it } from "vitest";
import { obsidianOpenUrl } from "../electron/core/obsidian";
import { reduceUpdaterState } from "../electron/core/updater-state";

describe("desktop integrations", () => {
  it("opens the exact vault-relative Markdown file in Obsidian", () => {
    const vault = path.resolve("C:/Users/Reader/My Vault");
    const url = new URL(obsidianOpenUrl(vault, path.join(vault, "Books", "A # Book.md")));
    expect(url.protocol).toBe("obsidian:");
    expect(url.searchParams.get("vault")).toBe("My Vault");
    expect(url.searchParams.get("file")).toBe("Books/A # Book");
    expect(() => obsidianOpenUrl(vault, path.resolve(vault, "..", "Other", "book.md"))).toThrow("outside");
  });

  it("models updater discovery, bounded progress, download completion, and errors", () => {
    const idle = { stage: "idle" as const, currentVersion: "0.3.0" };
    const available = reduceUpdaterState(idle, "0.3.0", { type: "available", version: "0.3.1" });
    expect(available).toMatchObject({ stage: "available", currentVersion: "0.3.0", availableVersion: "0.3.1" });
    expect(reduceUpdaterState(available, "0.3.0", { type: "downloading", percent: 140 })).toMatchObject({ stage: "downloading", progress: 100 });
    expect(reduceUpdaterState(available, "0.3.0", { type: "downloaded", version: "0.3.1" })).toMatchObject({ stage: "downloaded", progress: 100 });
    expect(reduceUpdaterState(available, "0.3.0", { type: "error", message: "offline" }).message).toContain("offline");
    expect(reduceUpdaterState(available, "0.3.0", { type: "up-to-date" }).availableVersion).toBeUndefined();
  });
});
