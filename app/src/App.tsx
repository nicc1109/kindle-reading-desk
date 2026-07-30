import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsInSimple,
  ArrowsOutSimple,
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
  AuthorRecord,
  BookPatch,
  BookRecord,
  BookStatus,
  BookSummary,
  ClippingRecord,
  ImportPreview,
  ReadingDeskApi,
} from "../shared/types";
import { demoApi } from "./demo";

type Route = "library" | "authors" | "imports" | "insights";
type BookTab = "highlights" | "reflection" | "details";

const api: ReadingDeskApi = window.readingDesk || demoApi;
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
    <button className={`nav-button${active ? " active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
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
        <NavButton icon={<Gear size={23} />} label="Settings" onClick={() => undefined} />
        <NavButton icon={<Question size={23} />} label="Help" onClick={() => undefined} />
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
      <div className="highlight-list" role="listbox">
        {clippings.map((clip) => (
          <button key={clip.id} className={`highlight-row${selectedId === clip.id ? " selected" : ""}`} onClick={() => onSelect(clip.id)} role="option" aria-selected={selectedId === clip.id}>
            <span className="highlight-meta"><span><ClippingTypeIcon type={clip.type} />{locationLabel(clip)}</span>
              <span
                className="favorite-hit"
                role="button"
                tabIndex={0}
                aria-label={clip.favorite ? "Remove favorite" : "Add favorite"}
                onClick={(event) => { event.stopPropagation(); onFavorite(clip); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); onFavorite(clip); } }}
              ><Star size={18} weight={clip.favorite ? "fill" : "regular"} /></span>
            </span>
            <span className="highlight-excerpt">{clip.content || "Kindle bookmark"}</span>
            {clip.reflection && <small className="has-reflection"><NotePencil size={13} /> Reflection added</small>}
          </button>
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

function ReaderPane({ book, clip, onSave, onNext, onPrevious }: {
  book: BookRecord;
  clip: ClippingRecord;
  onSave: (patch: ClippingPatchLike) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const [reflection, setReflection] = useState(clip.reflection);
  const [tags, setTags] = useState(clip.tags.join(", "));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setReflection(clip.reflection); setTags(clip.tags.join(", ")); }, [clip.id, clip.reflection, clip.tags]);

  const save = async () => {
    setSaving(true);
    await onSave({ reflection, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
    setSaving(false);
  };

  return (
    <section className="reader-pane" aria-label="Selected clipping">
      <div className="reader-provenance"><span><strong>Full passage</strong> · {locationLabel(clip)}</span><span>Added {formatDate(clip.addedAt)}</span></div>
      <article className="quote-card">
        <span className="quote-rule" aria-hidden="true" />
        <blockquote>{clip.content || "This Kindle bookmark does not contain text."}</blockquote>
        <cite>— {book.title}, {book.authors.join(" & ")}</cite>
      </article>
      <div className="reflection-editor">
        <div className="editor-heading"><h3>Your reflection</h3><span>{saving ? "Saving…" : "Saved to vault"}</span></div>
        <div className="editor-toolbar" aria-label="Reflection tools">
          <span>Normal <CaretDown size={13} /></span><b>B</b><i>I</i><span className="toolbar-divider" /><Tag size={17} />
        </div>
        <textarea value={reflection} onChange={(event) => setReflection(event.target.value)} onBlur={() => void save()} placeholder="What does this passage change, challenge, or connect?" aria-label="Highlight reflection" />
        <div className="editor-tags">
          <Tag size={15} /><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, separated by commas" aria-label="Highlight tags" />
        </div>
        <div className="editor-footer"><span><CheckCircle size={16} /> {saving ? "Saving" : "Autosaved"}</span><button className="primary-button" onClick={() => void save()}>Save reflection</button></div>
      </div>
      <div className="reader-pagination"><button onClick={onPrevious}>← Previous</button><button onClick={onNext}>Next →</button></div>
    </section>
  );
}

type ClippingPatchLike = { reflection?: string; tags?: string[]; favorite?: boolean };

function BookReflection({ book, onSave }: { book: BookRecord; onSave: (reflection: string) => Promise<void> }) {
  const [value, setValue] = useState(book.reflection);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(book.reflection), [book.id, book.reflection]);
  const save = async () => { setSaving(true); await onSave(value); setSaving(false); };
  return (
    <section className="book-reflection-view">
      <div className="longform-heading"><span>BOOK REFLECTION</span><h2>What stayed with you?</h2><p>Use this space for the argument of the book, your response, and the ideas worth carrying forward.</p></div>
      <div className="longform-editor">
        <div className="editor-toolbar"><span>Normal <CaretDown size={13} /></span><b>B</b><i>I</i><span className="toolbar-divider" /><Tag size={17} /></div>
        <textarea value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} placeholder="Write your book-level reflection…" />
        <div className="editor-footer"><span><CheckCircle size={16} /> {saving ? "Saving" : "Saved to vault"}</span><button className="primary-button" onClick={() => void save()}>Save reflection</button></div>
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
    <section className="details-view">
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

function BookWorkspace({ book, books, authors, onAuthor, onRefresh, onOpenBook, mainMenuVisible, booksVisible, focusMode, onToggleMainMenu, onToggleBooks, onToggleFocus }: {
  book: BookRecord;
  books: BookSummary[];
  authors: AuthorRecord[];
  onAuthor: (name: string) => void;
  onRefresh: () => Promise<void>;
  onOpenBook: (bookId: string) => void;
  mainMenuVisible: boolean;
  booksVisible: boolean;
  focusMode: boolean;
  onToggleMainMenu: () => void;
  onToggleBooks: () => void;
  onToggleFocus: () => void;
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
    <section className={`book-workspace${focusMode ? " focus-mode" : ""}`}>
      <header className="book-header">
        <div><h1>{localBook.title}</h1><div className="author-links">{localBook.authors.map((name, index) => { const count = authors.find((author) => author.name === name)?.books.length || 1; return <span key={name}>{index > 0 && <span className="author-separator"> &amp; </span>}<button className="author-link" onClick={() => onAuthor(name)}>{name} · {count} {count === 1 ? "book" : "books"}</button></span>; })}</div></div>
        <div className="book-actions">
          {!focusMode && <div className="layout-actions" aria-label="Layout controls">
            <button className={`icon-button${mainMenuVisible ? " selected" : ""}`} onClick={onToggleMainMenu} aria-label={`${mainMenuVisible ? "Hide" : "Show"} main menu`} title={`${mainMenuVisible ? "Hide" : "Show"} main menu`}><SidebarSimple size={21} /></button>
            <button className={`icon-button book-list-toggle${booksVisible ? " selected" : ""}`} onClick={onToggleBooks} aria-label={`${booksVisible ? "Hide" : "Show"} books list`} title={`${booksVisible ? "Hide" : "Show"} books list`}><Books size={21} /></button>
          </div>}
          <button className={`icon-button${focusMode ? " selected" : ""}`} onClick={onToggleFocus} aria-label={focusMode ? "Exit full-page book view" : "Open full-page book view"} title={focusMode ? "Exit full-page book view" : "Open full-page book view"}>{focusMode ? <ArrowsInSimple size={21} /> : <ArrowsOutSimple size={21} />}</button>
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
        <button className={tab === "highlights" ? "active" : ""} onClick={() => setTab("highlights")}>Highlights</button>
        <button className={tab === "reflection" ? "active" : ""} onClick={() => setTab("reflection")}>Book reflection</button>
        <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button>
      </div>
      {tab === "highlights" && selectedClip && (
        <div className="book-reading-grid">
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

function Onboarding({ onSelect }: { onSelect: () => Promise<void> }) {
  return (
    <main className="onboarding">
      <BookOpen size={46} weight="light" />
      <span>READING DESK</span>
      <h1>Turn Kindle clippings into a lasting reading practice.</h1>
      <p>Choose or create a dedicated Obsidian vault. Your books, highlights, and reflections stay as ordinary Markdown on your computer.</p>
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
  const [focusMode, setFocusMode] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.getSnapshot();
    setSnapshot(next);
    setSelectedBookId((current) => current && next.books.some((candidate) => candidate.id === current) ? current : next.books[0]?.id);
    return next;
  }, []);

  useEffect(() => { void refresh().finally(() => setLoading(false)); return api.onVaultChanged(() => void refresh()); }, [refresh]);
  useEffect(() => {
    if (!selectedBookId) { setBook(null); return; }
    void api.getBook(selectedBookId).then(setBook);
  }, [selectedBookId, snapshot?.books]);

  const openBook = (bookId: string) => { setSelectedBookId(bookId); setRoute("library"); setFocusMode(false); };
  const openAuthor = (name: string) => {
    setSelectedAuthorName(name);
    setFocusMode(false);
    setRoute("authors");
  };

  if (loading || !snapshot) return <main className="loading-screen"><BookOpen size={42} weight="light" /><span>Opening your reading desk…</span></main>;
  if (!snapshot.vaultPath) return <Onboarding onSelect={async () => { setSnapshot(await api.selectVault()); }} />;

  return (
    <div className={`app-shell${!mainMenuVisible || focusMode ? " main-menu-hidden" : ""}`}>
      {!focusMode && mainMenuVisible && <Sidebar route={route} setRoute={setRoute} vaultPath={snapshot.vaultPath} onHide={() => setMainMenuVisible(false)} />}
      {!focusMode && !mainMenuVisible && route !== "library" && <button className="floating-panel-toggle" onClick={() => setMainMenuVisible(true)} aria-label="Show main menu" title="Show main menu"><SidebarSimple size={21} /></button>}
      {route === "library" && <div className={`library-route${!booksVisible || focusMode ? " books-hidden" : ""}`}>{!focusMode && booksVisible && <LibraryPanel books={snapshot.books} selectedId={selectedBookId} onSelect={setSelectedBookId} onHide={() => setBooksVisible(false)} />}{book ? <BookWorkspace book={book} books={snapshot.books} authors={snapshot.authors} onAuthor={openAuthor} onRefresh={async () => { const next = await refresh(); if (selectedBookId) setBook(await api.getBook(selectedBookId)); void next; }} onOpenBook={openBook} mainMenuVisible={mainMenuVisible} booksVisible={booksVisible} focusMode={focusMode} onToggleMainMenu={() => setMainMenuVisible((value) => !value)} onToggleBooks={() => setBooksVisible((value) => !value)} onToggleFocus={() => setFocusMode((value) => !value)} /> : <div className="empty-workspace"><Books size={42} /><h2>Your library is ready</h2><p>Import My Clippings.txt to create your first book note.</p><button className="primary-button" onClick={() => setRoute("imports")}>Import clippings</button></div>}</div>}
      {route === "authors" && <AuthorsView authors={snapshot.authors} initialName={selectedAuthorName} onOpenBook={openBook} onMerged={async () => { await refresh(); }} />}
      {route === "imports" && <ImportsView snapshot={snapshot} onCommitted={async () => { await refresh(); }} />}
      {route === "insights" && <InsightsView snapshot={snapshot} />}
    </div>
  );
}
