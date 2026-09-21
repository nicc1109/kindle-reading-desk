import { createHash } from "node:crypto";
import type {
  ClippingRecord,
  ClippingType,
  ParseResult,
  ParseWarning,
} from "../../shared/types.js";

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const OTHER_MONTHS: Record<string, number> = {
  januar: 0, janvier: 0, gennaio: 0,
  februar: 1, février: 1, fevrier: 1, febbraio: 1,
  märz: 2, maerz: 2, mars: 2, marzo: 2,
  april: 3, avril: 3, aprile: 3,
  mai: 4, maggio: 4,
  juni: 5, juin: 5, giugno: 5,
  juli: 6, juillet: 6, luglio: 6,
  august: 7, août: 7, aout: 7, agosto: 7,
  september: 8, septembre: 8, settembre: 8,
  oktober: 9, octobre: 9, ottobre: 9,
  november: 10, novembre: 10,
  dezember: 11, décembre: 11, decembre: 11, dicembre: 11,
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .trim();
}

export function normalizedKey(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function shortHash(value: string, size = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, size);
}

function normalizeAuthorDisplay(author: string): string {
  const cleaned = author.replace(/^[;,.\s]+|[;,.\s]+$/g, "").replace(/\s+/g, " ");
  const pieces = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (pieces.length === 2 && pieces[0].split(" ").length <= 3) {
    return `${pieces[1]} ${pieces[0]}`.trim();
  }
  return cleaned;
}

export function parseBookHeading(sourceTitle: string): { title: string; authors: string[] } {
  const heading = normalizeText(sourceTitle);
  const parenthetical = heading.match(/^(.*)\s+\(([^()]*)\)\s*$/);
  if (parenthetical) {
    const candidate = parenthetical[2].trim();
    const editionOnly = /\b(edition|edici[oó]n|volume|vol\.?|kindle|ebook|isbn)\b/i.test(candidate);
    if (!editionOnly && candidate.length <= 140) {
      const authors = candidate
        .split(";")
        .map(normalizeAuthorDisplay)
        .filter(Boolean);
      if (authors.length) return { title: parenthetical[1].trim(), authors };
    }
  }

  const dashIndex = heading.lastIndexOf(" - ");
  if (dashIndex > 0) {
    const candidate = heading.slice(dashIndex + 3).trim();
    if (candidate.length <= 80 && candidate.split(/\s+/).length <= 8) {
      return { title: heading.slice(0, dashIndex).trim(), authors: [normalizeAuthorDisplay(candidate)] };
    }
  }

  return { title: heading, authors: ["Unknown author"] };
}

function clippingType(metadata: string): ClippingType {
  if (/\b(subrayado|resaltado|highlight|markierung|surlignement|evidenziazione)\b/iu.test(metadata)) return "highlight";
  if (/\b(nota|note|notiz)\b/iu.test(metadata)) return "note";
  if (/\b(marcador|bookmark|lesezeichen|signet|segnalibro)\b/iu.test(metadata)) return "bookmark";
  return "unknown";
}

function parseRange(match: RegExpMatchArray | null): [string | undefined, string | undefined] {
  if (!match) return [undefined, undefined];
  return [match[1], match[2] || match[1]];
}

function parseNumberRange(match: RegExpMatchArray | null): [number | undefined, number | undefined] {
  if (!match) return [undefined, undefined];
  const first = Number(match[1]);
  const second = Number(match[2] || match[1]);
  return [Number.isFinite(first) ? first : undefined, Number.isFinite(second) ? second : undefined];
}

