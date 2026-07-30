export type BookStatus = "Reading" | "Finished" | "Paused" | "Reference";
export type ClippingType = "highlight" | "note" | "bookmark" | "unknown";

export interface ClippingRecord {
  id: string;
  identityKey: string;
  contentHash: string;
  bookSourceKey: string;
  sourceTitle: string;
  type: ClippingType;
  pageStart?: string;
  pageEnd?: string;
  locationStart?: number;
  locationEnd?: number;
  addedAt?: string;
  addedAtRaw?: string;
  content: string;
  favorite: boolean;
  tags: string[];
  reflection: string;
  sourceIndex: number;
}

export interface BookRecord {
  id: string;
  sourceKeys: string[];
  title: string;
  authors: string[];
  aliases: string[];
  status: BookStatus;
  rating: number;
  tags: string[];
  startedAt?: string;
  finishedAt?: string;
  firstClippingAt?: string;
  lastClippingAt?: string;
  reflection: string;
  clippings: ClippingRecord[];
  vaultPath?: string;
}

export interface BookSummary {
  id: string;
  title: string;
  authors: string[];
  status: BookStatus;
  rating: number;
  tags: string[];
  clippingCount: number;
  firstClippingAt?: string;
  lastClippingAt?: string;
  searchText?: string;
}

export interface AuthorRecord {
  id: string;
  name: string;
  books: BookSummary[];
}

export interface ParseWarning {
  block: number;
  title?: string;
  message: string;
}

export interface ParseResult {
  clippings: ClippingRecord[];
  books: Array<{
    sourceKey: string;
    sourceTitle: string;
    title: string;
    authors: string[];
  }>;
  warnings: ParseWarning[];
}

export interface ImportConflict {
  identityKey: string;
  existingId: string;
  incomingId: string;
  bookTitle: string;
  existingContent: string;
  incomingContent: string;
  resolution: "skip" | "add-separately";
}

export interface ImportPreview {
  token: string;
  filename: string;
  total: number;
  newCount: number;
  duplicateCount: number;
  newBookCount: number;
  affectedBookCount: number;
  conflicts: ImportConflict[];
  warnings: ParseWarning[];
}

export interface ImportCommitResult {
  imported: number;
  duplicates: number;
  skippedConflicts: number;
  booksChanged: number;
}

export interface ImportHistoryEntry {
  id: string;
  filename: string;
  importedAt: string;
  total: number;
  imported: number;
  duplicates: number;
  conflicts: number;
}

export interface AppSnapshot {
  vaultPath: string | null;
  books: BookSummary[];
  authors: AuthorRecord[];
  imports: ImportHistoryEntry[];
}

export interface BookPatch {
  title?: string;
  authors?: string[];
  status?: BookStatus;
  rating?: number;
  tags?: string[];
  startedAt?: string;
  finishedAt?: string;
  reflection?: string;
}

export interface ClippingPatch {
  favorite?: boolean;
  tags?: string[];
  reflection?: string;
}

export interface ReadingDeskApi {
  getSnapshot(): Promise<AppSnapshot>;
  getBook(bookId: string): Promise<BookRecord | null>;
  selectVault(): Promise<AppSnapshot>;
  chooseImport(): Promise<ImportPreview | null>;
  previewImportPath(path: string): Promise<ImportPreview>;
  setConflictResolution(token: string, identityKey: string, resolution: "skip" | "add-separately"): Promise<ImportPreview>;
  commitImport(token: string): Promise<ImportCommitResult>;
  updateBook(bookId: string, patch: BookPatch): Promise<BookRecord>;
  updateClipping(bookId: string, clippingId: string, patch: ClippingPatch): Promise<ClippingRecord>;
  mergeBooks(sourceBookId: string, targetBookId: string): Promise<AppSnapshot>;
  mergeAuthors(sourceName: string, targetName: string): Promise<AppSnapshot>;
  openBookInObsidian(bookId: string): Promise<boolean>;
  showBookInFolder(bookId: string): Promise<boolean>;
  onVaultChanged(callback: () => void): () => void;
}
