import type {
  AppSnapshot,
  AuthorRecord,
  BookPatch,
  BookRecord,
  BookSummary,
  ClippingPatch,
  ClippingRecord,
  ImportPreview,
  ReadingDeskApi,
} from "../shared/types";

const snippets = [
  "This framework focuses on the material constraints policymakers face.",
  "No amount of Virtù will help the Prince overcome Fortuna. Study his constraints.",
  "Material constraints impact not only policymakers but also voters.",
  "Preferences are optional and subject to constraints, whereas constraints are not optional.",
  "The world is undergoing paradigm shifts on political, geopolitical, generational, and technological fronts.",
  "Stability breeds collapse.",
  "A messy, multipolar world has replaced American hegemony.",
  "Developed-world middle classes stagnated amid globalization.",
];

function clipping(index: number, content: string): ClippingRecord {
  const location = 311 + index * 82;
  return {
    id: `clip-demo-${index + 1}`,
    identityKey: `demo-identity-${index + 1}`,
    contentHash: `demo-hash-${index + 1}`,
    bookSourceKey: "demo-geopolitical-alpha",
    sourceTitle: "Geopolitical Alpha: An Investment Framework for Predicting the Future (Papic, Marko)",
    type: index === 5 ? "note" : "highlight",
    pageStart: String(21 + index * 4),
    pageEnd: String(21 + index * 4),
    locationStart: location,
    locationEnd: location + 1,
    addedAt: `2023-10-${String(12 + Math.floor(index / 3)).padStart(2, "0")}T05:${String(16 + index * 4).padStart(2, "0")}:36.000Z`,
    addedAtRaw: `jueves, ${12 + Math.floor(index / 3)} de octubre de 2023 05:${String(16 + index * 4).padStart(2, "0")}:36`,
    content,
    favorite: index === 1 || index === 3,
    tags: index === 3 ? ["constraints", "decision-making"] : [],
    reflection: index === 0
      ? "Constraints are the useful unit of analysis: preferences explain intention, but constraints explain the available moves."
      : "",
    sourceIndex: index,
  };
}

const fullBook: BookRecord = {
  id: "book-geopolitical-alpha",
  sourceKeys: ["demo-geopolitical-alpha"],
  title: "Geopolitical Alpha",
  authors: ["Marko Papic", "Steven Drobny"],
  aliases: [],
  status: "Finished",
  rating: 4,
  tags: ["geopolitics", "investing", "macroeconomics"],
  startedAt: "2023-10-12",
  finishedAt: "2023-11-03",
  firstClippingAt: "2023-10-12T05:16:36.000Z",
  lastClippingAt: "2023-11-03T19:45:52.000Z",
  reflection: "Papic offers a practical method for political forecasting: ignore stated preferences until you understand the material constraints that bound the decision. This is especially useful when evaluating policy, markets, and institutional behavior.",
  clippings: snippets.map((content, index) => clipping(index, content)),
  vaultPath: "C:\\Users\\Reader\\Documents\\Reading Desk Vault\\Books\\Geopolitical Alpha.md",
};

const catalog: Array<[string, string, string, number, BookSummary["status"]]> = [
  ["book-geopolitical-alpha", "Geopolitical Alpha", "Marko Papic", 217, "Finished"],
  ["book-four-peronisms", "Los cuatro peronismos", "Alejandro Horowicz", 1228, "Reference"],
  ["book-diplomacy", "Diplomacy", "Henry Kissinger", 487, "Finished"],
  ["book-new-map", "The New Map", "Daniel Yergin", 477, "Finished"],
  ["book-end-world", "The End of the World is Just the Beginning", "Peter Zeihan", 430, "Reading"],
  ["book-connectography", "Connectography", "Parag Khanna", 429, "Finished"],
  ["book-huracan", "El huracán rojo", "Alejandro Horowicz", 397, "Finished"],
  ["book-kirchnerismo", "El kirchnerismo desarmado", "Alejandro Horowicz", 394, "Reference"],
  ["book-liberalism", "Why Liberalism Failed", "Patrick J. Deneen", 228, "Paused"],
  ["book-capitalist-realism", "Realismo capitalista", "Mark Fisher", 176, "Finished"],
  ["book-political-order", "El orden político en las sociedades en cambio", "Samuel P. Huntington", 156, "Reference"],
  ["book-shock", "La Doctrina del Shock", "Naomi Klein", 155, "Finished"],
];

