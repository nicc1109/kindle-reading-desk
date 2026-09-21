// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { performance } from "node:perf_hooks";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BookSummary } from "../shared/types";
import { LibraryPanel } from "../src/views/LibraryPanel";

afterEach(cleanup);

describe("large library rendering", () => {
  it("windows 1,000 metadata-only books within the measured DOM budget", () => {
    const books: BookSummary[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `book-${index}`,
      title: `Book ${String(index).padStart(4, "0")}`,
      authors: [`Author ${index % 100}`],
      status: index % 3 === 0 ? "Reading" : "Finished",
      rating: index % 6,
      tags: [`subject-${index % 25}`],
      clippingCount: 50,
    }));

    const started = performance.now();
    render(<LibraryPanel books={books} selectedId={books[0].id} onSelect={() => undefined} onHide={() => undefined} />);
    const renderedAt = performance.now();
    const options = within(screen.getByRole("listbox", { name: "Book library" })).getAllByRole("option");
    const queriedAt = performance.now();
    const measurement = { books: books.length, renderMs: renderedAt - started, queryMs: queriedAt - renderedAt };
    console.info("P3 library DOM measurement", measurement);

    expect(options.length).toBeLessThan(40);
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(options[0]).toHaveAttribute("aria-setsize", "1000");
    expect(measurement.renderMs + measurement.queryMs).toBeLessThan(1_000);
  });
});
