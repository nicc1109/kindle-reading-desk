import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowSquareOut,
  BookOpen,
  Books,
  BookmarkSimple,
  CaretDown,
  ChartBar,
  CheckCircle,
  DownloadSimple,
  FileText,
  FolderOpen,
  Gear,
  MagnifyingGlass,
  NotePencil,
  Question,
  SlidersHorizontal,
  SidebarSimple,
  Star,
  Tag,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  AppSnapshot,
  AppUpdateState,
  AuthorRecord,
  BookPatch,
  BookRecord,
  BookStatus,
  BookSummary,
  ClippingRecord,
  ImportPreview,
  ReadingDeskApi,
} from "../shared/types";
import packageMetadata from "../package.json";
import { demoApi } from "./demo";

type Route = "library" | "authors" | "imports" | "insights" | "settings" | "help";
type BookTab = "highlights" | "reflection" | "details";

const api: ReadingDeskApi = window.readingDesk || demoApi;
const appVersion = packageMetadata.version;
const PRIMARY_NAVIGATION_DEFAULT = 184;
const PRIMARY_NAVIGATION_MIN = 160;
const PRIMARY_NAVIGATION_MAX = 320;
const PRIMARY_NAVIGATION_COMPACT = 74;
const PRIMARY_NAVIGATION_COMPACT_BREAKPOINT = 1320;
const BOOK_LIST_DEFAULT = 410;
const BOOK_LIST_MIN = 280;
const BOOK_LIST_MAX = 600;
const BOOK_WORKSPACE_MIN = 550;
const PRIMARY_NAVIGATION_STORAGE_KEY = "reading-desk.primary-navigation-width";
const BOOK_LIST_STORAGE_KEY = "reading-desk.book-list-width";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function readStoredWidth(key: string, fallback: number, minimum: number, maximum: number): number {
  try {
    const value = Number.parseInt(window.localStorage.getItem(key) || "", 10);
    return Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
  } catch {
    return fallback;
  }
}

function PanelResizer({ label, value, minimum, maximum, onChange, className }: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
  className: string;
}) {
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => () => document.body.classList.remove("resizing-panels"), []);

  return (
    <div
      className={`panel-resizer ${className}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        dragStart.current = { x: event.clientX, width: value };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        document.body.classList.add("resizing-panels");
      }}
      onPointerMove={(event) => {
        if (!dragStart.current) return;
        onChange(clamp(dragStart.current.width + event.clientX - dragStart.current.x, minimum, maximum));
      }}
      onPointerUp={(event) => {
        dragStart.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        document.body.classList.remove("resizing-panels");
      }}
      onPointerCancel={() => {
        dragStart.current = null;
        document.body.classList.remove("resizing-panels");
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const step = event.shiftKey ? 24 : 8;
        onChange(clamp(value + (event.key === "ArrowRight" ? step : -step), minimum, maximum));
      }}
    />
  );
}

function formatDate(value?: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function locationLabel(clip: ClippingRecord): string {
  const values: string[] = [];
  if (clip.pageStart) values.push(`Page ${clip.pageStart}${clip.pageEnd && clip.pageEnd !== clip.pageStart ? `–${clip.pageEnd}` : ""}`);
  if (clip.locationStart !== undefined) values.push(`Location ${clip.locationStart}${clip.locationEnd !== clip.locationStart ? `–${clip.locationEnd}` : ""}`);
  return values.join(" · ") || "No location";
}

function NavButton({ active, icon, label, onClick }: { active?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className={`nav-button${active ? " active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      {icon}<span>{label}</span>
    </button>
  );
}

function Sidebar({ route, setRoute, vaultPath, onHide }: { route: Route; setRoute: (route: Route) => void; vaultPath: string; onHide: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="Reading Desk">
        <BookOpen size={31} weight="light" />
        <button className="panel-toggle" onClick={onHide} aria-label="Hide main menu" title="Hide main menu"><SidebarSimple size={20} /></button>
      </div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <NavButton active={route === "library"} icon={<Books size={23} />} label="Library" onClick={() => setRoute("library")} />
        <NavButton active={route === "authors"} icon={<User size={23} />} label="Authors" onClick={() => setRoute("authors")} />
        <NavButton active={route === "imports"} icon={<DownloadSimple size={23} />} label="Imports" onClick={() => setRoute("imports")} />
      </nav>
      <nav className="secondary-nav" aria-label="Secondary navigation">
        <NavButton active={route === "insights"} icon={<ChartBar size={23} />} label="Reading insights" onClick={() => setRoute("insights")} />
        <NavButton active={route === "settings"} icon={<Gear size={23} />} label="Settings" onClick={() => setRoute("settings")} />
        <NavButton active={route === "help"} icon={<Question size={23} />} label="Help" onClick={() => setRoute("help")} />
      </nav>
      <div className="vault-status">
        <div><CheckCircle size={17} weight="fill" /><span>Vault up to date</span></div>
        <p>Obsidian vault</p>
        <strong title={vaultPath}>{vaultPath.split(/[\\/]/).at(-1)}</strong>
      </div>
    </aside>
  );
}

function StatusDot({ status }: { status: BookStatus }) {
  return <span className={`status-dot status-${status.toLowerCase()}`} aria-hidden="true" />;
}

function LibraryPanel({ books, selectedId, onSelect, onHide }: { books: BookSummary[]; selectedId?: string; onSelect: (bookId: string) => void; onHide: () => void }) {
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [status, setStatus] = useState<BookStatus | "All">("All");
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return books.filter((book) => {
      const matchesSearch = !search || (book.searchText || `${book.title} ${book.authors.join(" ")} ${book.tags.join(" ")}`).includes(search);
      return matchesSearch && (status === "All" || book.status === status);
    });
  }, [books, query, status]);

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
      <div className="book-list" role="listbox" aria-label="Book library">
        {filtered.map((book) => (
          <button
            key={book.id}
            className={`book-row${selectedId === book.id ? " selected" : ""}`}
            onClick={() => onSelect(book.id)}
            role="option"
            aria-selected={selectedId === book.id}
          >
            <span className="book-identity"><strong>{book.title}</strong><small>{book.authors.join(", ")}</small></span>
            <span className="book-status"><StatusDot status={book.status} />{book.status}</span>
            <span className="book-count">{book.clippingCount.toLocaleString()}</span>
          </button>
        ))}
        {!filtered.length && <div className="empty-list">No books match this search.</div>}
      </div>
      <div className="library-total"><span>{filtered.length} of {books.length} books</span><span>Most recent first</span></div>
    </section>
  );
}

