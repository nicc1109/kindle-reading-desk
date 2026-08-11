import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type {
  AppSnapshot,
  AuthorRecord,
  BookPatch,
  BookRecord,
  BookSummary,
  ClippingPatch,
  ClippingRecord,
  ImportCommitResult,
  ImportConflict,
  ImportHistoryEntry,
  ImportPreview,
  ParseResult,
} from "../../shared/types.js";
import { compareClippings, normalizedKey, parseClippingsFile, shortHash } from "./parser.js";

const BOOK_REFLECTION_START = "<!-- reading-desk:book-reflection:start -->";
const BOOK_REFLECTION_END = "<!-- reading-desk:book-reflection:end -->";
const BOOK_IDENTITY_START = "<!-- reading-desk:book-identity:start -->";
const BOOK_IDENTITY_END = "<!-- reading-desk:book-identity:end -->";
const CLIPPINGS_START = "<!-- reading-desk:clippings:start -->";
const CLIPPINGS_END = "<!-- reading-desk:clippings:end -->";
const MANAGED_START = "<!-- reading-desk:managed:start -->";
const MANAGED_END = "<!-- reading-desk:managed:end -->";

interface ImportSession {
  filePath: string;
  parsed: ParseResult;
  preview: ImportPreview;
}

interface EncodedClippingMeta {
  id: string;
  identityKey: string;
  contentHash: string;
  bookSourceKey: string;
  sourceTitle: string;
  type: ClippingRecord["type"];
  pageStart?: string;
  pageEnd?: string;
  locationStart?: number;
  locationEnd?: number;
  addedAt?: string;
  addedAtRaw?: string;
  favorite: boolean;
  tags: string[];
  sourceIndex: number;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90)
    .replace(/[. ]+$/g, "") || "Untitled";
}

function quoteMarkdown(value: string): string {
  if (!value) return "> *(No text — Kindle bookmark)*";
  return value.split("\n").map((line) => `> ${line}`).join("\n");
}

function summary(book: BookRecord): BookSummary {
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    status: book.status,
    rating: book.rating,
    tags: book.tags,
    clippingCount: book.clippings.length,
    firstClippingAt: book.firstClippingAt,
    lastClippingAt: book.lastClippingAt,
    searchText: [
      book.title,
      ...book.authors,
      ...book.aliases,
      ...book.tags,
      book.reflection,
      ...book.clippings.flatMap((clip) => [clip.content, clip.reflection, ...clip.tags]),
    ].join(" ").toLocaleLowerCase("en"),
  };
}

function bookDates(clippings: ClippingRecord[]): { first?: string; last?: string } {
  const dates = clippings.map((clip) => clip.addedAt).filter((date): date is string => Boolean(date)).sort();
  return { first: dates[0], last: dates.at(-1) };
}

function clippingLocation(clip: ClippingRecord): string {
  const parts: string[] = [];
  if (clip.pageStart) parts.push(`Page ${clip.pageStart}${clip.pageEnd && clip.pageEnd !== clip.pageStart ? `–${clip.pageEnd}` : ""}`);
  if (clip.locationStart !== undefined) {
    parts.push(`Location ${clip.locationStart}${clip.locationEnd !== undefined && clip.locationEnd !== clip.locationStart ? `–${clip.locationEnd}` : ""}`);
  }
  return parts.join(" · ") || "No location";
}

function encodeClippingMeta(clip: ClippingRecord): string {
  const meta: EncodedClippingMeta = {
    id: clip.id,
    identityKey: clip.identityKey,
    contentHash: clip.contentHash,
    bookSourceKey: clip.bookSourceKey,
    sourceTitle: clip.sourceTitle,
    type: clip.type,
    pageStart: clip.pageStart,
    pageEnd: clip.pageEnd,
    locationStart: clip.locationStart,
    locationEnd: clip.locationEnd,
    addedAt: clip.addedAt,
    addedAtRaw: clip.addedAtRaw,
    favorite: clip.favorite,
    tags: clip.tags,
    sourceIndex: clip.sourceIndex,
  };
  return Buffer.from(JSON.stringify(meta), "utf8").toString("base64url");
}

