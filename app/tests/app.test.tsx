// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, BookReflection, BookWorkspace, ReaderPane } from "../src/App";
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
  it("supports arrow, boundary, and typeahead navigation in the book list", async () => {
    await renderApp();
    const list = screen.getByRole("listbox", { name: "Book library" });
    const options = within(list).getAllByRole("option");
    options[0].focus();

    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    await waitFor(() => expect(options[1]).toHaveFocus());
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(options[1], { key: "End" });
    const finalOption = await screen.findByRole("option", { name: /Geopolitical Alpha/ });
    await waitFor(() => expect(finalOption).toHaveFocus());

    fireEvent.keyDown(finalOption, { key: "D" });
    await waitFor(() => expect(screen.getByRole("option", { name: /Diplomacy/ })).toHaveFocus());
  });

  it("moves and activates book tabs with arrow and boundary keys", async () => {
    await renderApp();
    const highlights = screen.getByRole("tab", { name: "Highlights" });
    highlights.focus();

    fireEvent.keyDown(highlights, { key: "ArrowRight" });
    const reflection = screen.getByRole("tab", { name: "Book reflection" });
    await waitFor(() => expect(reflection).toHaveFocus());
    expect(reflection).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Make the book useful." })).toBeVisible();

    fireEvent.keyDown(reflection, { key: "End" });
    const details = screen.getByRole("tab", { name: "Details" });
    await waitFor(() => expect(details).toHaveFocus());
    expect(details).toHaveAttribute("aria-selected", "true");
  });

  it("uses one tab stop and arrow navigation for clipping options", async () => {
    await renderApp();
    const list = screen.getByRole("listbox", { name: "Clippings in book order" });
    const options = within(list).getAllByRole("option");
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    options[0].focus();

    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    await waitFor(() => expect(options[1]).toHaveFocus());
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(options[1], { key: "Home" });
    await waitFor(() => expect(options[0]).toHaveFocus());
  });

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

  it("shows refreshed data for the same book without discarding a dirty clipping draft", async () => {
    const clipping: ClippingRecord = {
      id: "clip-refresh", identityKey: "identity-refresh", contentHash: "hash-refresh", bookSourceKey: "book-refresh",
      sourceTitle: "Refresh Book (Test Author)", type: "highlight", content: "Original external text.", favorite: false, tags: [], reflection: "Saved note", sourceIndex: 0,
    };
    const book: BookRecord = {
      id: "book-refresh", sourceKeys: ["book-refresh"], title: "Refresh Book", authors: ["Test Author"], aliases: [],
      status: "Reading", rating: 0, tags: [], reflection: "", clippings: [clipping],
    };
    const props = {
      books: [{ id: book.id, title: book.title, authors: book.authors, status: book.status, rating: 0, tags: [], clippingCount: 1 }],
      authors: [], onAuthor: () => undefined, onRefresh: async () => undefined, onOpenBook: () => undefined,
      mainMenuVisible: true, booksVisible: true, onToggleMainMenu: () => undefined, onToggleBooks: () => undefined,
    };
    const { rerender } = render(<BookWorkspace book={book} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Unsaved local draft" } });

    const refreshed = { ...book, clippings: [{ ...clipping, content: "Externally refreshed text.", favorite: true }] };
    rerender(<BookWorkspace book={refreshed} {...props} />);

    await waitFor(() => expect(screen.getAllByText("Externally refreshed text.")).toHaveLength(2));
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Unsaved local draft");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
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

  it("queues edits made during a slow clipping save before navigating", async () => {
    const clipping: ClippingRecord = {
      id: "clip-slow", identityKey: "identity-slow", contentHash: "hash-slow", bookSourceKey: "book-slow",
      sourceTitle: "Slow Book (Test Author)", type: "highlight", content: "A passage.", favorite: false, tags: [], reflection: "", sourceIndex: 0,
    };
    const book: BookRecord = {
      id: "book-slow", sourceKeys: ["book-slow"], title: "Slow Book", authors: ["Test Author"], aliases: [],
      status: "Reading", rating: 0, tags: [], reflection: "", clippings: [clipping],
    };
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const onSave = vi.fn().mockImplementationOnce(() => firstSave).mockResolvedValue(undefined);
    const onNext = vi.fn();
    render(<ReaderPane book={book} clip={clipping} onSave={onSave} onNext={onNext} onPrevious={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    const notes = screen.getByRole("textbox", { name: "Notes" });
    fireEvent.change(notes, { target: { value: "First revision" } });
    fireEvent.blur(notes);
    await screen.findByRole("status", { name: "" });
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    fireEvent.change(notes, { target: { value: "Second revision while saving" } });
    resolveFirst();
    await screen.findByText("Unsaved changes");

    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({ reflection: "Second revision while saving", tags: [] });
    await waitFor(() => expect(onNext).toHaveBeenCalledOnce());
  });

  it("keeps a book reflection dirty when typing continues during a save", async () => {
    const book: BookRecord = {
      id: "book-reflection", sourceKeys: ["book-reflection"], title: "Reflection Book", authors: ["Test Author"], aliases: [],
      status: "Reading", rating: 0, tags: [], reflection: "", clippings: [],
    };
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const onSave = vi.fn().mockImplementationOnce(() => firstSave).mockResolvedValue(undefined);
    render(<BookReflection book={book} onSave={onSave} />);

    const reflection = screen.getByLabelText("Book reflection");
    fireEvent.change(reflection, { target: { value: "First reflection" } });
    fireEvent.blur(reflection);
    await screen.findByRole("status", { name: "" });
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    fireEvent.change(reflection, { target: { value: "Second reflection while saving" } });
    resolveFirst();
    await screen.findByText("Unsaved changes");
    fireEvent.click(screen.getByRole("button", { name: "Save reflection" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith("Second reflection while saving");
    await screen.findByText("Saved to vault");
  });
});
