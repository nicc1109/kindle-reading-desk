import type { BookRecord } from "./types.js";

export interface GoogleDocsExportResult {
  status: "complete" | "incomplete";
  documentUrl: string;
  highlightCount: number;
  message?: string;
}

export interface GoogleDocsAvailability {
  available: boolean;
  message: string;
}

export type ExportBook = Pick<BookRecord, "title" | "authors" | "clippings">;
