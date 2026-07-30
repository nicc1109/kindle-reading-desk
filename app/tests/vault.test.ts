import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VaultRepository } from "../electron/core/vault";

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
    await writeFile(book.vaultPath!, `${originalMarkdown.replace("reading_desk_version: 1", "reading_desk_version: 1\nmy_custom_frontmatter: keep-me")}\n## My independent section\nDo not change this.\n`, "utf8");
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
});
