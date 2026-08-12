// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, ReaderPane } from "../src/App";
import type { BookRecord, ClippingRecord } from "../shared/types";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1440 });
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.classList.remove("resizing-panels");
});

async function renderApp() {
  render(<App />);
  await screen.findByRole("heading", { level: 1 });
}

describe("Reading workspace layout", () => {
  it("resizes both panels with pointer and keyboard input and persists their preferred widths", async () => {
    await renderApp();
    const navigationSeparator = screen.getByRole("separator", { name: "Resize primary navigation" });
    const bookListSeparator = screen.getByRole("separator", { name: "Resize book list" });

    fireEvent.keyDown(navigationSeparator, { key: "ArrowRight" });
    fireEvent.pointerDown(bookListSeparator, { clientX: 410, pointerId: 1 });
    fireEvent.pointerMove(bookListSeparator, { clientX: 470, pointerId: 1 });
    fireEvent.pointerUp(bookListSeparator, { clientX: 470, pointerId: 1 });

    await waitFor(() => {
      expect(window.localStorage.getItem("reading-desk.primary-navigation-width")).toBe("192");
      expect(window.localStorage.getItem("reading-desk.book-list-width")).toBe("470");
    });
    expect(navigationSeparator).toHaveAttribute("aria-valuenow", "192");
    expect(bookListSeparator).toHaveAttribute("aria-valuenow", "470");
  });

  it("keeps Notes collapsed when a clipping is selected and removes the full-page control", async () => {
    await renderApp();
    const notesToggle = screen.getByRole("button", { name: "Notes" });

    expect(notesToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /full-page book view/i })).not.toBeInTheDocument();

    fireEvent.click(notesToggle);
    const notesField = screen.getByRole("textbox", { name: "Notes" });
    expect((notesField as HTMLTextAreaElement).value).toContain("constraints");
    expect(screen.queryByText("Your reflection")).not.toBeInTheDocument();
    expect(screen.queryByText("PASSAGE NOTE")).not.toBeInTheDocument();
    fireEvent.change(notesField, { target: { value: "A revised clipping note." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText("Saved to vault");
    expect(notesToggle).toHaveAttribute("aria-expanded", "true");

    const clippingList = screen.getByRole("listbox", { name: "Clippings in book order" });
    fireEvent.click(within(clippingList).getAllByRole("option")[1]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
  });
});

describe("Notes save failures", () => {
  it("keeps the editor open when closing a dirty note fails to save", async () => {
    const clipping: ClippingRecord = {
      id: "clip-test",
      identityKey: "identity-test",
      contentHash: "hash-test",
      bookSourceKey: "book-test",
      sourceTitle: "Test Book (Test Author)",
      type: "highlight",
      content: "A saved passage.",
      favorite: false,
      tags: [],
      reflection: "",
      sourceIndex: 0,
    };
    const book: BookRecord = {
      id: "book-test",
      sourceKeys: ["book-test"],
      title: "Test Book",
      authors: ["Test Author"],
      aliases: [],
      status: "Reading",
      rating: 0,
      tags: [],
      reflection: "",
      clippings: [clipping],
    };
    const onSave = vi.fn().mockRejectedValue(new Error("save failed"));

    render(<ReaderPane book={book} clip={clipping} onSave={onSave} onNext={() => undefined} onPrevious={() => undefined} />);
    const notesToggle = screen.getByRole("button", { name: "Notes" });
    fireEvent.click(notesToggle);
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "A new note" } });
    fireEvent.click(notesToggle);

    await screen.findByText("Could not save");
    expect(notesToggle).toHaveAttribute("aria-expanded", "true");
    expect(onSave).toHaveBeenCalledWith({ reflection: "A new note", tags: [] });
  });
});