function decodeClippingMeta(value: string): EncodedClippingMeta {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as EncodedClippingMeta;
}

export function renderClippingBlock(clip: ClippingRecord): string {
  const label = clip.type.charAt(0).toUpperCase() + clip.type.slice(1);
  const tagLine = clip.tags.length ? `**Tags:** ${clip.tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}\n\n` : "";
  const reflectionLines = clip.reflection
    ? [
        "#### My note",
        `<!-- reading-desk:reflection:start id="${clip.id}" -->`,
        clip.reflection,
        `<!-- reading-desk:reflection:end id="${clip.id}" -->`,
      ]
    : [`<!-- reading-desk:reflection:start id="${clip.id}" --><!-- reading-desk:reflection:end id="${clip.id}" -->`];
  return [
    `<!-- reading-desk:clipping:start id="${clip.id}" data="${encodeClippingMeta(clip)}" -->`,
    `### ${label} — ${clippingLocation(clip)}${clip.favorite ? " · ★" : ""}`,
    "",
    "<!-- reading-desk:quote:start -->",
    quoteMarkdown(clip.content),
    "<!-- reading-desk:quote:end -->",
    "",
    clip.addedAtRaw ? `*Kindle ${clip.type} · Added ${clip.addedAtRaw}*` : `*Kindle ${clip.type} · Original date unavailable*`,
    "",
    tagLine.trimEnd(),
    tagLine ? "" : "",
    ...reflectionLines,
    "",
    `^kindle-${clip.id.replace(/^clip-/, "")}`,
    `<!-- reading-desk:clipping:end id="${clip.id}" -->`,
  ].filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\n");
}

function ownedFrontmatter(book: BookRecord): Record<string, unknown> {
  return {
    kindle_id: book.id,
    source_keys: book.sourceKeys,
    title: book.title,
    authors: book.authors,
    aliases: book.aliases,
    status: book.status,
    rating: book.rating,
    tags: book.tags,
    started: book.startedAt || null,
    finished: book.finishedAt || null,
    first_clipping: book.firstClippingAt || null,
    last_clipping: book.lastClippingAt || null,
    clipping_count: book.clippings.length,
    reading_desk_version: 2,
  };
}

function frontmatterFor(book: BookRecord, existing: Record<string, unknown> = {}): string {
  return YAML.stringify({ ...existing, ...ownedFrontmatter(book) }).trim();
}

function bookIdentityMarkdown(book: BookRecord): string {
  return [
    `# ${book.title}`,
    "",
    `*by ${book.authors.map((author) => `[[Authors/${slugify(author)}|${author}]]`).join(" & ")}*`,
  ].join("\n");
}

export function renderBookMarkdown(book: BookRecord): string {
  const sorted = [...book.clippings].sort(compareClippings);
  return [
    "---",
    frontmatterFor(book),
    "---",
    "",
    BOOK_IDENTITY_START,
    bookIdentityMarkdown(book),
    BOOK_IDENTITY_END,
    "",
    "## Reflection",
    BOOK_REFLECTION_START,
    book.reflection || "",
    BOOK_REFLECTION_END,
    "",
    "## Highlights & notes",
    CLIPPINGS_START,
    sorted.map(renderClippingBlock).join("\n\n"),
    CLIPPINGS_END,
    "",
  ].join("\n");
}

function parseFrontmatter(markdown: string): { data: Record<string, unknown>; end: number } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("Book note has no valid YAML frontmatter");
  return { data: (YAML.parse(match[1]) || {}) as Record<string, unknown>, end: match[0].length };
}

function between(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return markdown.slice(startIndex + start.length, endIndex).trim();
}

