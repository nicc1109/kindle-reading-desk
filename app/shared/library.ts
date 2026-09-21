import type { BookStatus, BookSummary } from "./types.js";

function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

export function bookSearchKey(book: BookSummary): string {
  return normalizeSearch([book.title, ...book.authors, ...book.tags].join(" "));
}

export function filterBookSummaries(
  books: BookSummary[],
  query: string,
  status: BookStatus | "All",
): BookSummary[] {
  const search = normalizeSearch(query);
  return books.filter((book) => (
    (!search || bookSearchKey(book).includes(search))
    && (status === "All" || book.status === status)
  ));
}