function dateToIso(year: number, month: number, day: number, time: string, period?: string): string | undefined {
  const [rawHour, minute, second] = time.split(":").map(Number);
  if ([rawHour, minute, second].some((value) => !Number.isFinite(value))) return undefined;
  let hour = rawHour;
  if (period?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (period?.toLowerCase() === "am" && hour === 12) hour = 0;
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseKindleDate(raw: string): string | undefined {
  const value = normalizeText(raw);
  const spanish = value.match(/(?:[a-záéíóúñ]+,\s*)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\s+(\d{1,2}:\d{2}:\d{2})/i);
  if (spanish) {
    const month = SPANISH_MONTHS[spanish[2].toLowerCase()];
    if (month !== undefined) return dateToIso(Number(spanish[3]), month, Number(spanish[1]), spanish[4]);
  }

  const english = value.match(/(?:[a-z]+,\s*)?([a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}:\d{2}:\d{2})\s*(am|pm)?/i);
  if (english) {
    const month = ENGLISH_MONTHS[english[1].toLowerCase()];
    if (month !== undefined) return dateToIso(Number(english[3]), month, Number(english[2]), english[4], english[5]);
  }
  const european = value.match(/(?:[\p{L}.]+,?\s*)?(\d{1,2})\.?\s+([\p{L}]+)\s+(\d{4})\s+(\d{1,2}:\d{2}:\d{2})/iu);
  if (european) {
    const monthKey = european[2].toLocaleLowerCase("en");
    const month = OTHER_MONTHS[monthKey] ?? OTHER_MONTHS[normalizedKey(monthKey)];
    if (month !== undefined) return dateToIso(Number(european[3]), month, Number(european[1]), european[4]);
  }
  return undefined;
}

function romanToNumber(value?: string): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (!/^[ivxlcdm]+$/i.test(value)) return undefined;
  const scores: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  let previous = 0;
  for (const character of value.toLowerCase().split("").reverse()) {
    const current = scores[character];
    total += current < previous ? -current : current;
    previous = current;
  }
  return total;
}

export function compareClippings(left: ClippingRecord, right: ClippingRecord): number {
  const leftPage = romanToNumber(left.pageStart);
  const rightPage = romanToNumber(right.pageStart);
  if (leftPage !== undefined && rightPage !== undefined && leftPage !== rightPage) return leftPage - rightPage;
  if (left.locationStart !== undefined && right.locationStart !== undefined && left.locationStart !== right.locationStart) {
    return left.locationStart - right.locationStart;
  }
  if (leftPage !== undefined && rightPage === undefined) return -1;
  if (rightPage !== undefined && leftPage === undefined) return 1;
  if (left.addedAt && right.addedAt && left.addedAt !== right.addedAt) return left.addedAt.localeCompare(right.addedAt);
  return left.sourceIndex - right.sourceIndex;
}

export function parseClippingsFile(input: string): ParseResult {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/^==========[\t ]*$/gm)
    .map((block) => block.replace(/^\uFEFF/, "").trim())
    .filter(Boolean);

  const clippings: ClippingRecord[] = [];
  const warnings: ParseWarning[] = [];
  const books = new Map<string, { sourceKey: string; sourceTitle: string; title: string; authors: string[] }>();

  blocks.forEach((block, index) => {
    const lines = block.split("\n");
    const sourceTitle = normalizeText(lines[0] || "");
    const metadataIndex = lines.findIndex((line, lineIndex) => lineIndex > 0 && line.trim().startsWith("- "));
    if (!sourceTitle || metadataIndex < 0) {
      warnings.push({ block: index + 1, title: sourceTitle || undefined, message: "Missing title or Kindle metadata line" });
      return;
    }

    const metadata = normalizeText(lines[metadataIndex]);
    const content = lines.slice(metadataIndex + 1).join("\n").trim();
    const type = clippingType(metadata);
    const [pageStart, pageEnd] = parseRange(metadata.match(/(?:p[aá]gina|page|seite|pagina)\s+([ivxlcdm\d]+)(?:-([ivxlcdm\d]+))?/iu));
    const [locationStart, locationEnd] = parseNumberRange(metadata.match(/(?:posici[oó]n|location|position|emplacement|posizione)\s+(\d+)(?:-(\d+))?/iu));
    const dateMatch = metadata.match(/(?:A[ñn]adido el|Added on|Hinzugef[uü]gt am|Ajout[ée] le|Aggiunto il)\s+(.+)$/iu);
    const addedAtRaw = dateMatch?.[1]?.trim();
    const addedAt = addedAtRaw ? parseKindleDate(addedAtRaw) : undefined;
    const parsedBook = parseBookHeading(sourceTitle);
    const bookSourceKey = `book-source-${shortHash(normalizedKey(sourceTitle))}`;
    const contentHash = shortHash(normalizeText(content));
    const identityBasis = [
      bookSourceKey,
      type,
      pageStart || "",
      pageEnd || "",
      locationStart ?? "",
      locationEnd ?? "",
      normalizedKey(addedAtRaw || ""),
      !pageStart && locationStart === undefined && !addedAtRaw ? contentHash : "",
    ].join("|");
    const identityKey = shortHash(identityBasis, 24);

    if (type === "unknown") {
      warnings.push({ block: index + 1, title: sourceTitle, message: `Unrecognized clipping type: ${metadata}` });
    }
    if (!addedAt && addedAtRaw) {
      warnings.push({ block: index + 1, title: sourceTitle, message: `Could not parse date: ${addedAtRaw}` });
    }
    if (!content && type !== "bookmark") {
      warnings.push({ block: index + 1, title: sourceTitle, message: `${type === "highlight" ? "Highlight" : "Note"} has no text in the source file` });
    }
    if (parsedBook.authors.length === 1 && parsedBook.authors[0] === "Unknown author") {
      warnings.push({ block: index + 1, title: sourceTitle, message: "Could not infer the author from the book heading" });
    }

    books.set(bookSourceKey, { sourceKey: bookSourceKey, sourceTitle, ...parsedBook });
    clippings.push({
      id: `clip-${shortHash(identityKey)}`,
      identityKey,
      contentHash,
      bookSourceKey,
      sourceTitle,
      type,
      pageStart,
      pageEnd,
      locationStart,
      locationEnd,
      addedAt,
      addedAtRaw,
      content,
      favorite: false,
      tags: [],
      reflection: "",
      sourceIndex: index,
    });
  });

  return { clippings, books: [...books.values()], warnings };
}