export function parseBookMarkdown(markdown: string, vaultPath?: string): BookRecord {
  const { data } = parseFrontmatter(markdown);
  const reflection = between(markdown, BOOK_REFLECTION_START, BOOK_REFLECTION_END);
  const clippings: ClippingRecord[] = [];
  const pattern = /<!-- reading-desk:clipping:start id="([^"]+)" data="([^"]+)" -->([\s\S]*?)<!-- reading-desk:clipping:end id="\1" -->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    try {
      const meta = decodeClippingMeta(match[2]);
      const quote = between(match[3], "<!-- reading-desk:quote:start -->", "<!-- reading-desk:quote:end -->")
        .split("\n")
        .map((line) => line.replace(/^> ?/, ""))
        .join("\n")
        .replace(/^\*\(No text — Kindle bookmark\)\*$/, "")
        .trim();
      const clippingReflection = between(
        match[3],
        `<!-- reading-desk:reflection:start id="${meta.id}" -->`,
        `<!-- reading-desk:reflection:end id="${meta.id}" -->`,
      );
      clippings.push({ ...meta, content: quote, reflection: clippingReflection });
    } catch {
      // A malformed app marker is ignored so the rest of the human-authored note stays readable.
    }
  }

  const dateInfo = bookDates(clippings);
  return {
    id: String(data.kindle_id || `book-${shortHash(String(data.title || "untitled"))}`),
    sourceKeys: Array.isArray(data.source_keys) ? data.source_keys.map(String) : [],
    title: String(data.title || "Untitled"),
    authors: Array.isArray(data.authors) ? data.authors.map(String) : ["Unknown author"],
    aliases: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
    status: ["Reading", "Finished", "Paused", "Reference"].includes(String(data.status))
      ? (String(data.status) as BookRecord["status"])
      : "Reading",
    rating: Math.max(0, Math.min(5, Number(data.rating) || 0)),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    startedAt: data.started ? String(data.started) : undefined,
    finishedAt: data.finished ? String(data.finished) : undefined,
    firstClippingAt: data.first_clipping ? String(data.first_clipping) : dateInfo.first,
    lastClippingAt: data.last_clipping ? String(data.last_clipping) : dateInfo.last,
    reflection,
    clippings: clippings.sort(compareClippings),
    vaultPath,
  };
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.reading-desk-${randomUUID()}.tmp`;
  await writeFile(temporary, content, "utf8");
  try {
    await rename(temporary, filePath);
  } catch {
    const backup = `${filePath}.reading-desk-backup`;
    try {
      await rename(filePath, backup);
      await rename(temporary, filePath);
      await rm(backup, { force: true });
    } catch (error) {
      try { await copyFile(backup, filePath); } catch { /* first write has no backup */ }
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

function replaceFrontmatter(markdown: string, book: BookRecord): string {
  const { data, end } = parseFrontmatter(markdown);
  return `---\n${frontmatterFor(book, data)}\n---\n${markdown.slice(end)}`;
}

function replaceBetween(markdown: string, start: string, end: string, value: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Managed Markdown region is missing: ${start}`);
  return `${markdown.slice(0, startIndex + start.length)}\n${value.trim()}\n${markdown.slice(endIndex)}`;
}

function validateBookMarkdown(markdown: string, expected: BookRecord): void {
  const parsed = parseBookMarkdown(markdown);
  if (parsed.id !== expected.id) throw new Error("Pre-write validation failed: book identity changed");
  if (parsed.clippings.length !== expected.clippings.length) {
    throw new Error("Pre-write validation failed: a clipping block is missing or malformed");
  }
  const ids = new Set(parsed.clippings.map((clip) => clip.id));
  if (ids.size !== parsed.clippings.length) throw new Error("Pre-write validation failed: duplicate clipping IDs");
}

async function atomicWriteBook(filePath: string, markdown: string, expected: BookRecord): Promise<void> {
  validateBookMarkdown(markdown, expected);
  await atomicWrite(filePath, markdown);
}

export class VaultRepository {
  private sessions = new Map<string, ImportSession>();
  private bookCache: BookRecord[] | null = null;

  constructor(public readonly vaultPath: string) {}

