// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleDocsExport } from "../src/GoogleDocsExport";
import { demoApi } from "../src/demo";
import type { BookRecord, ReadingDeskApi } from "../shared/types";

const book: BookRecord = { id: "test-book", title: "Example", authors: ["Reader"], clippings: [
  { id: "clip", identityKey: "", contentHash: "", bookSourceKey: "", sourceTitle: "", type: "highlight", content: "Complete bold passage", favorite: false, tags: [], reflection: "", sourceIndex: 0 },
], sourceKeys: [], aliases: [], status: "Reading", rating: 0, tags: [], reflection: "" };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
const readyApi = (): ReadingDeskApi => ({ ...demoApi, getGoogleDocsAvailability: async () => ({ available: true, message: "Ready" }) });

describe("Google Docs export dialog", () => {
  it("provides an honest preview without OAuth configuration", async () => {
    render(<GoogleDocsExport book={book} api={demoApi} onClose={() => undefined} />);
    await screen.findByText(/Document preview only/);
    expect(screen.getByRole("button", { name: "Sign in & create document" })).toBeDisabled();
    expect(screen.getByText("Complete bold passage").tagName).toBe("STRONG");
    expect(within(screen.getByRole("region", { name: "Document preview" })).getByText("Notes:").tagName).toBe("P");
  });

  it("exports once, surfaces the result link and prevents duplicate clicks", async () => {
    const api = readyApi();
    api.exportBookToGoogleDocs = vi.fn().mockResolvedValue({ status: "complete", documentUrl: "https://docs.google.com/document/d/test/edit", highlightCount: 1 });
    render(<GoogleDocsExport book={book} api={api} onClose={() => undefined} />);
    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: "Sign in & create document" }));
    expect(await screen.findByRole("link", { name: /Open Google Doc/ })).toHaveAttribute("href", "https://docs.google.com/document/d/test/edit");
    expect(api.exportBookToGoogleDocs).toHaveBeenCalledExactlyOnceWith("test-book");
    expect(screen.getByRole("button", { name: "Sign in & create document" })).toBeDisabled();
  });

  it("keeps errors visible and offers cancellation while exporting", async () => {
    const api = readyApi();
    let rejectExport!: (error: Error) => void;
    api.exportBookToGoogleDocs = () => new Promise((_resolve, reject) => { rejectExport = reject; });
    api.cancelGoogleDocsExport = vi.fn(async () => { rejectExport(new Error("Google sign-in was canceled.")); });
    render(<GoogleDocsExport book={book} api={api} onClose={() => undefined} />);
    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: "Sign in & create document" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel export" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("canceled");
    expect(api.cancelGoogleDocsExport).toHaveBeenCalledOnce();
  });
});
