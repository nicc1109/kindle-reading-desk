import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compareClippings, normalizedKey, parseClippingsFile, parseKindleDate } from "../electron/core/parser";

describe("Kindle clipping parser", () => {
  it("parses Spanish and English metadata variants", () => {
    const input = [
      "A Book (Doe, Jane; John Smith)",
      "- La subrayado en la página xii-xiii | posición 12-14 | Añadido el jueves, 12 de octubre de 2023 03:16:45",
      "",
      "A multiline highlight",
      "with its second line.",
      "==========",
      "A Book (Doe, Jane; John Smith)",
      "- Your Note on page 22 | Location 90 | Added on Friday, October 13, 2023 04:15:54 PM",
      "",
      "My note",
      "==========",
    ].join("\n");
    const result = parseClippingsFile(input);
    expect(result.clippings).toHaveLength(2);
    expect(result.books[0].authors).toEqual(["Jane Doe", "John Smith"]);
    expect(result.clippings[0]).toMatchObject({ type: "highlight", pageStart: "xii", pageEnd: "xiii", locationStart: 12, locationEnd: 14 });
    expect(result.clippings[0].content).toContain("second line");
    expect(result.clippings[1].type).toBe("note");
    expect(result.clippings[1].addedAt).toBe("2023-10-13T16:15:54.000Z");
  });

  it("parses the committed representative Kindle export completely", async () => {
    const sample = await readFile(new URL("./fixtures/my-clippings.sample.txt", import.meta.url), "utf8");
    const result = parseClippingsFile(sample);
    const sourceBlocks = sample
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split(/^==========[\t ]*$/gm)
      .map((block) => block.trim())
      .filter(Boolean);
    const types = result.clippings.reduce<Record<string, number>>((counts, clip) => {
      counts[clip.type] = (counts[clip.type] || 0) + 1;
      return counts;
    }, {});
    expect(result.clippings).toHaveLength(4);
    expect(result.books).toHaveLength(2);
    expect(types).toEqual({ highlight: 2, note: 1, bookmark: 1 });
    expect(result.clippings.filter((clip) => !clip.content)).toHaveLength(2);
    expect(result.warnings.filter((warning) => warning.message.startsWith("Unrecognized clipping type"))).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      block: 4,
      message: "Highlight has no text in the source file",
    }));

    // Every parsed body must match its exact source block. This guards against
    // silently shortening long or multiline highlights during format changes.
    for (const clipping of result.clippings) {
      const lines = sourceBlocks[clipping.sourceIndex].split("\n");
      const metadataIndex = lines.findIndex((line, index) => index > 0 && line.trim().startsWith("- "));
      expect(clipping.content).toBe(lines.slice(metadataIndex + 1).join("\n").trim());
    }
  });

  it("sorts Roman pages and numeric locations in book order", () => {
    const records = parseClippingsFile([
      "Book (Author)", "- Your Highlight on page x | Location 20 | Added on Monday, January 1, 2024 01:00:00 PM", "", "Later", "==========",
      "Book (Author)", "- Your Highlight on page v | Location 10 | Added on Monday, January 1, 2024 01:00:00 PM", "", "Earlier", "==========",
    ].join("\n")).clippings.sort(compareClippings);
    expect(records.map((record) => record.content)).toEqual(["Earlier", "Later"]);
  });

  it("handles localized dates without relying on the operating-system locale", () => {
    expect(parseKindleDate("miércoles, 1 de noviembre de 2023 06:32:46")).toBe("2023-11-01T06:32:46.000Z");
  });

  it("keeps non-Latin identity keys distinct and parses German and French metadata", () => {
    expect(normalizedKey("東京の本")).toBe("東京の本");
    expect(normalizedKey("Москва")).toBe("москва");
    expect(normalizedKey("東京の本")).not.toBe(normalizedKey("Москва"));

    const result = parseClippingsFile([
      "Denken (Hannah Arendt)",
      "- Ihre Markierung auf Seite 12 | Position 33-34 | Hinzugefügt am Samstag, 14. Oktober 2023 16:15:54",
      "",
      "Ein deutscher Text.",
      "==========",
      "Penser (Simone Weil)",
      "- Votre surlignement à la page 7 | Emplacement 20 | Ajouté le samedi 14 octobre 2023 16:15:54",
      "",
      "Un texte français.",
      "==========",
    ].join("\n"));

    expect(result.clippings).toHaveLength(2);
    expect(result.clippings[0]).toMatchObject({ type: "highlight", pageStart: "12", locationStart: 33, addedAt: "2023-10-14T16:15:54.000Z" });
    expect(result.clippings[1]).toMatchObject({ type: "highlight", pageStart: "7", locationStart: 20, addedAt: "2023-10-14T16:15:54.000Z" });
    expect(result.books[0].sourceKey).not.toBe(result.books[1].sourceKey);
    expect(result.warnings).toEqual([]);
  });

  it("warns when a heading leaves author metadata ambiguous", () => {
    const result = parseClippingsFile([
      "作者不明の本",
      "- Your Highlight on page 1 | Location 1 | Added on Monday, January 1, 2024 01:00:00 PM",
      "",
      "本文",
      "==========",
    ].join("\n"));
    expect(result.warnings).toContainEqual(expect.objectContaining({ message: "Could not infer the author from the book heading" }));
  });
});
