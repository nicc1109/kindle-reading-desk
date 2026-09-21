import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizedKey, shortHash } from "../electron/core/parser";
import { parseBookMarkdown, VaultRepository } from "../electron/core/vault";

const tempDirectories: string[] = [];

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reading-desk-test-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const firstExport = [
  "Constraints (Jane Doe)",
  "- Your Highlight on page 10 | Location 100-101 | Added on Friday, October 13, 2023 04:15:54 PM",
  "",
  "Preferences are optional; constraints are not.",
  "==========",
  "Constraints (Jane Doe)",
  "- Your Note on page 10 | Location 102 | Added on Friday, October 13, 2023 04:16:54 PM",
  "",
  "Apply this to institutions.",
  "==========",
].join("\n");

describe("Markdown vault repository", () => {
  it("migrates legacy source keys without discarding their original identity", () => {
    const legacy = [
      "---",
      "reading_desk_version: 2",
      "kindle_id: book-legacy",
      "title: 東京の本",
      "authors:",
      "  - 山田 太郎",
      "aliases:",
      "  - 東京の本 (山田 太郎)",
      "source_keys:",
      "  - book-source-legacy-ascii-key",
      "---",
      "",
      "# 東京の本",
    ].join("\n");

    const migrated = parseBookMarkdown(legacy);

    expect(migrated.sourceKeys).toContain("book-source-legacy-ascii-key");
    expect(migrated.sourceKeys).toContain(`book-source-${shortHash(normalizedKey("東京の本 (山田 太郎)"))}`);
  });

  it("imports incrementally and preserves user-authored Markdown", async () => {
    const root = await tempDirectory();
    const vaultPath = path.join(root, "vault");
    const exportPath = path.join(root, "My Clippings.txt");
    await writeFile(exportPath, firstExport, "utf8");
    const repository = new VaultRepository(vaultPath);

    const firstPreview = await repository.previewImport(exportPath);
    expect(firstPreview).toMatchObject({ total: 2, newCount: 2, duplicateCount: 0, newBookCount: 1 });
    const firstCommit = await repository.commitImport(firstPreview.token);
    expect(firstCommit.imported).toBe(2);

    const book = (await repository.scanBooks())[0];
    expect(book.clippings).toHaveLength(2);
    const originalMarkdown = await readFile(book.vaultPath!, "utf8");
    expect(originalMarkdown).toContain("# Constraints\n\n*by [[Authors/Jane Doe|Jane Doe]]*");
    expect(originalMarkdown).toContain("### Highlight — Page 10 · Location 100–101");
    expect(originalMarkdown).not.toContain("**My reflection**");
    expect(originalMarkdown).not.toContain("#### My note");
    await writeFile(book.vaultPath!, `${originalMarkdown.replace("reading_desk_version: 4", "reading_desk_version: 4\nmy_custom_frontmatter: keep-me")}\n## My independent section\nDo not change this.\n`, "utf8");
    await repository.updateBook(book.id, { reflection: "The whole-book reflection." });
    await repository.updateClipping(book.id, book.clippings[0].id, { reflection: "A clipping reflection.", favorite: true });

    const secondPreview = await repository.previewImport(exportPath);
    expect(secondPreview).toMatchObject({ newCount: 0, duplicateCount: 2 });
    await repository.commitImport(secondPreview.token);
    const afterDuplicate = await readFile(book.vaultPath!, "utf8");
    expect(afterDuplicate).toContain("Do not change this.");
    expect(afterDuplicate).toContain("my_custom_frontmatter: keep-me");
    expect(afterDuplicate).toContain("The whole-book reflection.");
    expect(afterDuplicate).toContain("A clipping reflection.");
    expect(afterDuplicate).toContain("#### My note");

    const preservedBlock = afterDuplicate.match(/<!-- reading-desk:clipping:start id="[^"]+"[\s\S]*?<!-- reading-desk:clipping:end id="[^"]+" -->/)?.[0];
    const added = `${firstExport}\nConstraints (Jane Doe)\n- Your Highlight on page 5 | Location 50-51 | Added on Saturday, October 14, 2023 04:15:54 PM\n\nA genuinely new clipping.\n==========\n`;
    await writeFile(exportPath, added, "utf8");
    const thirdPreview = await repository.previewImport(exportPath);
    expect(thirdPreview).toMatchObject({ newCount: 1, duplicateCount: 2 });
    await repository.commitImport(thirdPreview.token);
    expect((await repository.scanBooks())[0].clippings).toHaveLength(3);
    const afterAddition = await readFile(book.vaultPath!, "utf8");
    expect(afterAddition).toContain("Do not change this.");
    expect(afterAddition).toContain("my_custom_frontmatter: keep-me");
    expect(afterAddition.indexOf("A genuinely new clipping.")).toBeLessThan(afterAddition.indexOf("Preferences are optional"));
    expect(afterAddition).toContain(preservedBlock);

    await repository.updateBook(book.id, { title: "Constraints, Corrected", authors: ["Jane Doe"] });
    const corrected = await readFile(book.vaultPath!, "utf8");
    expect(corrected).toContain("# Constraints, Corrected");
    expect(corrected).toContain("my_custom_frontmatter: keep-me");
  });

  it("builds one author page containing every book by that author", async () => {
    const root = await tempDirectory();
    const exportPath = path.join(root, "My Clippings.txt");
    await writeFile(exportPath, `${firstExport}\nA Second Book (Jane Doe)\n- Your Highlight on page 2 | Location 5 | Added on Sunday, October 15, 2023 04:15:54 PM\n\nSecond book passage.\n==========\n`, "utf8");
    const repository = new VaultRepository(path.join(root, "vault"));
    const preview = await repository.previewImport(exportPath);
    await repository.commitImport(preview.token);
    const snapshot = await repository.snapshot();
    const jane = snapshot.authors.find((author) => author.name === "Jane Doe");
    expect(jane?.books).toHaveLength(2);
    expect(snapshot.books.map((book) => book.title)).toEqual(["A Second Book", "Constraints"]);
  });

  it("holds content collisions for review and never overwrites the existing clipping", async () => {
    const root = await tempDirectory();
    const exportPath = path.join(root, "My Clippings.txt");
    await writeFile(exportPath, firstExport, "utf8");
    const repository = new VaultRepository(path.join(root, "vault"));
    const initial = await repository.previewImport(exportPath);
    await repository.commitImport(initial.token);

    const changed = firstExport.replace("Preferences are optional; constraints are not.", "Changed text with the same Kindle identity.");
    await writeFile(exportPath, changed, "utf8");
    const review = await repository.previewImport(exportPath);
    expect(review.conflicts).toHaveLength(1);
    expect(review.conflicts[0].resolution).toBe("skip");
    const skipped = await repository.commitImport(review.token);
    expect(skipped).toMatchObject({ imported: 0, skippedConflicts: 1 });
    expect((await repository.scanBooks())[0].clippings.map((clip) => clip.content)).not.toContain("Changed text with the same Kindle identity.");

    const separateReview = await repository.previewImport(exportPath);
    repository.setConflictResolution(separateReview.token, separateReview.conflicts[0].identityKey, "add-separately");
    const added = await repository.commitImport(separateReview.token);
    expect(added.imported).toBe(1);
    expect((await repository.scanBooks())[0].clippings).toHaveLength(3);
  });

  it("re-reads externally edited clipping text and serializes concurrent patches", async () => {
    const root = await tempDirectory();
    const exportPath = path.join(root, "My Clippings.txt");
    const repository = new VaultRepository(path.join(root, "vault"));
    await writeFile(exportPath, firstExport, "utf8");
    const preview = await repository.previewImport(exportPath);
    await repository.commitImport(preview.token);

    const cachedBook = await repository.getBook((await repository.scanBooks())[0].id);
    const clipping = cachedBook!.clippings[0];
    const markdown = await readFile(cachedBook!.vaultPath!, "utf8");
    await writeFile(cachedBook!.vaultPath!, markdown.replace(
      "Preferences are optional; constraints are not.",
      "Externally revised passage that must survive.",
    ), "utf8");

    await Promise.all([
      repository.updateClipping(cachedBook!.id, clipping.id, { favorite: true }),
      repository.updateClipping(cachedBook!.id, clipping.id, { reflection: "Queued note" }),
    ]);

    const updated = await readFile(cachedBook!.vaultPath!, "utf8");
    expect(updated).toContain("Externally revised passage that must survive.");
    expect(updated).toContain("Queued note");
    expect((await repository.getBook(cachedBook!.id))!.clippings[0]).toMatchObject({
      content: "Externally revised passage that must survive.",
      favorite: true,
      reflection: "Queued note",
    });
  });

  it("repairs legacy Markdown-sensitive quotes with a backup and preserves user sections", async () => {
    const root = await tempDirectory();
    const vaultPath = path.join(root, "vault");
    const exportPath = path.join(root, "My Clippings.txt");
    const literal = "# heading\n*emphasis* [link](target)\n1. item\n- dash\n\\literal\\";
    const source = [
      "Markdown Book (Jane Doe)",
      "- Your Highlight on page 1 | Location 1 | Added on Friday, October 13, 2023 04:15:54 PM",
      "",
      literal,
      "==========",
    ].join("\n");
    await writeFile(exportPath, source, "utf8");
    const repository = new VaultRepository(vaultPath);
    await repository.commitImport((await repository.previewImport(exportPath)).token);
    const book = (await repository.scanBooks())[0];
    const current = await readFile(book.vaultPath!, "utf8");
    const rawQuote = literal.split("\n").map((line) => `> ${line}`).join("\n");
    const legacy = `${current
      .replace("reading_desk_version: 4", "reading_desk_version: 3")
      .replace(/<!-- reading-desk:quote:start -->[\s\S]*?<!-- reading-desk:quote:end -->/, `<!-- reading-desk:quote:start -->\n${rawQuote}\n<!-- reading-desk:quote:end -->`)}\n## Personal analysis\nKeep **my Markdown** exactly.\n`;
    await writeFile(book.vaultPath!, legacy, "utf8");

    const reopened = new VaultRepository(vaultPath);
    const repairedBook = (await reopened.scanBooks())[0];
    const repaired = await readFile(book.vaultPath!, "utf8");
    expect(repaired).toContain("reading_desk_version: 4");
    expect(repaired).toContain("> \\# heading");
    expect(repaired).toContain("> \\*emphasis\\* \\[link\\]\\(target\\)");
    expect(repaired).toContain("## Personal analysis\nKeep **my Markdown** exactly.");
    expect(repairedBook.clippings[0].content).toBe(literal);
    const backupDirectory = path.join(vaultPath, ".kindle-library", "backups", "markdown-v4");
    const [backup] = await readdir(backupDirectory);
    expect(await readFile(path.join(backupDirectory, backup), "utf8")).toBe(legacy);
  });

  it("preserves target Markdown and backs up both books before a merge", async () => {
    const root = await tempDirectory();
    const vaultPath = path.join(root, "vault");
    const exportPath = path.join(root, "My Clippings.txt");
    const secondBook = [
      "A Second Book (Jane Doe)",
      "- Your Highlight on page 2 | Location 5 | Added on Sunday, October 15, 2023 04:15:54 PM",
      "",
      "Second book passage.",
      "==========",
    ].join("\n");
    await writeFile(exportPath, `${firstExport}\n${secondBook}\n`, "utf8");
    const repository = new VaultRepository(vaultPath);
    const preview = await repository.previewImport(exportPath);
    await repository.commitImport(preview.token);

    const books = await repository.scanBooks();
    const target = books.find((book) => book.title === "Constraints")!;
    const source = books.find((book) => book.title === "A Second Book")!;
    await repository.updateBook(source.id, { reflection: "Source reflection" });
    const targetBefore = (await readFile(target.vaultPath!, "utf8"))
      .replace("reading_desk_version: 4", "reading_desk_version: 4\ncustom_target: keep-me")
      .concat("\n## Independent target section\nNever remove this.\n");
    const sourceBefore = (await readFile(source.vaultPath!, "utf8"))
      .replace("reading_desk_version: 4", "reading_desk_version: 4\ncustom_source: recover-me")
      .concat("\n## Independent source section\nRecover this too.\n");
    await writeFile(target.vaultPath!, targetBefore, "utf8");
    await writeFile(source.vaultPath!, sourceBefore, "utf8");

    await repository.mergeBooks(source.id, target.id);

    const merged = await readFile(target.vaultPath!, "utf8");
    expect(merged).toContain("custom_target: keep-me");
    expect(merged).toContain("Never remove this.");
    expect(merged).toContain("Second book passage.");
    expect(merged).toContain("### From A Second Book");
    expect(merged).toContain("Source reflection");

    const backupRoot = path.join(vaultPath, ".kindle-library", "backups", "merges");
    const [backupName] = await readdir(backupRoot);
    const backupPath = path.join(backupRoot, backupName);
    const backupFiles = await readdir(backupPath);
    const sourceBackup = backupFiles.find((name) => name.startsWith("source--"))!;
    const targetBackup = backupFiles.find((name) => name.startsWith("target--"))!;
    expect(await readFile(path.join(backupPath, sourceBackup), "utf8")).toBe(sourceBefore);
    expect(await readFile(path.join(backupPath, targetBackup), "utf8")).toBe(targetBefore);
    expect(backupFiles).toContain("manifest.json");
  });
});