function ClippingTypeIcon({ type }: { type: ClippingRecord["type"] }) {
  if (type === "note") return <NotePencil size={15} />;
  if (type === "bookmark") return <BookmarkSimple size={15} />;
  return <FileText size={15} />;
}

function HighlightList({ clippings, selectedId, onSelect, onFavorite }: {
  clippings: ClippingRecord[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onFavorite: (clip: ClippingRecord) => void;
}) {
  return (
    <section className="highlight-column" aria-label="Highlights and notes">
      <div className="highlight-summary">
        <strong>{clippings.length.toLocaleString()} highlights & notes</strong>
        <span>Excerpts · Book order ↑</span>
      </div>
      <div className="highlight-list" role="listbox" aria-label="Clippings in book order">
        {clippings.map((clip) => (
          <div
            key={clip.id}
            className={`highlight-row${selectedId === clip.id ? " selected" : ""}`}
            onClick={() => onSelect(clip.id)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(clip.id);
              }
            }}
            role="option"
            tabIndex={0}
            aria-selected={selectedId === clip.id}
          >
            <span className="highlight-meta"><span><ClippingTypeIcon type={clip.type} />{locationLabel(clip)}</span>
              <button
                type="button"
                className="favorite-hit"
                aria-label={clip.favorite ? "Remove favorite" : "Add favorite"}
                onClick={(event) => { event.stopPropagation(); onFavorite(clip); }}
              ><Star size={18} weight={clip.favorite ? "fill" : "regular"} /></button>
            </span>
            <span className="highlight-excerpt">{clip.content || "Kindle bookmark"}</span>
            {clip.reflection && <small className="has-reflection"><NotePencil size={13} /> Note added</small>}
          </div>
        ))}
      </div>
      <div className="highlight-total">{clippings.length ? `1–${clippings.length} of ${clippings.length}` : "No clippings"}</div>
    </section>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <span className="star-rating" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button key={rating} onClick={() => onChange(rating)} aria-label={`Rate ${rating} stars`}><Star size={19} weight={rating <= value ? "fill" : "regular"} /></button>
      ))}
    </span>
  );
}

