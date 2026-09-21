import { useMemo, useState } from "react";
import { MagnifyingGlass, SidebarSimple, SlidersHorizontal } from "@phosphor-icons/react";
import type { BookStatus, BookSummary } from "../../shared/types";
import { filterBookSummaries } from "../../shared/library";
import { StatusDot } from "../components/StatusDot";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { useVirtualWindow } from "../hooks/useVirtualWindow";

const BOOK_ROW_HEIGHT = 68;

export function LibraryPanel({ books, selectedId, onSelect, onHide }: {
  books: BookSummary[];
  selectedId?: string;
  onSelect: (bookId: string) => void;
  onHide: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [status, setStatus] = useState<BookStatus | "All">("All");
  const filtered = useMemo(() => filterBookSummaries(books, query, status), [books, query, status]);
  const activeIndex = filtered.findIndex((book) => book.id === selectedId);
  const virtual = useVirtualWindow({ count: filtered.length, rowHeight: BOOK_ROW_HEIGHT, fallbackHeight: 680 });
  const roving = useRovingFocus<HTMLButtonElement>({
    count: filtered.length,
    activeIndex,
    labels: filtered.map((book) => book.title),
    orientation: "vertical",
    onActivate: (index) => { virtual.scrollToIndex(index); onSelect(filtered[index].id); },
  });

  return (
    <section className="library-panel" aria-label="Books">
      <div className="library-search-row">
        <label className="search-field">
          <MagnifyingGlass size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search books" aria-label="Search books" />
        </label>
        <button className={`icon-button${filterOpen ? " selected" : ""}`} onClick={() => setFilterOpen((value) => !value)} aria-label="Filter books"><SlidersHorizontal size={21} /></button>
        <button className="icon-button" onClick={onHide} aria-label="Hide books list" title="Hide books list"><SidebarSimple size={21} /></button>
      </div>
      {filterOpen && (
        <div className="filter-strip" aria-label="Filter by status">
          {(["All", "Reading", "Finished", "Paused", "Reference"] as const).map((value) => (
            <button key={value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{value}</button>
          ))}
        </div>
      )}
      <div className="book-list-heading"><span>Title</span><span>Status</span><span>Clippings</span></div>
      <div ref={virtual.containerRef} onScroll={virtual.onScroll} className="book-list" role="listbox" aria-label="Book library">
        <div className="book-list-window" style={{ height: `${virtual.totalHeight}px` }}>
        {filtered.slice(virtual.start, virtual.end).map((book, offset) => {
          const index = virtual.start + offset;
          return (
          <button
            {...roving.itemProps(index)}
            key={book.id}
            className={`book-row${selectedId === book.id ? " selected" : ""}`}
            style={{ top: `${index * BOOK_ROW_HEIGHT}px` }}
            onClick={() => onSelect(book.id)}
            role="option"
            aria-selected={selectedId === book.id}
            aria-posinset={index + 1}
            aria-setsize={filtered.length}
          >
            <span className="book-identity"><strong>{book.title}</strong><small>{book.authors.join(", ")}</small></span>
            <span className="book-status"><StatusDot status={book.status} />{book.status}</span>
            <span className="book-count">{book.clippingCount.toLocaleString()}</span>
          </button>
          );
        })}
        </div>
        {!filtered.length && <div className="empty-list">No books match this search.</div>}
      </div>
      <div className="library-total"><span>{filtered.length} of {books.length} books</span><span>Most recent first</span></div>
    </section>
  );
}