  private get booksPath(): string { return path.join(this.vaultPath, "Books"); }
  private get authorsPath(): string { return path.join(this.vaultPath, "Authors"); }
  private get indexPath(): string { return path.join(this.vaultPath, "_Index"); }
  private get metadataPath(): string { return path.join(this.vaultPath, ".kindle-library"); }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.booksPath, { recursive: true }),
      mkdir(this.authorsPath, { recursive: true }),
      mkdir(this.indexPath, { recursive: true }),
      mkdir(path.join(this.metadataPath, "imports"), { recursive: true }),
      mkdir(path.join(this.metadataPath, "merged"), { recursive: true }),
      mkdir(path.join(this.vaultPath, ".obsidian"), { recursive: true }),
    ]);
  }

  async scanBooks(): Promise<BookRecord[]> {
    if (this.bookCache) return structuredClone(this.bookCache);
    await this.initialize();
    const names = (await readdir(this.booksPath)).filter((name) => name.toLowerCase().endsWith(".md"));
    const books: BookRecord[] = [];
    for (const name of names) {
      const filePath = path.join(this.booksPath, name);
      try {
        books.push(parseBookMarkdown(await readFile(filePath, "utf8"), filePath));
      } catch {
        // Non-app Markdown is left untouched and omitted from the structured index.
      }
    }
    this.bookCache = books.sort((left, right) => left.title.localeCompare(right.title));
    return structuredClone(this.bookCache);
  }

  invalidate(): void { this.bookCache = null; }

  private buildAuthors(books: BookRecord[]): AuthorRecord[] {
    const authors = new Map<string, AuthorRecord>();
    for (const book of books) {
      for (const name of book.authors) {
        const key = normalizedKey(name) || "unknown-author";
        const author = authors.get(key) || { id: `author-${shortHash(key)}`, name, books: [] };
        author.books.push(summary(book));
        authors.set(key, author);
      }
    }
    return [...authors.values()]
      .map((author) => ({ ...author, books: author.books.sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async importHistory(): Promise<ImportHistoryEntry[]> {
    const directory = path.join(this.metadataPath, "imports");
    await mkdir(directory, { recursive: true });
    const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    const entries: ImportHistoryEntry[] = [];
    for (const file of files) {
      try { entries.push(JSON.parse(await readFile(path.join(directory, file), "utf8")) as ImportHistoryEntry); } catch { /* ignore damaged audit entry */ }
    }
    return entries.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }

  async snapshot(): Promise<AppSnapshot> {
    const books = await this.scanBooks();
    return {
      vaultPath: this.vaultPath,
      books: books.map(summary).sort((left, right) => {
        const byRecentActivity = (right.lastClippingAt || "").localeCompare(left.lastClippingAt || "");
        return byRecentActivity || left.title.localeCompare(right.title);
      }),
      authors: this.buildAuthors(books),
      imports: await this.importHistory(),
    };
  }

  async getBook(bookId: string): Promise<BookRecord | null> {
    return (await this.scanBooks()).find((book) => book.id === bookId) || null;
  }

  async previewImport(filePath: string): Promise<ImportPreview> {
    const parsed = parseClippingsFile(await readFile(filePath, "utf8"));
    const books = await this.scanBooks();
    const bySourceKey = new Map<string, BookRecord>();
    const byIdentity = new Map<string, ClippingRecord[]>();
    for (const book of books) {
      for (const sourceKey of book.sourceKeys) bySourceKey.set(sourceKey, book);
      for (const clip of book.clippings) {
        const list = byIdentity.get(clip.identityKey) || [];
        list.push(clip);
        byIdentity.set(clip.identityKey, list);
      }
    }

    let newCount = 0;
    let duplicateCount = 0;
    const conflicts: ImportConflict[] = [];
    const affected = new Set<string>();
    const newBooks = new Set<string>();
    for (const clip of parsed.clippings) {
      const existing = byIdentity.get(clip.identityKey) || [];
      if (existing.some((candidate) => candidate.contentHash === clip.contentHash)) {
        duplicateCount += 1;
      } else if (existing.length) {
        const candidate = existing[0];
        conflicts.push({
          identityKey: clip.identityKey,
          existingId: candidate.id,
          incomingId: clip.id,
          bookTitle: clip.sourceTitle,
          existingContent: candidate.content,
          incomingContent: clip.content,
          resolution: "skip",
        });
      } else {
        newCount += 1;
        affected.add(clip.bookSourceKey);
        if (!bySourceKey.has(clip.bookSourceKey)) newBooks.add(clip.bookSourceKey);
      }
    }

    const token = randomUUID();
    const preview: ImportPreview = {
      token,
      filename: path.basename(filePath),
      total: parsed.clippings.length,
      newCount,
      duplicateCount,
      newBookCount: newBooks.size,
      affectedBookCount: affected.size,
      conflicts,
      warnings: parsed.warnings,
    };
    this.sessions.set(token, { filePath, parsed, preview });
    return preview;
  }

  setConflictResolution(token: string, identityKey: string, resolution: "skip" | "add-separately"): ImportPreview {
    const session = this.sessions.get(token);
    if (!session) throw new Error("The import preview has expired");
    session.preview.conflicts = session.preview.conflicts.map((conflict) =>
      conflict.identityKey === identityKey ? { ...conflict, resolution } : conflict,
    );
    return session.preview;
  }

  private bookPath(book: BookRecord): string {
    return book.vaultPath || path.join(this.booksPath, `${slugify(book.title)}--${book.id.replace(/^book-/, "").slice(0, 8)}.md`);
  }

  private async writeNewBook(book: BookRecord): Promise<void> {
    const filePath = this.bookPath(book);
    book.vaultPath = filePath;
    await atomicWriteBook(filePath, renderBookMarkdown(book), book);
  }

  private async appendToBook(book: BookRecord, additions: ClippingRecord[]): Promise<void> {
    if (!book.vaultPath) throw new Error("Existing book has no vault path");
    let markdown = await readFile(book.vaultPath, "utf8");
    for (const addition of [...additions].sort(compareClippings)) {
      const current = parseBookMarkdown(markdown).clippings;
      const next = current.sort(compareClippings).find((candidate) => compareClippings(addition, candidate) < 0);
      const insertionIndex = next
        ? markdown.indexOf(`<!-- reading-desk:clipping:start id="${next.id}"`)
        : markdown.indexOf(CLIPPINGS_END);
      if (insertionIndex < 0) throw new Error(`Cannot insert into ${book.title}: clipping region is missing`);
      markdown = `${markdown.slice(0, insertionIndex).trimEnd()}\n\n${renderClippingBlock(addition)}\n\n${markdown.slice(insertionIndex).trimStart()}`;
    }
    markdown = replaceFrontmatter(markdown, book);
    await atomicWriteBook(book.vaultPath, markdown, book);
  }

  async commitImport(token: string): Promise<ImportCommitResult> {
    const session = this.sessions.get(token);
    if (!session) throw new Error("The import preview has expired");
    const books = await this.scanBooks();
    const bySourceKey = new Map<string, BookRecord>();
    const byIdentity = new Map<string, ClippingRecord[]>();
    for (const book of books) {
      for (const key of book.sourceKeys) bySourceKey.set(key, book);
      for (const clip of book.clippings) {
        const values = byIdentity.get(clip.identityKey) || [];
        values.push(clip);
        byIdentity.set(clip.identityKey, values);
      }
    }
    const parsedBooks = new Map(session.parsed.books.map((book) => [book.sourceKey, book]));
    const additions = new Map<string, ClippingRecord[]>();
    let duplicates = 0;
    let skippedConflicts = 0;

    for (const incoming of session.parsed.clippings) {
      const matches = byIdentity.get(incoming.identityKey) || [];
      if (matches.some((candidate) => candidate.contentHash === incoming.contentHash)) {
        duplicates += 1;
        continue;
      }
      if (matches.length) {
        const conflict = session.preview.conflicts.find((item) => item.identityKey === incoming.identityKey);
        if (conflict?.resolution !== "add-separately") {
          skippedConflicts += 1;
          continue;
        }
        incoming.id = `clip-${shortHash(`${incoming.identityKey}|${incoming.contentHash}`)}`;
      }
      let book = bySourceKey.get(incoming.bookSourceKey);
      if (!book) {
        const parsedBook = parsedBooks.get(incoming.bookSourceKey);
        if (!parsedBook) continue;
        book = {
          id: `book-${shortHash(incoming.bookSourceKey)}`,
          sourceKeys: [incoming.bookSourceKey],
          title: parsedBook.title,
          authors: parsedBook.authors,
          aliases: parsedBook.sourceTitle === parsedBook.title ? [] : [parsedBook.sourceTitle],
          status: "Reading",
          rating: 0,
          tags: [],
          reflection: "",
          clippings: [],
        };
        books.push(book);
        bySourceKey.set(incoming.bookSourceKey, book);
      }
      const list = additions.get(book.id) || [];
      list.push(incoming);
      additions.set(book.id, list);
      book.clippings.push(incoming);
      const dates = bookDates(book.clippings);
      book.firstClippingAt = dates.first;
      book.lastClippingAt = dates.last;
      const identityList = byIdentity.get(incoming.identityKey) || [];
      identityList.push(incoming);
      byIdentity.set(incoming.identityKey, identityList);
    }

    for (const book of books) {
      const added = additions.get(book.id);
      if (!added?.length) continue;
      if (book.vaultPath) await this.appendToBook(book, added);
      else await this.writeNewBook(book);
    }

    this.invalidate();
    await this.rebuildDerivedNotes(books);
    const imported = [...additions.values()].reduce((sum, values) => sum + values.length, 0);
    const history: ImportHistoryEntry = {
      id: token,
      filename: session.preview.filename,
      importedAt: new Date().toISOString(),
      total: session.preview.total,
      imported,
      duplicates,
      conflicts: session.preview.conflicts.length,
    };
    await atomicWrite(path.join(this.metadataPath, "imports", `${history.importedAt.replace(/[:.]/g, "-")}--${token}.json`), `${JSON.stringify(history, null, 2)}\n`);
    this.sessions.delete(token);
    return { imported, duplicates, skippedConflicts, booksChanged: additions.size };
  }

  async updateBook(bookId: string, patch: BookPatch): Promise<BookRecord> {
    const book = await this.getBook(bookId);
    if (!book?.vaultPath) throw new Error("Book not found");
    Object.assign(book, patch);
    book.title = book.title.trim() || "Untitled";
    book.authors = book.authors.map((author) => author.trim()).filter(Boolean);
    book.tags = [...new Set(book.tags.map((tag) => tag.trim()).filter(Boolean))];
    book.rating = Math.max(0, Math.min(5, Math.round(book.rating)));
    let markdown = await readFile(book.vaultPath, "utf8");
    markdown = replaceFrontmatter(markdown, book);
    if (markdown.includes(BOOK_IDENTITY_START) && markdown.includes(BOOK_IDENTITY_END)) {
      markdown = replaceBetween(markdown, BOOK_IDENTITY_START, BOOK_IDENTITY_END, bookIdentityMarkdown(book));
    }
    if (patch.reflection !== undefined) markdown = replaceBetween(markdown, BOOK_REFLECTION_START, BOOK_REFLECTION_END, book.reflection);
    await atomicWriteBook(book.vaultPath, markdown, book);
    this.invalidate();
    await this.rebuildDerivedNotes(await this.scanBooks());
    return (await this.getBook(bookId)) as BookRecord;
  }

  async updateClipping(bookId: string, clippingId: string, patch: ClippingPatch): Promise<ClippingRecord> {
    const book = await this.getBook(bookId);
    if (!book?.vaultPath) throw new Error("Book not found");
    const clip = book.clippings.find((candidate) => candidate.id === clippingId);
    if (!clip) throw new Error("Clipping not found");
    Object.assign(clip, patch);
    clip.tags = [...new Set(clip.tags.map((tag) => tag.trim()).filter(Boolean))];
    let markdown = await readFile(book.vaultPath, "utf8");
    const blockStart = markdown.indexOf(`<!-- reading-desk:clipping:start id="${clip.id}"`);
    const blockEnd = markdown.indexOf(`<!-- reading-desk:clipping:end id="${clip.id}" -->`, blockStart);
    if (blockStart < 0 || blockEnd < 0) throw new Error("Clipping markers are missing");
    const originalBlock = markdown.slice(blockStart, blockEnd + `<!-- reading-desk:clipping:end id="${clip.id}" -->`.length);
    const updatedBlock = renderClippingBlock(clip);
    markdown = `${markdown.slice(0, blockStart)}${updatedBlock}${markdown.slice(blockEnd + `<!-- reading-desk:clipping:end id="${clip.id}" -->`.length)}`;
    if (!originalBlock) throw new Error("Clipping block could not be read");
    await atomicWriteBook(book.vaultPath, markdown, book);
    this.invalidate();
    return clip;
  }

  async mergeBooks(sourceBookId: string, targetBookId: string): Promise<AppSnapshot> {
    if (sourceBookId === targetBookId) return this.snapshot();
    const books = await this.scanBooks();
    const source = books.find((book) => book.id === sourceBookId);
    const target = books.find((book) => book.id === targetBookId);
    if (!source?.vaultPath || !target?.vaultPath) throw new Error("Both books must exist");
    const existing = new Set(target.clippings.map((clip) => `${clip.identityKey}:${clip.contentHash}`));
    target.clippings.push(...source.clippings.filter((clip) => !existing.has(`${clip.identityKey}:${clip.contentHash}`)));
    target.sourceKeys = [...new Set([...target.sourceKeys, ...source.sourceKeys])];
    target.aliases = [...new Set([...target.aliases, source.title, ...source.aliases])];
    if (source.reflection) target.reflection = [target.reflection, `### From ${source.title}`, source.reflection].filter(Boolean).join("\n\n");
    const dates = bookDates(target.clippings);
    target.firstClippingAt = dates.first;
    target.lastClippingAt = dates.last;
    await atomicWriteBook(target.vaultPath, renderBookMarkdown(target), target);
    const archived = path.join(this.metadataPath, "merged", `${path.basename(source.vaultPath, ".md")}--${Date.now()}.md`);
    await rename(source.vaultPath, archived);
    this.invalidate();
    await this.rebuildDerivedNotes(await this.scanBooks());
    return this.snapshot();
  }

  async mergeAuthors(sourceName: string, targetName: string): Promise<AppSnapshot> {
    const books = await this.scanBooks();
    const sourceKey = normalizedKey(sourceName);
    for (const book of books) {
      if (!book.authors.some((author) => normalizedKey(author) === sourceKey)) continue;
      book.authors = [...new Set(book.authors.map((author) => normalizedKey(author) === sourceKey ? targetName : author))];
      await this.updateBook(book.id, { authors: book.authors });
    }
    return this.snapshot();
  }

  private async managedNote(filePath: string, heading: string, managed: string): Promise<void> {
    let existing = "";
    try { existing = await readFile(filePath, "utf8"); } catch { /* new file */ }
    const region = `${MANAGED_START}\n${managed.trim()}\n${MANAGED_END}`;
    if (!existing) return atomicWrite(filePath, `# ${heading}\n\n${region}\n`);
    if (existing.includes(MANAGED_START) && existing.includes(MANAGED_END)) {
      return atomicWrite(filePath, replaceBetween(existing, MANAGED_START, MANAGED_END, managed));
    }
    return atomicWrite(filePath, `${existing.trimEnd()}\n\n${region}\n`);
  }

  async rebuildDerivedNotes(books: BookRecord[]): Promise<void> {
    await this.initialize();
    const authors = this.buildAuthors(books);
    for (const author of authors) {
      const rows = author.books.map((book) => {
        const original = books.find((candidate) => candidate.id === book.id);
        const relative = original?.vaultPath ? path.relative(this.vaultPath, original.vaultPath).replace(/\\/g, "/").replace(/\.md$/, "") : `Books/${book.title}`;
        return `- [[${relative}|${book.title}]] — ${book.status} · ${book.clippingCount} clippings`;
      }).join("\n");
      await this.managedNote(path.join(this.authorsPath, `${slugify(author.name)}.md`), author.name, rows || "*No books yet.*");
    }
    const libraryRows = books
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((book) => {
        const relative = book.vaultPath ? path.relative(this.vaultPath, book.vaultPath).replace(/\\/g, "/").replace(/\.md$/, "") : `Books/${book.title}`;
        return `- [[${relative}|${book.title}]] — ${book.authors.join(", ")} · ${book.status} · ${book.clippings.length} clippings`;
      })
      .join("\n");
    await this.managedNote(path.join(this.indexPath, "Library.md"), "Kindle Library", libraryRows || "*Import your first My Clippings.txt file to begin.*");
  }

  async isValid(): Promise<boolean> {
    try { return (await stat(this.vaultPath)).isDirectory(); } catch { return false; }
  }
}
