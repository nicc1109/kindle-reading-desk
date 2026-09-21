import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { summarizeBook } from "../electron/core/vault";
import { filterBookSummaries } from "../shared/library";
import type { BookRecord, ClippingRecord } from "../shared/types";

function clipping(bookIndex: number, clippingIndex: number): ClippingRecord {
  const identity = `${bookIndex}-${clippingIndex}`;
  return {
    id: `clip-${identity}`,
    identityKey: `identity-${identity}`,
    contentHash: `hash-${identity}`,
    bookSourceKey: `source-${bookIndex}`,
    sourceTitle: `Book ${bookIndex} (Author ${bookIndex % 100})`,
    type: "highlight",
    content: `FULL_PROSE_SENTINEL_${identity} A representative passage that must stay out of the application snapshot.`,
    favorite: clippingIndex % 11 === 0,
    tags: [`topic-${clippingIndex % 20}`],
    reflection: `Private reflection ${identity}`,
    sourceIndex: clippingIndex,
  };
}

describe("large library model", () => {
  it("summarizes 1,000 books and 50,000 records without shipping prose or requiring an index", () => {
    const books: BookRecord[] = Array.from({ length: 1_000 }, (_, bookIndex) => ({
      id: `book-${bookIndex}`,
      sourceKeys: [`source-${bookIndex}`],
      title: `Book ${String(bookIndex).padStart(4, "0")}`,
      authors: [`Author ${bookIndex % 100}`],
      aliases: [`Edition ${bookIndex}`],
      status: bookIndex % 3 === 0 ? "Reading" : "Finished",
      rating: bookIndex % 6,
      tags: [`subject-${bookIndex % 25}`],
      reflection: `Book-level private prose ${bookIndex}`,
      clippings: Array.from({ length: 50 }, (_, clippingIndex) => clipping(bookIndex, clippingIndex)),
    }));

    const started = performance.now();
    const summaries = books.map(summarizeBook);
    const summarizedAt = performance.now();
    const matches = filterBookSummaries(summaries, "Author 42", "All");
    const completedAt = performance.now();
    const payload = JSON.stringify(summaries);
    const measurement = {
      books: summaries.length,
      records: books.reduce((total, book) => total + book.clippings.length, 0),
      summarizeMs: summarizedAt - started,
      filterMs: completedAt - summarizedAt,
      payloadBytes: Buffer.byteLength(payload),
    };
    console.info("P3 library scale measurement", measurement);

    expect(measurement).toMatchObject({ books: 1_000, records: 50_000 });
    expect(matches).toHaveLength(10);
    expect(payload).not.toContain("FULL_PROSE_SENTINEL");
    expect(payload).not.toContain("Book-level private prose");
    expect(measurement.payloadBytes).toBeLessThan(400_000);
    expect(measurement.summarizeMs + measurement.filterMs).toBeLessThan(1_000);
  });
});
