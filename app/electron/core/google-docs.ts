import type { ExportBook, GoogleDocsExportResult } from "../../shared/google-docs.js";
import { buildGoogleDocsContent } from "../../shared/highlight-export.js";

export async function createHighlightsDocument(
  book: ExportBook,
  accessToken: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<GoogleDocsExportResult> {
  const content = buildGoogleDocsContent(book);
  if (!content.highlightCount) throw new Error("This book has no highlights to export.");
  const post = async (url: string, body: unknown) => {
    const response = await request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Google sign-in expired. Please sign in again.");
      if (response.status === 403) throw new Error("Google denied access. Check document permissions and that the Google Docs API is enabled.");
      if (response.status === 429) throw new Error("Google is receiving too many requests. Please try again later.");
      throw new Error(`Google Docs could not complete the export (HTTP ${response.status}).`);
    }
    return response;
  };
  let documentId: string;
  try {
    const created = await post("https://docs.googleapis.com/v1/documents", { title: `${book.title} — Highlights` });
    const data = await created.json() as { documentId?: string };
    if (!data.documentId || !/^[a-zA-Z0-9_-]+$/.test(data.documentId)) throw new Error("Google returned an invalid document ID.");
    documentId = data.documentId;
  } catch (error) {
    // A lost response can leave a document behind. Never retry creation automatically.
    throw new Error(`${error instanceof Error ? error.message : "Google Docs could not be reached."} Check Google Drive before retrying; a blank document may have been created.`);
  }
  const result = { documentUrl: `https://docs.google.com/document/d/${documentId}/edit`, highlightCount: content.highlightCount };
  try {
    const endpoint = `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`;
    await post(endpoint, { requests: [
      { insertText: { location: { index: 1 }, text: content.text } },
      { updateTextStyle: { range: { startIndex: 1, endIndex: content.text.length + 1 }, textStyle: { bold: false }, fields: "bold" } },
      { updateParagraphStyle: { range: { startIndex: 1, endIndex: content.text.indexOf("\n") + 2 }, paragraphStyle: { namedStyleType: "TITLE" }, fields: "namedStyleType" } },
    ] });
    for (let index = 0; index < content.boldRanges.length; index += 200) {
      await post(endpoint, { requests: content.boldRanges.slice(index, index + 200).map((range) => ({
        updateTextStyle: { range, textStyle: { bold: true }, fields: "bold" },
      })) });
    }
    return { ...result, status: "complete" };
  } catch (error) {
    // Expose the created document, including on cancellation; do not discard user-accessible output.
    return { ...result, status: "incomplete", message: `The document was created, but content or formatting is incomplete. ${signal.aborted ? "Export canceled." : error instanceof Error ? error.message : "Check your connection."}` };
  }
}
