import { describe, expect, it, vi } from "vitest";
import { buildGoogleDocsContent, exportSections } from "../shared/highlight-export";
import { createHighlightsDocument } from "../electron/core/google-docs";
import type { BookRecord, ClippingRecord } from "../shared/types";

function clip(content: string, location: number, type: ClippingRecord["type"] = "highlight"): ClippingRecord {
  return { id: `clip-${location}`, identityKey: "", contentHash: "", bookSourceKey: "", sourceTitle: "", type, content, favorite: false, tags: [], reflection: "private note", sourceIndex: location, locationStart: location };
}
export function exampleBook(): BookRecord {
  return { id: "book-1", title: "Reading 📚", authors: ["José"], sourceKeys: [], aliases: [], status: "Reading", rating: 0, tags: [], reflection: "private reflection", clippings: [clip("Last passage", 20), clip("First 🧠\nSecond line", 10), clip("Kindle note", 15, "note"), clip("", 30, "bookmark")] };
}

describe("Google Docs book export", () => {
  it("exports complete highlights in order with UTF-16 bold ranges excluding annotations", () => {
    const book = exampleBook();
    const before = structuredClone(book);
    const content = buildGoogleDocsContent(book);
    expect(content.highlightCount).toBe(2);
    expect(content.boldRanges.map(({ startIndex, endIndex }) => content.text.slice(startIndex - 1, endIndex - 1))).toEqual(["First 🧠\nSecond line", "Last passage"]);
    expect(content.text).not.toContain("Kindle note");
    expect(content.text).not.toContain("private");
    expect(content.text).not.toContain("undefined");
    expect(content.text.match(/Notes: \n\n/g)).toHaveLength(2);
    expect(exportSections(book).filter((section) => section.kind === "notes")).toHaveLength(2);
    expect(book).toEqual(before);
  });

  it("represents empty highlights and normalizes characters Docs removes before indexing", () => {
    const book = exampleBook();
    book.clippings = [clip("", 1), clip("A\u0000B\r\nC", 2)];
    const content = buildGoogleDocsContent(book);
    expect(content.boldRanges.map((range) => content.text.slice(range.startIndex - 1, range.endIndex - 1))).toEqual(["[No text in Kindle export]", "AB\nC"]);
  });

  it("does not silently truncate long passages or hundreds of highlights", async () => {
    const book = exampleBook();
    book.clippings = Array.from({ length: 405 }, (_, index) => clip(index === 0 ? "word ".repeat(4000) : `Quote ${index}`, index));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    request.mockResolvedValueOnce(new Response(JSON.stringify({ documentId: "doc_1" })));
    const result = await createHighlightsDocument(book, "token", new AbortController().signal, request);
    expect(result).toMatchObject({ status: "complete", highlightCount: 405 });
    expect(request).toHaveBeenCalledTimes(6);
    const bodies = request.mock.calls.map(([, options]) => JSON.parse(options!.body as string));
    expect(bodies[1].requests[0].insertText.text).toContain("word ".repeat(4000));
    expect(bodies[2].requests[0].updateTextStyle.textStyle.bold).toBe(false);
    expect(bodies.slice(3).flatMap((body) => body.requests)).toHaveLength(405);
    expect(bodies[3].requests).toHaveLength(200);
  });

  it("chunks very large books without truncating text or splitting surrogate pairs", async () => {
    const book = exampleBook();
    book.clippings = [clip(`${"a".repeat(249_900)}🧠${"b".repeat(310_000)}`, 1)];
    const expected = buildGoogleDocsContent(book);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    request.mockResolvedValueOnce(new Response(JSON.stringify({ documentId: "large-doc" })));
    await createHighlightsDocument(book, "token", new AbortController().signal, request);
    const calls = request.mock.calls.slice(1).map(([, options]) => JSON.parse(options!.body as string));
    const inserts = calls.flatMap((body) => body.requests).filter((item) => item.insertText).map((item) => item.insertText);
    expect(inserts.map((item) => item.text).join("")).toBe(expected.text);
    expect(inserts.every((item) => item.text.length <= 250_000)).toBe(true);
    expect(inserts.every((item) => !/[\uD800-\uDBFF]$/.test(item.text) && !/^[\uDC00-\uDFFF]/.test(item.text))).toBe(true);
    let offset = 1;
    for (const insert of inserts) {
      expect(insert.location.index).toBe(offset);
      offset += insert.text.length;
    }
  });

  it("rejects an empty book before making network requests", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(createHighlightsDocument({ ...exampleBook(), clippings: [] }, "token", new AbortController().signal, request)).rejects.toThrow("no highlights");
    expect(request).not.toHaveBeenCalled();
  });

  it("retains the document link after a formatting failure and never retries creation", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"documentId":"doc-1"}'))
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("quota", { status: 429 }));
    const result = await createHighlightsDocument(exampleBook(), "secret-token", new AbortController().signal, request);
    expect(result).toMatchObject({ status: "incomplete", documentUrl: "https://docs.google.com/document/d/doc-1/edit" });
    expect(result.message).toContain("too many requests");
    expect(result.message).not.toContain("secret-token");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("reports an uncertain creation outcome without duplicating a document", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("Connection lost"));
    await expect(createHighlightsDocument(exampleBook(), "token", new AbortController().signal, request)).rejects.toThrow("Check Google Drive before retrying");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports permission errors and preserves the link when cancellation follows creation", async () => {
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("no", { status: 403 }));
    await expect(createHighlightsDocument(exampleBook(), "token", new AbortController().signal, denied)).rejects.toThrow("denied access");
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"documentId":"partial"}'))
      .mockImplementationOnce(async () => { controller.abort(); throw new Error("Aborted"); });
    const result = await createHighlightsDocument(exampleBook(), "token", controller.signal, request);
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("canceled");
    expect(result.documentUrl).toContain("partial");
  });

  it("distinguishes expired authentication and quota-style 403 responses", async () => {
    const expired = vi.fn<typeof fetch>().mockResolvedValue(new Response("expired", { status: 401 }));
    await expect(createHighlightsDocument(exampleBook(), "token", new AbortController().signal, expired)).rejects.toThrow("sign-in expired");
    const quota = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", errors: [{ reason: "userRateLimitExceeded" }] } }), { status: 403 }));
    await expect(createHighlightsDocument(exampleBook(), "token", new AbortController().signal, quota)).rejects.toThrow("quota");
  });
});