export function ReaderPane({ book, clip, onSave, onNext, onPrevious }: {
  book: BookRecord;
  clip: ClippingRecord;
  onSave: (patch: ClippingPatchLike) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const [reflection, setReflection] = useState(clip.reflection);
  const [tags, setTags] = useState(clip.tags.join(", "));
  const [notesOpen, setNotesOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const savePromise = useRef<Promise<boolean> | null>(null);
  const activeClipId = useRef(clip.id);
  useEffect(() => {
    const clippingChanged = activeClipId.current !== clip.id;
    setReflection(clip.reflection);
    setTags(clip.tags.join(", "));
    if (clippingChanged) {
      activeClipId.current = clip.id;
      setNotesOpen(false);
    }
    setSaveState("saved");
    savePromise.current = null;
  }, [clip.id, clip.reflection, clip.tags]);

  const save = async (): Promise<boolean> => {
    if (savePromise.current) return savePromise.current;
    if (saveState === "saved") return true;
    const pending = (async () => {
      setSaveState("saving");
      try {
        await onSave({ reflection, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
        setSaveState("saved");
        return true;
      } catch {
        setSaveState("error");
        return false;
      } finally {
        savePromise.current = null;
      }
    })();
    savePromise.current = pending;
    return pending;
  };
  const closeNotes = async () => {
    if (await save()) setNotesOpen(false);
  };
  const statusText = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Could not save" : "Saved to vault";
  const reflectionWords = reflection.trim() ? reflection.trim().split(/\s+/).length : 0;
  const notesId = `clipping-notes-${clip.id}`;

  return (
    <section className="reader-pane" aria-label="Selected clipping">
      <div className="reader-provenance"><span><strong>Full passage</strong> · {locationLabel(clip)}</span><span>Added {formatDate(clip.addedAt)}</span></div>
      <article className="quote-card">
        <span className="quote-rule" aria-hidden="true" />
        <blockquote>{clip.content || "This Kindle bookmark does not contain text."}</blockquote>
        <cite>— {book.title}, {book.authors.join(" & ")}</cite>
      </article>
      <div className={`reflection-editor${notesOpen ? " open" : ""}`}>
        <div className="editor-heading">
          <button
            type="button"
            className="notes-toggle"
            aria-expanded={notesOpen}
            aria-controls={notesId}
            onClick={() => { if (notesOpen) void closeNotes(); else setNotesOpen(true); }}
          >
            <span><NotePencil size={17} weight={clip.reflection ? "fill" : "regular"} />Notes</span>
            <CaretDown size={16} aria-hidden="true" />
          </button>
          {notesOpen && <span className={`save-state save-state-${saveState}`} role="status" aria-live="polite">{statusText}</span>}
        </div>
        {notesOpen && <div id={notesId} className="notes-editor-content">
          <textarea value={reflection} onChange={(event) => { setReflection(event.target.value); setSaveState("dirty"); }} onBlur={() => void save()} placeholder="Write a note…" aria-label="Notes" />
          <div className="editor-tags">
            <Tag size={15} /><input value={tags} onChange={(event) => { setTags(event.target.value); setSaveState("dirty"); }} onBlur={() => void save()} placeholder="Add tags, separated by commas" aria-label="Note tags" />
          </div>
          <div className="editor-footer"><span>{reflectionWords} {reflectionWords === 1 ? "word" : "words"}</span><button className="primary-button" disabled={saveState === "saved" || saveState === "saving"} onClick={() => void save()}>{saveState === "saving" ? "Saving…" : "Save note"}</button></div>
        </div>}
      </div>
      <div className="reader-pagination"><button onClick={onPrevious}>← Previous</button><button onClick={onNext}>Next →</button></div>
    </section>
  );
}

type ClippingPatchLike = { reflection?: string; tags?: string[]; favorite?: boolean };

function BookReflection({ book, onSave }: { book: BookRecord; onSave: (reflection: string) => Promise<void> }) {
  const [value, setValue] = useState(book.reflection);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  useEffect(() => { setValue(book.reflection); setSaveState("saved"); }, [book.id, book.reflection]);
  const save = async () => {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      await onSave(value);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };
  const addPrompt = (heading: string) => {
    setValue((current) => `${current.trimEnd()}${current.trim() ? "\n\n" : ""}## ${heading}\n\n`);
    setSaveState("dirty");
  };
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const statusText = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Could not save" : "Saved to vault";
  return (
    <section className="book-reflection-view" id="book-panel-reflection" role="tabpanel" aria-labelledby="book-tab-reflection">
      <div className="longform-heading"><span>BOOK NOTES</span><h2>Make the book useful.</h2><p>Capture the argument in your own words, what you question, and the ideas you want to carry forward.</p></div>
      <div className="reflection-prompts" aria-label="Reflection prompts">
        <span>Start with</span>
        <button type="button" onClick={() => addPrompt("Core argument")}>Core argument</button>
        <button type="button" onClick={() => addPrompt("What I question")}>What I question</button>
        <button type="button" onClick={() => addPrompt("Connections")}>Connections</button>
      </div>
      <div className="longform-editor">
        <div className="longform-editor-heading"><label htmlFor="book-reflection">Book reflection</label><span className={`save-state save-state-${saveState}`} role="status" aria-live="polite">{statusText}</span></div>
        <textarea id="book-reflection" value={value} onChange={(event) => { setValue(event.target.value); setSaveState("dirty"); }} onBlur={() => void save()} placeholder="Write the ideas you want to remember…" />
        <div className="editor-footer"><span>{wordCount} {wordCount === 1 ? "word" : "words"} · Markdown supported</span><button className="primary-button" disabled={saveState === "saved" || saveState === "saving"} onClick={() => void save()}>{saveState === "saving" ? "Saving…" : "Save reflection"}</button></div>
      </div>
    </section>
  );
}

function BookDetails({ book, books, onSave, onMerge }: {
  book: BookRecord;
  books: BookSummary[];
  onSave: (patch: BookPatch) => Promise<void>;
  onMerge: (targetId: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(book.title);
  const [authors, setAuthors] = useState(book.authors.join("; "));
  const [tags, setTags] = useState(book.tags.join(", "));
  const [status, setStatus] = useState(book.status);
  const [startedAt, setStartedAt] = useState(book.startedAt?.slice(0, 10) || "");
  const [finishedAt, setFinishedAt] = useState(book.finishedAt?.slice(0, 10) || "");
  const [mergeTarget, setMergeTarget] = useState("");
  useEffect(() => {
    setTitle(book.title); setAuthors(book.authors.join("; ")); setTags(book.tags.join(", ")); setStatus(book.status);
    setStartedAt(book.startedAt?.slice(0, 10) || ""); setFinishedAt(book.finishedAt?.slice(0, 10) || "");
  }, [book.id, book.title, book.authors, book.tags, book.status, book.startedAt, book.finishedAt]);
  return (
    <section className="details-view" id="book-panel-details" role="tabpanel" aria-labelledby="book-tab-details">
      <div className="details-grid">
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Authors <small>Separate multiple authors with semicolons</small><input value={authors} onChange={(event) => setAuthors(event.target.value)} /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as BookStatus)}>{["Reading", "Finished", "Paused", "Reference"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        <label>Started<input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></label>
        <label>Finished<input type="date" value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} /></label>
      </div>
      <button className="primary-button" onClick={() => void onSave({ title, authors: authors.split(";").map((value) => value.trim()).filter(Boolean), tags: tags.split(",").map((value) => value.trim()).filter(Boolean), status, startedAt: startedAt || undefined, finishedAt: finishedAt || undefined })}>Save book details</button>
      <div className="merge-box"><div><strong>Merge a duplicate book</strong><p>Its unique clippings and aliases will move into this book. The original note is archived.</p></div><div className="merge-controls"><select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Choose duplicate…</option>{books.filter((candidate) => candidate.id !== book.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button className="secondary-button" disabled={!mergeTarget} onClick={() => void onMerge(mergeTarget)}>Merge into this book</button></div></div>
    </section>
  );
}

function BookWorkspace({ book, books, authors, onAuthor, onRefresh, onOpenBook, mainMenuVisible, booksVisible, onToggleMainMenu, onToggleBooks }: {
  book: BookRecord;
  books: BookSummary[];
  authors: AuthorRecord[];
  onAuthor: (name: string) => void;
  onRefresh: () => Promise<void>;
  onOpenBook: (bookId: string) => void;
  mainMenuVisible: boolean;
  booksVisible: boolean;
  onToggleMainMenu: () => void;
  onToggleBooks: () => void;
}) {
  const [tab, setTab] = useState<BookTab>("highlights");
  const [selectedClipId, setSelectedClipId] = useState(book.clippings[0]?.id);
  const [localBook, setLocalBook] = useState(book);
  useEffect(() => { setLocalBook(book); setSelectedClipId(book.clippings[0]?.id); setTab("highlights"); }, [book.id]);
  const selectedIndex = Math.max(0, localBook.clippings.findIndex((clip) => clip.id === selectedClipId));
  const selectedClip = localBook.clippings[selectedIndex];
  const updateClip = async (clipId: string, patch: ClippingPatchLike) => {
    const updated = await api.updateClipping(localBook.id, clipId, patch);
    setLocalBook((current) => ({ ...current, clippings: current.clippings.map((clip) => clip.id === clipId ? updated : clip) }));
  };
  const updateBook = async (patch: BookPatch) => {
    const updated = await api.updateBook(localBook.id, patch);
    setLocalBook(updated); await onRefresh();
  };
  return (
    <section className="book-workspace">
      <header className="book-header">
        <div><h1>{localBook.title}</h1><div className="author-links">{localBook.authors.map((name, index) => { const count = authors.find((author) => author.name === name)?.books.length || 1; return <span key={name}>{index > 0 && <span className="author-separator"> &amp; </span>}<button className="author-link" onClick={() => onAuthor(name)}>{name} · {count} {count === 1 ? "book" : "books"}</button></span>; })}</div></div>
        <div className="book-actions">
          <div className="layout-actions" aria-label="Layout controls">
            <button className={`icon-button${mainMenuVisible ? " selected" : ""}`} onClick={onToggleMainMenu} aria-label={`${mainMenuVisible ? "Hide" : "Show"} main menu`} title={`${mainMenuVisible ? "Hide" : "Show"} main menu`}><SidebarSimple size={21} /></button>
            <button className={`icon-button book-list-toggle${booksVisible ? " selected" : ""}`} onClick={onToggleBooks} aria-label={`${booksVisible ? "Hide" : "Show"} books list`} title={`${booksVisible ? "Hide" : "Show"} books list`}><Books size={21} /></button>
          </div>
          <button className="secondary-button obsidian-button" onClick={() => void api.openBookInObsidian(localBook.id)}>Open in Obsidian <ArrowSquareOut size={18} /></button>
          <button className="icon-button" aria-label="Show book file" title="Show book file" onClick={() => void api.showBookInFolder(localBook.id)}><FolderOpen size={21} /></button>
        </div>
      </header>
      <div className="book-facts">
        <label className="status-select"><StatusDot status={localBook.status} /><select value={localBook.status} onChange={(event) => void updateBook({ status: event.target.value as BookStatus })}>{["Reading", "Finished", "Paused", "Reference"].map((value) => <option key={value}>{value}</option>)}</select><CaretDown size={14} /></label>
        <span className="vertical-rule" />
        <StarRating value={localBook.rating} onChange={(rating) => void updateBook({ rating })} />
        <span className="vertical-rule" />
        <div className="tag-pills">{localBook.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      </div>
      <div className="book-tabs" role="tablist">
        <button id="book-tab-highlights" role="tab" aria-selected={tab === "highlights"} aria-controls="book-panel-highlights" tabIndex={tab === "highlights" ? 0 : -1} className={tab === "highlights" ? "active" : ""} onClick={() => setTab("highlights")}>Highlights</button>
        <button id="book-tab-reflection" role="tab" aria-selected={tab === "reflection"} aria-controls="book-panel-reflection" tabIndex={tab === "reflection" ? 0 : -1} className={tab === "reflection" ? "active" : ""} onClick={() => setTab("reflection")}>Book reflection</button>
        <button id="book-tab-details" role="tab" aria-selected={tab === "details"} aria-controls="book-panel-details" tabIndex={tab === "details" ? 0 : -1} className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button>
      </div>
      {tab === "highlights" && selectedClip && (
        <div className="book-reading-grid" id="book-panel-highlights" role="tabpanel" aria-labelledby="book-tab-highlights">
          <HighlightList clippings={localBook.clippings} selectedId={selectedClip.id} onSelect={setSelectedClipId} onFavorite={(clip) => void updateClip(clip.id, { favorite: !clip.favorite })} />
          <ReaderPane book={localBook} clip={selectedClip} onSave={(patch) => updateClip(selectedClip.id, patch)} onNext={() => setSelectedClipId(localBook.clippings[Math.min(localBook.clippings.length - 1, selectedIndex + 1)]?.id)} onPrevious={() => setSelectedClipId(localBook.clippings[Math.max(0, selectedIndex - 1)]?.id)} />
        </div>
      )}
      {tab === "highlights" && !selectedClip && <div className="empty-workspace"><FileText size={36} /><h2>No clippings yet</h2><p>Import a Kindle My Clippings.txt file to fill this book.</p></div>}
      {tab === "reflection" && <BookReflection book={localBook} onSave={(reflection) => updateBook({ reflection })} />}
      {tab === "details" && <BookDetails book={localBook} books={books} onSave={updateBook} onMerge={async (sourceId) => { await api.mergeBooks(sourceId, localBook.id); await onRefresh(); onOpenBook(localBook.id); }} />}
    </section>
  );
}

function AuthorsView({ authors, initialName, onOpenBook, onMerged }: { authors: AuthorRecord[]; initialName?: string; onOpenBook: (bookId: string) => void; onMerged: () => Promise<void> }) {
  const initial = authors.find((author) => author.name === initialName);
  const [selectedId, setSelectedId] = useState(initial?.id || authors[0]?.id);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);
  useEffect(() => {
    const next = authors.find((author) => author.name === initialName);
    if (next) setSelectedId(next.id);
  }, [authors, initialName]);
  const selected = authors.find((author) => author.id === selectedId) || authors[0];
  const merge = async () => {
    if (!selected || !mergeTarget) return;
    setMerging(true);
    await api.mergeAuthors(selected.name, mergeTarget);
    const target = authors.find((author) => author.name === mergeTarget);
    if (target) setSelectedId(target.id);
    setMergeTarget("");
    await onMerged();
    setMerging(false);
  };
  return (
    <main className="section-view authors-view">
      <header className="section-header"><span>AUTHORS</span><h1>Your authors</h1><p>See every book by the same voice in one place.</p></header>
      <div className="authors-layout">
        <div className="author-list">{authors.map((author) => <button key={author.id} className={selected?.id === author.id ? "selected" : ""} onClick={() => setSelectedId(author.id)}><span>{author.name}</span><small>{author.books.length} {author.books.length === 1 ? "book" : "books"}</small></button>)}</div>
        {selected && <section className="author-detail"><div className="author-monogram" aria-hidden="true">{selected.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><h2>{selected.name}</h2><p>{selected.books.length} {selected.books.length === 1 ? "book" : "books"} · {selected.books.reduce((sum, book) => sum + book.clippingCount, 0).toLocaleString()} clippings</p><div className="author-books">{selected.books.map((book) => <button key={book.id} onClick={() => onOpenBook(book.id)}><div><strong>{book.title}</strong><span>{book.clippingCount.toLocaleString()} clippings</span></div><span className="book-status"><StatusDot status={book.status} />{book.status}</span></button>)}</div><div className="author-merge"><strong>Merge a duplicate author</strong><p>Move every book from {selected.name} to the corrected author name.</p><div><select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Choose corrected author…</option>{authors.filter((author) => author.id !== selected.id).map((author) => <option key={author.id} value={author.name}>{author.name}</option>)}</select><button className="secondary-button" disabled={!mergeTarget || merging} onClick={() => void merge()}>{merging ? "Merging…" : "Merge author"}</button></div></div></section>}
      </div>
    </main>
  );
}

function ImportsView({ snapshot, onCommitted }: { snapshot: AppSnapshot; onCommitted: () => Promise<void> }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const choose = async () => { setBusy(true); setMessage(""); setPreview(await api.chooseImport()); setBusy(false); };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    const result = await api.commitImport(preview.token);
    setMessage(`${result.imported} new clippings added across ${result.booksChanged} books. ${result.duplicates} duplicates left untouched.`);
    setPreview(null); await onCommitted(); setBusy(false);
  };
  const resolveConflict = async (identityKey: string, resolution: "skip" | "add-separately") => {
    if (!preview) return;
    const token = preview.token;
    setPreview((current) => current ? { ...current, conflicts: current.conflicts.map((conflict) => conflict.identityKey === identityKey ? { ...conflict, resolution } : conflict) } : current);
    setPreview(await api.setConflictResolution(token, identityKey, resolution));
  };
  return (
    <main className="section-view imports-view">
      <header className="section-header"><span>IMPORTS</span><h1>Renew your vault</h1><p>Choose the latest cumulative Kindle export. Reading Desk adds only what is new.</p></header>
      <button className="import-dropzone" onClick={() => void choose()} disabled={busy}>
        <DownloadSimple size={36} weight="light" /><strong>{busy ? "Reading file…" : "Choose My Clippings.txt"}</strong><span>Your existing books and clipping blocks will not be deleted or replaced.</span>
      </button>
      {message && <div className="success-banner"><CheckCircle size={20} weight="fill" />{message}</div>}
      {preview && <section className="import-preview"><div className="preview-title"><div><span>READY TO IMPORT</span><h2>{preview.filename}</h2></div><button className="primary-button" onClick={() => void commit()} disabled={busy}>Add {preview.newCount} new clippings</button></div><div className="preview-stats"><div><strong>{preview.newCount}</strong><span>New clippings</span></div><div><strong>{preview.newBookCount}</strong><span>New books</span></div><div><strong>{preview.duplicateCount.toLocaleString()}</strong><span>Duplicates skipped</span></div><div><strong>{preview.conflicts.length}</strong><span>Need review</span></div></div>{preview.warnings.length > 0 && <div className="warning-line"><WarningCircle size={18} />{preview.warnings.length} entries have metadata warnings and will remain reviewable.</div>}{preview.conflicts.length > 0 && <div className="conflict-list"><h3>Content collisions</h3><p>These entries share Kindle identity data but contain different text. Skip is the safe default.</p>{preview.conflicts.map((conflict) => <article key={conflict.identityKey}><div><strong>{conflict.bookTitle}</strong><small>Existing</small><p>{conflict.existingContent || "Empty clipping"}</p><small>Incoming</small><p>{conflict.incomingContent || "Empty clipping"}</p></div><div className="conflict-actions"><button className={conflict.resolution === "skip" ? "active" : ""} onClick={() => void resolveConflict(conflict.identityKey, "skip")}>Skip</button><button className={conflict.resolution === "add-separately" ? "active" : ""} onClick={() => void resolveConflict(conflict.identityKey, "add-separately")}>Add separately</button></div></article>)}</div>}</section>}
      <section className="import-history"><h2>Import history</h2>{snapshot.imports.map((entry) => <div className="history-row" key={entry.id}><FileText size={20} /><div><strong>{entry.filename}</strong><span>{formatDate(entry.importedAt)}</span></div><span>{entry.imported.toLocaleString()} added</span><span>{entry.duplicates.toLocaleString()} duplicates</span></div>)}</section>
    </main>
  );
}

function InsightsView({ snapshot }: { snapshot: AppSnapshot }) {
  const statuses = (["Reading", "Finished", "Paused", "Reference"] as BookStatus[]).map((status) => ({ status, count: snapshot.books.filter((book) => book.status === status).length }));
  const recurring = snapshot.authors.filter((author) => author.books.length > 1).sort((a, b) => b.books.length - a.books.length).slice(0, 6);
  return (
    <main className="section-view insights-view">
      <header className="section-header"><span>READING INSIGHTS</span><h1>A quiet view of your reading</h1><p>Book-level signals for orientation—not a feed of every highlight.</p></header>
      <div className="insight-stats"><div><strong>{snapshot.books.length}</strong><span>Books in vault</span></div><div><strong>{snapshot.authors.length}</strong><span>Authors</span></div><div><strong>{snapshot.books.reduce((sum, book) => sum + book.clippingCount, 0).toLocaleString()}</strong><span>Highlights & notes</span></div></div>
      <div className="insights-columns"><section><h2>Reading lifecycle</h2>{statuses.map(({ status, count }) => <div className="insight-row" key={status}><span><StatusDot status={status} />{status}</span><strong>{count}</strong></div>)}</section><section><h2>Authors you returned to</h2>{recurring.map((author) => <div className="insight-row" key={author.id}><span>{author.name}</span><strong>{author.books.length} books</strong></div>)}</section></div>
    </main>
  );
}

function SettingsView({ snapshot, updateState, onChooseVault, onCheckForUpdates, onDownloadUpdate, onInstallUpdate }: {
  snapshot: AppSnapshot;
  updateState: AppUpdateState;
  onChooseVault: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onDownloadUpdate: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
}) {
  const checking = updateState.stage === "checking";
  const downloading = updateState.stage === "downloading";
  const updateAvailable = updateState.stage === "available";
  const updateDownloaded = updateState.stage === "downloaded";
  const updateAction = updateDownloaded ? onInstallUpdate : updateAvailable ? onDownloadUpdate : onCheckForUpdates;
  const actionLabel = updateDownloaded
    ? "Restart and install"
    : updateAvailable
      ? "Download update"
      : checking
        ? "Checking…"
        : downloading
          ? `Downloading ${updateState.progress || 0}%`
          : "Check for updates";
  const stageLabel: Record<AppUpdateState["stage"], string> = {
    idle: "Ready to check",
    checking: "Checking for updates",
    "up-to-date": "Up to date",
    available: `Version ${updateState.availableVersion || "new"} available`,
    downloading: `Downloading ${updateState.progress || 0}%`,
    downloaded: "Ready to install",
    error: "Update problem",
    unsupported: "Installed app only",
  };
  return (
    <main className="section-view settings-view">
      <header className="section-header"><span>SETTINGS</span><h1>Your reading desk, kept local</h1><p>Choose where Reading Desk stores its Markdown library and review what the app can access.</p></header>
      <div className="settings-grid">
        <section className="settings-card vault-settings-card">
          <div className="settings-card-heading"><FolderOpen size={26} weight="light" /><div><h2>Obsidian vault</h2><p>Books, authors, and import history are stored in this folder.</p></div></div>
          <div className="vault-path-value" title={snapshot.vaultPath || undefined}>{snapshot.vaultPath}</div>
          <button className="secondary-button" onClick={() => void onChooseVault()}><FolderOpen size={18} /> Choose a different vault</button>
        </section>
        <section className="settings-card">
          <div className="settings-card-heading"><CheckCircle size={26} weight="light" /><div><h2>Privacy</h2><p>Reading Desk works without an account or cloud service.</p></div></div>
          <ul className="settings-facts"><li>Your clippings stay on this computer.</li><li>No analytics or reading telemetry is collected.</li><li>Existing Markdown outside managed sections is preserved.</li></ul>
        </section>
        <section className="settings-card">
          <div className="settings-card-heading"><BookOpen size={26} weight="light" /><div><h2>About Reading Desk</h2><p>A local companion for Kindle clippings and Obsidian.</p></div></div>
          <dl className="about-list"><div><dt>Version</dt><dd>{appVersion}</dd></div><div><dt>Storage</dt><dd>Local Markdown</dd></div><div><dt>Platform</dt><dd>Windows desktop</dd></div></dl>
        </section>
        <section className="settings-card update-settings-card" aria-live="polite">
          <div className="settings-card-heading"><ArrowClockwise size={26} weight="light" /><div><h2>App updates</h2><p>Reading Desk checks public GitHub Releases and lets you choose when to install.</p></div></div>
          <div className={`update-status update-status-${updateState.stage}`}>
            <div><strong>{stageLabel[updateState.stage]}</strong><span>Current version {updateState.currentVersion}</span></div>
            {downloading && <div className="update-progress" role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={updateState.progress || 0}><span style={{ width: `${updateState.progress || 0}%` }} /></div>}
            {updateState.message && <p>{updateState.message}</p>}
          </div>
          <button className={updateDownloaded || updateAvailable ? "primary-button" : "secondary-button"} onClick={() => void updateAction()} disabled={checking || downloading || updateState.stage === "unsupported"}>
            {updateAvailable ? <DownloadSimple size={18} /> : <ArrowClockwise size={18} />}{actionLabel}
          </button>
        </section>
      </div>
    </main>
  );
}

function HelpView({ onGoToImports, onGoToSettings }: { onGoToImports: () => void; onGoToSettings: () => void }) {
  return (
    <main className="section-view help-view">
      <header className="section-header"><span>HELP</span><h1>From Kindle export to reading notes</h1><p>Reading Desk keeps the process simple and leaves your vault readable in any Markdown editor.</p></header>
      <div className="help-layout">
        <section className="help-steps">
          <article><span>1</span><div><h2>Choose a vault</h2><p>Use a dedicated Obsidian folder so Reading Desk can keep books, authors, and import records organized.</p></div></article>
          <article><span>2</span><div><h2>Import My Clippings.txt</h2><p>Connect your Kindle, open its documents folder, and choose the latest cumulative export.</p></div></article>
          <article><span>3</span><div><h2>Review before adding</h2><p>Duplicates are skipped. If Kindle identity data collides with different text, Skip remains the safe default.</p></div></article>
          <article><span>4</span><div><h2>Read and reflect</h2><p>Favorite passages, add tags, and write clipping notes or book reflections that are saved back into ordinary Markdown.</p></div></article>
        </section>
        <aside className="help-aside">
          <h2>Good to know</h2>
          <p>Reimporting the same file does not duplicate clippings, and a shorter export never removes older material.</p>
          <p>Your own frontmatter and writing outside Reading Desk’s managed regions stay untouched.</p>
          <div className="help-actions"><button className="primary-button" onClick={onGoToImports}>Open Imports</button><button className="secondary-button" onClick={onGoToSettings}>Review Settings</button></div>
          <small>Reading Desk {appVersion}</small>
        </aside>
      </div>
    </main>
  );
}

function Onboarding({ onSelect }: { onSelect: () => Promise<void> }) {
  return (
    <main className="onboarding">
      <BookOpen size={46} weight="light" />
      <span>READING DESK</span>
      <h1>Turn Kindle clippings into a lasting reading practice.</h1>
      <p>Choose or create a dedicated Obsidian vault. Your books, highlights, notes, and reflections stay as ordinary Markdown on your computer.</p>
      <button className="primary-button large" onClick={() => void onSelect()}><FolderOpen size={20} /> Choose or create a vault</button>
      <div className="privacy-note"><CheckCircle size={18} /><span>Local-only · no account · no analytics</span></div>
    </main>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [route, setRoute] = useState<Route>("library");
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [selectedAuthorName, setSelectedAuthorName] = useState<string>();
  const [book, setBook] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainMenuVisible, setMainMenuVisible] = useState(true);
  const [booksVisible, setBooksVisible] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [primaryNavigationWidth, setPrimaryNavigationWidth] = useState(() =>
    readStoredWidth(PRIMARY_NAVIGATION_STORAGE_KEY, PRIMARY_NAVIGATION_DEFAULT, PRIMARY_NAVIGATION_MIN, PRIMARY_NAVIGATION_MAX));
  const [bookListWidth, setBookListWidth] = useState(() =>
    readStoredWidth(BOOK_LIST_STORAGE_KEY, BOOK_LIST_DEFAULT, BOOK_LIST_MIN, BOOK_LIST_MAX));
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    stage: window.readingDesk ? "idle" : "unsupported",
    currentVersion: appVersion,
    message: window.readingDesk ? undefined : "Update checks are available in the installed Windows app.",
  });
  const compactNavigation = viewportWidth <= PRIMARY_NAVIGATION_COMPACT_BREAKPOINT;
  const visibleNavigationWidth = mainMenuVisible
    ? (compactNavigation ? PRIMARY_NAVIGATION_COMPACT : primaryNavigationWidth)
    : 0;
  const maximumBookListWidth = Math.max(
    BOOK_LIST_MIN,
    Math.min(BOOK_LIST_MAX, viewportWidth - visibleNavigationWidth - BOOK_WORKSPACE_MIN),
  );
  const visibleBookListWidth = clamp(bookListWidth, BOOK_LIST_MIN, maximumBookListWidth);

  const refresh = useCallback(async () => {
    const next = await api.getSnapshot();
    setSnapshot(next);
    setSelectedBookId((current) => current && next.books.some((candidate) => candidate.id === current) ? current : next.books[0]?.id);
    return next;
  }, []);

  useEffect(() => { void refresh().finally(() => setLoading(false)); return api.onVaultChanged(() => void refresh()); }, [refresh]);
  useEffect(() => {
    void api.getUpdateState().then(setUpdateState);
    return api.onUpdateState(setUpdateState);
  }, []);
  useEffect(() => {
    if (!selectedBookId) { setBook(null); return; }
    void api.getBook(selectedBookId).then(setBook);
  }, [selectedBookId, snapshot?.books]);
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(PRIMARY_NAVIGATION_STORAGE_KEY, String(Math.round(primaryNavigationWidth))); } catch { /* Device-local preferences are optional. */ }
  }, [primaryNavigationWidth]);
  useEffect(() => {
    try { window.localStorage.setItem(BOOK_LIST_STORAGE_KEY, String(Math.round(bookListWidth))); } catch { /* Device-local preferences are optional. */ }
  }, [bookListWidth]);

  const openBook = (bookId: string) => { setSelectedBookId(bookId); setRoute("library"); };
  const openAuthor = (name: string) => {
    setSelectedAuthorName(name);
    setRoute("authors");
  };

  if (loading || !snapshot) return <main className="loading-screen"><BookOpen size={42} weight="light" /><span>Opening your reading desk…</span></main>;
  if (!snapshot.vaultPath) return <Onboarding onSelect={async () => { setSnapshot(await api.selectVault()); }} />;

  return (
    <div
      className={`app-shell${!mainMenuVisible ? " main-menu-hidden" : ""}`}
      style={{ "--primary-navigation-width": `${primaryNavigationWidth}px` } as React.CSSProperties}
    >
      {(updateState.stage === "available" || updateState.stage === "downloaded") && (
        <div className="update-notice" role="status">
          <div><strong>{updateState.stage === "downloaded" ? "Update ready" : `Reading Desk ${updateState.availableVersion || "update"} available`}</strong><span>{updateState.stage === "downloaded" ? "Restart when you are ready to install it." : "Download it from Settings when convenient."}</span></div>
          <button onClick={() => setRoute("settings")}>View update</button>
        </div>
      )}
      {mainMenuVisible && <Sidebar route={route} setRoute={setRoute} vaultPath={snapshot.vaultPath} onHide={() => setMainMenuVisible(false)} />}
      {mainMenuVisible && !compactNavigation && <PanelResizer label="Resize primary navigation" value={primaryNavigationWidth} minimum={PRIMARY_NAVIGATION_MIN} maximum={PRIMARY_NAVIGATION_MAX} onChange={setPrimaryNavigationWidth} className="primary-navigation-resizer" />}
      {!mainMenuVisible && route !== "library" && <button className="floating-panel-toggle" onClick={() => setMainMenuVisible(true)} aria-label="Show main menu" title="Show main menu"><SidebarSimple size={21} /></button>}
      {route === "library" && <div
        className={`library-route${!booksVisible ? " books-hidden" : ""}`}
        style={{ "--book-list-width": `${visibleBookListWidth}px` } as React.CSSProperties}
      >
        {booksVisible && <LibraryPanel books={snapshot.books} selectedId={selectedBookId} onSelect={setSelectedBookId} onHide={() => setBooksVisible(false)} />}
        {booksVisible && <PanelResizer label="Resize book list" value={visibleBookListWidth} minimum={BOOK_LIST_MIN} maximum={maximumBookListWidth} onChange={setBookListWidth} className="book-list-resizer" />}
        {book ? <BookWorkspace book={book} books={snapshot.books} authors={snapshot.authors} onAuthor={openAuthor} onRefresh={async () => { const next = await refresh(); if (selectedBookId) setBook(await api.getBook(selectedBookId)); void next; }} onOpenBook={openBook} mainMenuVisible={mainMenuVisible} booksVisible={booksVisible} onToggleMainMenu={() => setMainMenuVisible((value) => !value)} onToggleBooks={() => setBooksVisible((value) => !value)} /> : <div className="empty-workspace"><Books size={42} /><h2>Your library is ready</h2><p>Import My Clippings.txt to create your first book note.</p><button className="primary-button" onClick={() => setRoute("imports")}>Import clippings</button></div>}
      </div>}
      {route === "authors" && <AuthorsView authors={snapshot.authors} initialName={selectedAuthorName} onOpenBook={openBook} onMerged={async () => { await refresh(); }} />}
      {route === "imports" && <ImportsView snapshot={snapshot} onCommitted={async () => { await refresh(); }} />}
      {route === "insights" && <InsightsView snapshot={snapshot} />}
      {route === "settings" && <SettingsView
        snapshot={snapshot}
        updateState={updateState}
        onChooseVault={async () => { const next = await api.selectVault(); setSnapshot(next); setSelectedBookId(next.books[0]?.id); }}
        onCheckForUpdates={async () => { setUpdateState(await api.checkForUpdates()); }}
        onDownloadUpdate={async () => { setUpdateState(await api.downloadUpdate()); }}
        onInstallUpdate={async () => { await api.installUpdate(); }}
      />}
      {route === "help" && <HelpView onGoToImports={() => setRoute("imports")} onGoToSettings={() => setRoute("settings")} />}
    </div>
  );
}