const books: BookRecord[] = catalog.map(([id, title, author, count, status], index) => {
  if (id === fullBook.id) return fullBook;
  return {
    id,
    sourceKeys: [`demo-source-${id}`],
    title,
    authors: [author],
    aliases: [],
    status,
    rating: index % 5,
    tags: index % 2 ? ["politics"] : ["history"],
    firstClippingAt: "2023-10-12T05:16:36.000Z",
    lastClippingAt: "2024-04-18T12:30:00.000Z",
    reflection: "",
    clippings: Array.from({ length: Math.min(count, 18) }, (_, clipIndex) => ({
      ...clipping(clipIndex, `${title}: saved passage ${clipIndex + 1}. This is representative preview data for the desktop interface.`),
      id: `${id}-clip-${clipIndex}`,
      identityKey: `${id}-identity-${clipIndex}`,
      contentHash: `${id}-hash-${clipIndex}`,
      bookSourceKey: `demo-source-${id}`,
      sourceTitle: `${title} (${author})`,
    })),
  };
});

function makeSummary(book: BookRecord): BookSummary {
  const catalogCount = catalog.find(([id]) => id === book.id)?.[3];
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    status: book.status,
    rating: book.rating,
    tags: book.tags,
    clippingCount: catalogCount || book.clippings.length,
    firstClippingAt: book.firstClippingAt,
    lastClippingAt: book.lastClippingAt,
  };
}

function buildAuthors(): AuthorRecord[] {
  const map = new Map<string, AuthorRecord>();
  books.forEach((book) => book.authors.forEach((name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const author = map.get(id) || { id: `author-${id}`, name, books: [] };
    author.books.push(makeSummary(book));
    map.set(id, author);
  }));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

let vaultPath = "C:\\Users\\Reader\\Documents\\Reading Desk Vault";
let preview: ImportPreview | null = null;

function snapshot(): AppSnapshot {
  return {
    vaultPath,
    books: books.map(makeSummary).sort((a, b) =>
      (b.lastClippingAt || "").localeCompare(a.lastClippingAt || "") || a.title.localeCompare(b.title)),
    authors: buildAuthors(),
    imports: [{
      id: "demo-import",
      filename: "My Clippings.txt",
      importedAt: "2026-07-29T10:32:00.000Z",
      total: 8942,
      imported: 8942,
      duplicates: 0,
      conflicts: 0,
    }],
  };
}

export const demoApi: ReadingDeskApi = {
  getSnapshot: async () => snapshot(),
  getBook: async (bookId) => structuredClone(books.find((book) => book.id === bookId) || null),
  selectVault: async () => { vaultPath = "C:\\Users\\Reader\\Documents\\Reading Desk Vault"; return snapshot(); },
  chooseImport: async () => {
    preview = {
      token: "demo-preview",
      filename: "My Clippings.txt",
      total: 9018,
      newCount: 76,
      duplicateCount: 8942,
      newBookCount: 2,
      affectedBookCount: 7,
      conflicts: [{
        identityKey: "demo-conflict",
        existingId: "clip-demo-4",
        incomingId: "clip-demo-conflict",
        bookTitle: "Geopolitical Alpha",
        existingContent: "Preferences are optional and subject to constraints, whereas constraints are not optional.",
        incomingContent: "Preferences are optional; material constraints are not.",
        resolution: "skip",
      }],
      warnings: [],
    };
    return preview;
  },
  previewImportPath: async () => demoApi.chooseImport() as Promise<ImportPreview>,
  setConflictResolution: async (_token, identityKey, resolution) => {
    if (preview) preview.conflicts = preview.conflicts.map((conflict) => conflict.identityKey === identityKey ? { ...conflict, resolution } : conflict);
    return structuredClone(preview) as ImportPreview;
  },
  commitImport: async () => ({ imported: preview?.newCount || 0, duplicates: preview?.duplicateCount || 0, skippedConflicts: 0, booksChanged: preview?.affectedBookCount || 0 }),
  updateBook: async (bookId, patch: BookPatch) => {
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) throw new Error("Book not found");
    Object.assign(book, patch);
    return structuredClone(book);
  },
  updateClipping: async (bookId, clippingId, patch: ClippingPatch) => {
    const book = books.find((candidate) => candidate.id === bookId);
    const clip = book?.clippings.find((candidate) => candidate.id === clippingId);
    if (!clip) throw new Error("Clipping not found");
    Object.assign(clip, patch);
    return structuredClone(clip);
  },
  mergeBooks: async (sourceBookId, targetBookId) => {
    const sourceIndex = books.findIndex((book) => book.id === sourceBookId);
    const target = books.find((book) => book.id === targetBookId);
    if (sourceIndex >= 0 && target) {
      target.clippings.push(...books[sourceIndex].clippings);
      books.splice(sourceIndex, 1);
    }
    return snapshot();
  },
  mergeAuthors: async (sourceName, targetName) => {
    books.forEach((book) => { book.authors = book.authors.map((author) => author === sourceName ? targetName : author); });
    return snapshot();
  },
  openBookInObsidian: async () => true,
  showBookInFolder: async () => true,
  onVaultChanged: () => () => undefined,
};
