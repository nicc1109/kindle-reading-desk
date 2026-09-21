import type { ExportBook, GoogleDocsExportResult } from "../../shared/google-docs.js";
import { buildGoogleDocsContent } from "../../shared/highlight-export.js";

const INSERT_CHUNK_SIZE = 250_000;

class GoogleTransportError extends Error {}

function splitForGoogleDocs(text: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + INSERT_CHUNK_SIZE, text.length);
    // Do not split a UTF-16 surrogate pair between API requests.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
}

async function googleApiError(response: Response): Promise<Error> {
  let reason = "";
  try {
    const payload = await response.clone().json() as {
      error?: { status?: string; errors?: Array<{ reason?: string }> };
    };
    reason = [payload.error?.status, ...(payload.error?.errors || []).map((item) => item.reason)].filter(Boolean).join(" ");
  } catch { /* Google can also return an HTML or empty error response. */ }
  if (response.status === 401) return new Error("Google sign-in expired. Please sign in again.");
  if (response.status === 429 || /rate.?limit|quota|resource_exhausted/i.test(reason)) {
    return new Error("Google is receiving too many requests or this project has reached its quota. Please try again later.");
  }
  if (response.status === 403 && /access.?not.?configured|service_disabled/i.test(reason)) {
    return new Error("Google Docs API access is not enabled for this OAuth project.");
  }
  if (response.status === 403) {
    return new Error("Google denied access. Sign in again and grant permission to create documents.");
  }
  return new Error(`Google Docs could not complete the export (HTTP ${response.status}).`);
}

export async function createHighlightsDocument(
  book: ExportBook,
  accessToken: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<GoogleDocsExportResult> {
  const content = buildGoogleDocsContent(book);
  if (!content.highlightCount) throw new Error("This book has no highlights to export.");
  const post = async (url: string, body: unknown) => {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await request(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
    } catch (error) {
      if (signal.aborted) throw new GoogleTransportError("Export canceled.");
      throw new GoogleTransportError(error instanceof Error ? error.message : "Google Docs could not be reached.");
    }
    if (!response.ok) throw await googleApiError(response);
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
    if (error instanceof GoogleTransportError) {
      throw new Error(`${error.message} Check Google Drive before retrying; a blank document may have been created.`);
    }
    throw error;
  }
  const result = { documentUrl: `https://docs.google.com/document/d/${documentId}/edit`, highlightCount: content.highlightCount };
  try {
    const endpoint = `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`;
    let insertedLength = 0;
    for (const chunk of splitForGoogleDocs(content.text)) {
      await post(endpoint, { requests: [
        { insertText: { location: { index: insertedLength + 1 }, text: chunk } },
      ] });
      insertedLength += chunk.length;
    }
    await post(endpoint, { requests: [
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
