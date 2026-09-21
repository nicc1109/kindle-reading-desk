import type { ExportBook } from "./google-docs.js";
import type { ClippingRecord } from "./types.js";

export interface ExportSection {
  text: string;
  kind: "title" | "metadata" | "highlight" | "notes";
}

// Docs removes these characters on insertion. Normalize before calculating UTF-16 indices.
function docsText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000c-\u001f\ue000-\uf8ff]/g, "");
}

function pageNumber(value?: string): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (!/^[ivxlcdm]+$/i.test(value)) return undefined;
  const scores: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0, previous = 0;
  for (const character of value.toLowerCase().split("").reverse()) {
    const current = scores[character];
    total += current < previous ? -current : current;
    previous = current;
  }
  return total;
}

export function orderedHighlights(book: ExportBook): ClippingRecord[] {
  return book.clippings.filter((clip) => clip.type === "highlight").sort((a, b) => {
    // Kindle location is continuous across front matter and numbered pages.
    if (a.locationStart !== undefined && b.locationStart !== undefined && a.locationStart !== b.locationStart) {
      return a.locationStart - b.locationStart;
    }
    const left = pageNumber(a.pageStart), right = pageNumber(b.pageStart);
    if (left !== undefined && right !== undefined && left !== right) return left - right;
    return a.sourceIndex - b.sourceIndex;
  });
}

export function exportSections(book: ExportBook): ExportSection[] {
  const highlights = orderedHighlights(book);
  const sections: ExportSection[] = [
    { kind: "title", text: `${docsText(book.title)}\n` },
    { kind: "metadata", text: `${docsText(book.authors.join(" & "))}\n${highlights.length} highlights · Reading Desk\n\n` },
  ];
  highlights.forEach((clip, index) => {
    const reference: string[] = [];
    if (clip.pageStart) reference.push(`Page ${clip.pageStart}${clip.pageEnd && clip.pageEnd !== clip.pageStart ? `–${clip.pageEnd}` : ""}`);
    if (clip.locationStart !== undefined) reference.push(`Location ${clip.locationStart}${clip.locationEnd !== undefined && clip.locationEnd !== clip.locationStart ? `–${clip.locationEnd}` : ""}`);
    sections.push(
      { kind: "metadata", text: `${index + 1}. ${docsText(reference.join(" · ") || "No location")}\n` },
      { kind: "highlight", text: `${docsText(clip.content) || "[No text in Kindle export]"}\n` },
      // An explicit normal-weight paragraph avoids inheriting the quote's bold formatting.
      { kind: "notes", text: "Notes: \n\n" },
    );
  });
  return sections;
}

export function buildGoogleDocsContent(book: ExportBook) {
  const sections = exportSections(book);
  const text = sections.map((section) => section.text).join("");
  let index = 1;
  const boldRanges = sections.flatMap((section) => {
    const startIndex = index;
    index += section.text.length; // Google Docs indexes UTF-16 code units, as JavaScript does.
    return section.kind === "highlight" ? [{ startIndex, endIndex: index - 1 }] : [];
  });
  return { text, boldRanges, highlightCount: orderedHighlights(book).length };
}
