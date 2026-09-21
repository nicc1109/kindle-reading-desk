import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  BookOpen,
  Books,
  BookmarkSimple,
  CaretDown,
  CheckCircle,
  DownloadSimple,
  FileText,
  FolderOpen,
  NotePencil,
  SidebarSimple,
  Star,
  Tag,
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
import packageMetadata from "../package.json";
import { demoApi } from "./demo";
import { GoogleDocsExport } from "./GoogleDocsExport";
import { StatusDot } from "./components/StatusDot";
import { formatDate, locationLabel } from "./formatters";
import { useReadingDeskData } from "./hooks/useReadingDeskData";
import { useRovingFocus } from "./hooks/useRovingFocus";
import { useVirtualWindow } from "./hooks/useVirtualWindow";
import type { Route } from "./routes";
import { LibraryPanel } from "./views/LibraryPanel";
import { SettingsView } from "./views/SettingsView";
import { Sidebar } from "./views/Sidebar";
import { HelpView, InsightsView, Onboarding } from "./views/StaticViews";

type BookTab = "highlights" | "reflection" | "details";
const BOOK_TABS: Array<{ id: BookTab; label: string }> = [
  { id: "highlights", label: "Highlights" },
  { id: "reflection", label: "Book reflection" },
  { id: "details", label: "Details" },
];

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
  const activeIndex = clippings.findIndex((clip) => clip.id === selectedId);
  const virtual = useVirtualWindow({ count: clippings.length, rowHeight: 148, fallbackHeight: 620 });
  const roving = useRovingFocus<HTMLDivElement>({
    count: clippings.length,
    activeIndex,
    labels: clippings.map((clip) => clip.content || locationLabel(clip)),
    orientation: "vertical",
    onActivate: (index) => { virtual.scrollToIndex(index); onSelect(clippings[index].id); },
  });
  return (
    <section className="highlight-column" aria-label="Highlights and notes">
      <div className="highlight-summary">
        <strong>{clippings.length.toLocaleString()} highlights & notes</strong>
        <span>Excerpts · Book order ↑</span>
      </div>
      <div ref={virtual.containerRef} onScroll={virtual.onScroll} className="highlight-list" role="listbox" aria-label="Clippings in book order">
        <div className="highlight-list-window" style={{ height: `${virtual.totalHeight}px` }}>
        {clippings.slice(virtual.start, virtual.end).map((clip, offset) => {
          const index = virtual.start + offset;
          const option = roving.itemProps(index);
          return <div
            key={clip.id}
            className={`highlight-row${selectedId === clip.id ? " selected" : ""}`}
            style={{ top: `${index * 148}px` }}
            onClick={() => onSelect(clip.id)}
            onKeyDown={(event) => {
              option.onKeyDown(event);
              if (!event.defaultPrevented && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(clip.id);
              }
            }}
            ref={option.ref}
            role="option"
            tabIndex={option.tabIndex}
            aria-selected={selectedId === clip.id}
            aria-posinset={index + 1}
            aria-setsize={clippings.length}
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
          </div>;
        })}
        </div>
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

export function ReaderPane({ book, clip, onSave, onNext, onPrevious, saveHandlerRef }: {
  book: BookRecord;
  clip: ClippingRecord;
  onSave: (patch: ClippingPatchLike) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
  saveHandlerRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const [reflection, setReflection] = useState(clip.reflection);
  const [tags, setTags] = useState(clip.tags.join(", "));
  const [notesOpen, setNotesOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const reflectionRef = useRef(clip.reflection);
  const tagsRef = useRef(clip.tags.join(", "));
  const editRevision = useRef(0);
  const persistedRevision = useRef(0);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const drafts = useRef(new Map<string, { reflection: string; tags: string; editRevision: number; persistedRevision: number }>());
  const activeClipId = useRef(clip.id);
  useEffect(() => {
    const clippingChanged = activeClipId.current !== clip.id;
    if (clippingChanged) {
      activeClipId.current = clip.id;
      setNotesOpen(false);
    }
    const draft = drafts.current.get(clip.id);
    const nextReflection = draft?.reflection ?? clip.reflection;
    const nextTags = draft?.tags ?? clip.tags.join(", ");
    reflectionRef.current = nextReflection;
    tagsRef.current = nextTags;
    editRevision.current = draft?.editRevision ?? 0;
    persistedRevision.current = draft?.persistedRevision ?? 0;
    setReflection(nextReflection);
    setTags(nextTags);
    setSaveState(editRevision.current === persistedRevision.current ? "saved" : "dirty");
  }, [clip.id, clip.reflection, clip.tags]);

  const persistOnce = async (): Promise<boolean> => {
    const clipId = activeClipId.current;
    const revision = editRevision.current;
    if (persistedRevision.current >= revision) return true;
    const pendingReflection = reflectionRef.current;
    const pendingTags = tagsRef.current;
    setSaveState("saving");
    try {
      await onSave({ reflection: pendingReflection, tags: pendingTags.split(",").map((tag) => tag.trim()).filter(Boolean) });
      persistedRevision.current = Math.max(persistedRevision.current, revision);
      const currentDraft = drafts.current.get(clipId);
      if (currentDraft) currentDraft.persistedRevision = persistedRevision.current;
      if (activeClipId.current === clipId && editRevision.current === revision) {
        drafts.current.delete(clipId);
        setSaveState("saved");
      } else if (activeClipId.current === clipId) {
        setSaveState("dirty");
      }
      return true;
    } catch {
      if (activeClipId.current === clipId) setSaveState("error");
      return false;
    }
  };
  const enqueueSave = (): Promise<boolean> => {
    const pending = saveQueue.current.then(persistOnce, persistOnce);
    saveQueue.current = pending;
    return pending;
  };
  const save = async (): Promise<boolean> => {
    while (persistedRevision.current < editRevision.current) {
      const saved = await enqueueSave();
      if (!saved) return false;
    }
    return true;
  };
  if (saveHandlerRef) saveHandlerRef.current = save;
  useEffect(() => () => {
    if (saveHandlerRef) saveHandlerRef.current = null;
  }, [saveHandlerRef]);
  useEffect(() => {
    const warnIfDirty = (event: BeforeUnloadEvent) => {
      if (persistedRevision.current >= editRevision.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfDirty);
    return () => window.removeEventListener("beforeunload", warnIfDirty);
  }, []);
  const updateDraft = (nextReflection: string, nextTags: string) => {
    const revision = editRevision.current + 1;
    editRevision.current = revision;
    reflectionRef.current = nextReflection;
    tagsRef.current = nextTags;
    drafts.current.set(clip.id, {
      reflection: nextReflection,
      tags: nextTags,
      editRevision: revision,
      persistedRevision: persistedRevision.current,
    });
    setSaveState("dirty");
  };
  const navigate = async (action: () => void) => {
    if (await save()) action();
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
          <textarea value={reflection} onChange={(event) => { const value = event.target.value; setReflection(value); updateDraft(value, tagsRef.current); }} onBlur={() => void save()} placeholder="Write a note…" aria-label="Notes" />
          <div className="editor-tags">
            <Tag size={15} /><input value={tags} onChange={(event) => { const value = event.target.value; setTags(value); updateDraft(reflectionRef.current, value); }} onBlur={() => void save()} placeholder="Add tags, separated by commas" aria-label="Note tags" />
          </div>
          <div className="editor-footer"><span>{reflectionWords} {reflectionWords === 1 ? "word" : "words"}</span><button className="primary-button" disabled={saveState === "saved" || saveState === "saving"} onClick={() => void save()}>{saveState === "saving" ? "Saving…" : "Save note"}</button></div>
        </div>}
      </div>
      <div className="reader-pagination"><button onClick={() => void navigate(onPrevious)}>← Previous</button><button onClick={() => void navigate(onNext)}>Next →</button></div>
    </section>
  );
}

type ClippingPatchLike = { reflection?: string; tags?: string[]; favorite?: boolean };

export function BookReflection({ book, onSave }: { book: BookRecord; onSave: (reflection: string) => Promise<void> }) {
  const [value, setValue] = useState(book.reflection);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const valueRef = useRef(book.reflection);
  const editRevision = useRef(0);
  const persistedRevision = useRef(0);
  const activeBookId = useRef(book.id);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const drafts = useRef(new Map<string, { value: string; editRevision: number; persistedRevision: number }>());
  useEffect(() => {
    activeBookId.current = book.id;
    const draft = drafts.current.get(book.id);
    const nextValue = draft?.value ?? book.reflection;
    valueRef.current = nextValue;
    editRevision.current = draft?.editRevision ?? 0;
    persistedRevision.current = draft?.persistedRevision ?? 0;
    setValue(nextValue);
    setSaveState(editRevision.current === persistedRevision.current ? "saved" : "dirty");
  }, [book.id, book.reflection]);
  useEffect(() => {
    const warnIfDirty = (event: BeforeUnloadEvent) => {
      if (persistedRevision.current >= editRevision.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfDirty);
    return () => window.removeEventListener("beforeunload", warnIfDirty);
  }, []);
  const persistOnce = async (): Promise<boolean> => {
    const bookId = activeBookId.current;
    const revision = editRevision.current;
    if (persistedRevision.current >= revision) return true;
    const pendingValue = valueRef.current;
    setSaveState("saving");
    try {
      await onSave(pendingValue);
      persistedRevision.current = Math.max(persistedRevision.current, revision);
      const currentDraft = drafts.current.get(bookId);
      if (currentDraft) currentDraft.persistedRevision = persistedRevision.current;
      if (activeBookId.current === bookId && editRevision.current === revision) {
        drafts.current.delete(bookId);
        setSaveState("saved");
      } else if (activeBookId.current === bookId) {
        setSaveState("dirty");
      }
      return true;
    } catch {
      if (activeBookId.current === bookId) setSaveState("error");
      return false;
    }
  };
  const save = async (): Promise<boolean> => {
    while (persistedRevision.current < editRevision.current) {
      const pending = saveQueue.current.then(persistOnce, persistOnce);
      saveQueue.current = pending;
      if (!await pending) return false;
    }
    return true;
  };
  const updateDraft = (nextValue: string) => {
    const revision = editRevision.current + 1;
    valueRef.current = nextValue;
    editRevision.current = revision;
    drafts.current.set(book.id, { value: nextValue, editRevision: revision, persistedRevision: persistedRevision.current });
    setValue(nextValue);
    setSaveState("dirty");
  };
  const addPrompt = (heading: string) => {
    const nextValue = `${valueRef.current.trimEnd()}${valueRef.current.trim() ? "\n\n" : ""}## ${heading}\n\n`;
    updateDraft(nextValue);
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
        <textarea id="book-reflection" value={value} onChange={(event) => updateDraft(event.target.value)} onBlur={() => void save()} placeholder="Write the ideas you want to remember…" />
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
  const [busyAction, setBusyAction] = useState<"save" | "merge" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setTitle(book.title); setAuthors(book.authors.join("; ")); setTags(book.tags.join(", ")); setStatus(book.status);
    setStartedAt(book.startedAt?.slice(0, 10) || ""); setFinishedAt(book.finishedAt?.slice(0, 10) || "");
  }, [book.id, book.title, book.authors, book.tags, book.status, book.startedAt, book.finishedAt]);
  const save = async () => {
    setBusyAction("save"); setError("");
    try {
      await onSave({ title, authors: authors.split(";").map((value) => value.trim()).filter(Boolean), tags: tags.split(",").map((value) => value.trim()).filter(Boolean), status, startedAt: startedAt || undefined, finishedAt: finishedAt || undefined });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the book details. Try again.");
    } finally {
      setBusyAction(null);
    }
  };
  const merge = async () => {
    if (!mergeTarget) return;
    setBusyAction("merge"); setError("");
    try {
      await onMerge(mergeTarget);
      setMergeTarget("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not merge the books. Try again.");
    } finally {
      setBusyAction(null);
    }
  };
  return (
    <section className="details-view" id="book-panel-details" role="tabpanel" aria-labelledby="book-tab-details">
      {error && <div className="error-banner" role="alert"><WarningCircle size={20} />{error}</div>}
      <div className="details-grid">
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Authors <small>Separate multiple authors with semicolons</small><input value={authors} onChange={(event) => setAuthors(event.target.value)} /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as BookStatus)}>{["Reading", "Finished", "Paused", "Reference"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        <label>Started<input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></label>
        <label>Finished<input type="date" value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} /></label>
      </div>
      <button className="primary-button" disabled={busyAction !== null} onClick={() => void save()}>{busyAction === "save" ? "Saving…" : "Save book details"}</button>
      <div className="merge-box"><div><strong>Merge a duplicate book</strong><p>Its unique clippings and aliases will move into this book. The original note is archived.</p></div><div className="merge-controls"><select value={mergeTarget} disabled={busyAction !== null} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Choose duplicate…</option>{books.filter((candidate) => candidate.id !== book.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button className="secondary-button" disabled={!mergeTarget || busyAction !== null} onClick={() => void merge()}>{busyAction === "merge" ? "Merging…" : "Merge into this book"}</button></div></div>
    </section>
  );
}

export function BookWorkspace({ book, books, authors, onAuthor, onRefresh, onOpenBook, mainMenuVisible, booksVisible, onToggleMainMenu, onToggleBooks }: {
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
  const clippingSaveHandler = useRef<(() => Promise<boolean>) | null>(null);
  const [exportBook, setExportBook] = useState<BookRecord | null>(null);
  const [exportError, setExportError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadingExport, setLoadingExport] = useState(false);
  const tabRoving = useRovingFocus<HTMLButtonElement>({
    count: BOOK_TABS.length,
    activeIndex: BOOK_TABS.findIndex((candidate) => candidate.id === tab),
    orientation: "horizontal",
    onActivate: (index) => setTab(BOOK_TABS[index].id),
  });
  const prepareExport = async () => {
    setLoadingExport(true); setExportError("");
    try {
      const current = await api.getBook(localBook.id);
      if (!current) throw new Error("Book not found.");
      setExportBook(current);
    } catch (error) { setExportError(error instanceof Error ? error.message : "Could not load the book."); }
    finally { setLoadingExport(false); }
  };
  useEffect(() => {
    setLocalBook(book);
    setSelectedClipId((current) => current && book.clippings.some((clip) => clip.id === current) ? current : book.clippings[0]?.id);
  }, [book]);
  useEffect(() => { setSelectedClipId(book.clippings[0]?.id); setTab("highlights"); }, [book.id]);
  const selectedIndex = Math.max(0, localBook.clippings.findIndex((clip) => clip.id === selectedClipId));
  const selectedClip = localBook.clippings[selectedIndex];
  const updateClip = async (clipId: string, patch: ClippingPatchLike) => {
    setActionError("");
    try {
      const updated = await api.updateClipping(localBook.id, clipId, patch);
      setLocalBook((current) => ({ ...current, clippings: current.clippings.map((clip) => clip.id === clipId ? updated : clip) }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save the clipping. Try again.");
      throw error;
    }
  };
  const updateBook = async (patch: BookPatch) => {
    setActionError("");
    try {
      const updated = await api.updateBook(localBook.id, patch);
      setLocalBook(updated);
      await onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save the book. Try again.");
      throw error;
    }
  };
  const selectClip = async (clipId?: string) => {
    if (!clipId || clipId === selectedClipId) return;
    if (clippingSaveHandler.current && !await clippingSaveHandler.current()) return;
    setSelectedClipId(clipId);
  };
  const runBookAction = async (action: () => Promise<boolean>, failureMessage: string) => {
    setActionError("");
    try {
      if (!await action()) throw new Error(failureMessage);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : failureMessage);
    }
  };
  return (
    <section className="book-workspace">
      {exportBook && <GoogleDocsExport book={exportBook} api={api} onClose={() => setExportBook(null)} />}
      <header className="book-header">
        <div><h1>{localBook.title}</h1><div className="author-links">{localBook.authors.map((name, index) => { const count = authors.find((author) => author.name === name)?.books.length || 1; return <span key={name}>{index > 0 && <span className="author-separator"> &amp; </span>}<button className="author-link" onClick={() => onAuthor(name)}>{name} · {count} {count === 1 ? "book" : "books"}</button></span>; })}</div></div>
        <div className="book-actions">
          <div className="layout-actions" aria-label="Layout controls">
            <button className={`icon-button${mainMenuVisible ? " selected" : ""}`} onClick={onToggleMainMenu} aria-label={`${mainMenuVisible ? "Hide" : "Show"} main menu`} title={`${mainMenuVisible ? "Hide" : "Show"} main menu`}><SidebarSimple size={21} /></button>
            <button className={`icon-button book-list-toggle${booksVisible ? " selected" : ""}`} onClick={onToggleBooks} aria-label={`${booksVisible ? "Hide" : "Show"} books list`} title={`${booksVisible ? "Hide" : "Show"} books list`}><Books size={21} /></button>
          </div>
          <button className="secondary-button obsidian-button" onClick={() => void runBookAction(() => api.openBookInObsidian(localBook.id), "Could not open this book in Obsidian.")}>Open in Obsidian <ArrowSquareOut size={18} /></button>
          <button className="icon-button" aria-label="Export to Google Docs" title="Export to Google Docs" disabled={loadingExport} onClick={() => void prepareExport()}><DownloadSimple size={21} /></button>
          <button className="icon-button" aria-label="Show book file" title="Show book file" onClick={() => void runBookAction(() => api.showBookInFolder(localBook.id), "Could not show this book file.")}><FolderOpen size={21} /></button>
        </div>
      </header>
      <div className="book-facts">
        {(exportError || actionError) && <span role="alert">{exportError || actionError}</span>}
        <label className="status-select"><StatusDot status={localBook.status} /><select value={localBook.status} onChange={(event) => void updateBook({ status: event.target.value as BookStatus })}>{["Reading", "Finished", "Paused", "Reference"].map((value) => <option key={value}>{value}</option>)}</select><CaretDown size={14} /></label>
        <span className="vertical-rule" />
        <StarRating value={localBook.rating} onChange={(rating) => void updateBook({ rating })} />
        <span className="vertical-rule" />
        <div className="tag-pills">{localBook.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      </div>
      <div className="book-tabs" role="tablist" aria-label="Book sections">
        {BOOK_TABS.map((candidate, index) => <button
          {...tabRoving.itemProps(index)}
          key={candidate.id}
          id={`book-tab-${candidate.id}`}
          role="tab"
          aria-selected={tab === candidate.id}
          aria-controls={`book-panel-${candidate.id}`}
          className={tab === candidate.id ? "active" : ""}
          onClick={() => setTab(candidate.id)}
        >{candidate.label}</button>)}
      </div>
      {selectedClip && (
        <div hidden={tab !== "highlights"} className="book-reading-grid" id="book-panel-highlights" role="tabpanel" aria-labelledby="book-tab-highlights">
          <HighlightList clippings={localBook.clippings} selectedId={selectedClip.id} onSelect={(clipId) => void selectClip(clipId)} onFavorite={(clip) => void updateClip(clip.id, { favorite: !clip.favorite })} />
          <ReaderPane book={localBook} clip={selectedClip} onSave={(patch) => updateClip(selectedClip.id, patch)} onNext={() => void selectClip(localBook.clippings[Math.min(localBook.clippings.length - 1, selectedIndex + 1)]?.id)} onPrevious={() => void selectClip(localBook.clippings[Math.max(0, selectedIndex - 1)]?.id)} saveHandlerRef={clippingSaveHandler} />
        </div>
      )}
      {tab === "highlights" && !selectedClip && <div className="empty-workspace"><FileText size={36} /><h2>No clippings yet</h2><p>Import a Kindle My Clippings.txt file to fill this book.</p></div>}
      <div hidden={tab !== "reflection"}><BookReflection book={localBook} onSave={(reflection) => updateBook({ reflection })} /></div>
      {tab === "details" && <BookDetails book={localBook} books={books} onSave={updateBook} onMerge={async (sourceId) => { await api.mergeBooks(sourceId, localBook.id); await onRefresh(); onOpenBook(localBook.id); }} />}
    </section>
  );
}

function AuthorsView({ authors, initialName, onOpenBook, onMerged }: { authors: AuthorRecord[]; initialName?: string; onOpenBook: (bookId: string) => void; onMerged: () => Promise<void> }) {
  const initial = authors.find((author) => author.name === initialName);
  const [selectedId, setSelectedId] = useState(initial?.id || authors[0]?.id);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const next = authors.find((author) => author.name === initialName);
    if (next) setSelectedId(next.id);
  }, [authors, initialName]);
  const selected = authors.find((author) => author.id === selectedId) || authors[0];
  const merge = async () => {
    if (!selected || !mergeTarget) return;
    setMerging(true);
    setError("");
    try {
      await api.mergeAuthors(selected.name, mergeTarget);
      const target = authors.find((author) => author.name === mergeTarget);
      if (target) setSelectedId(target.id);
      setMergeTarget("");
      await onMerged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not merge the authors. Try again.");
    } finally {
      setMerging(false);
    }
  };
  return (
    <main className="section-view authors-view">
      <header className="section-header"><span>AUTHORS</span><h1>Your authors</h1><p>See every book by the same voice in one place.</p></header>
      {error && <div className="error-banner" role="alert"><WarningCircle size={20} />{error} You can retry the merge.</div>}
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
  const [error, setError] = useState("");
  const choose = async () => {
    setBusy(true); setMessage(""); setError("");
    try { setPreview(await api.chooseImport()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read the Kindle export. Try again."); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.commitImport(preview.token);
      await onCommitted();
      setMessage(`${result.imported} new clippings added across ${result.booksChanged} books. ${result.duplicates} duplicates left untouched.`);
      setPreview(null);
    } catch (reason) {
      setMessage("");
      setError(reason instanceof Error ? reason.message : "Could not finish the import. The preview is still available to retry.");
    } finally {
      setBusy(false);
    }
  };
  const resolveConflict = async (identityKey: string, resolution: "skip" | "add-separately") => {
    if (!preview) return;
    const token = preview.token;
    const previous = preview;
    setBusy(true);
    setError("");
    setPreview((current) => current ? { ...current, conflicts: current.conflicts.map((conflict) => conflict.identityKey === identityKey ? { ...conflict, resolution } : conflict) } : current);
    try { setPreview(await api.setConflictResolution(token, identityKey, resolution)); }
    catch (reason) { setPreview(previous); setError(reason instanceof Error ? reason.message : "Could not save that conflict choice. Try again."); }
    finally { setBusy(false); }
  };
  return (
    <main className="section-view imports-view">
      <header className="section-header"><span>IMPORTS</span><h1>Renew your vault</h1><p>Choose the latest cumulative Kindle export. Reading Desk adds only what is new.</p></header>
      {error && <div className="error-banner" role="alert"><WarningCircle size={20} />{error}</div>}
      <button className="import-dropzone" onClick={() => void choose()} disabled={busy}>
        <DownloadSimple size={36} weight="light" /><strong>{busy ? "Reading file…" : "Choose My Clippings.txt"}</strong><span>Your existing books and clipping blocks will not be deleted or replaced.</span>
      </button>
      {message && <div className="success-banner"><CheckCircle size={20} weight="fill" />{message}</div>}
      {preview && <section className="import-preview"><div className="preview-title"><div><span>READY TO IMPORT</span><h2>{preview.filename}</h2></div><button className="primary-button" onClick={() => void commit()} disabled={busy}>Add {preview.newCount} new clippings</button></div><div className="preview-stats"><div><strong>{preview.newCount}</strong><span>New clippings</span></div><div><strong>{preview.newBookCount}</strong><span>New books</span></div><div><strong>{preview.duplicateCount.toLocaleString()}</strong><span>Duplicates skipped</span></div><div><strong>{preview.conflicts.length}</strong><span>Need review</span></div></div>{preview.warnings.length > 0 && <div className="warning-line"><WarningCircle size={18} />{preview.warnings.length} entries have metadata warnings and will remain reviewable.</div>}{preview.conflicts.length > 0 && <div className="conflict-list"><h3>Content collisions</h3><p>These entries share Kindle identity data but contain different text. Skip is the safe default.</p>{preview.conflicts.map((conflict) => <article key={conflict.identityKey}><div><strong>{conflict.bookTitle}</strong><small>Existing</small><p>{conflict.existingContent || "Empty clipping"}</p><small>Incoming</small><p>{conflict.incomingContent || "Empty clipping"}</p></div><div className="conflict-actions"><button disabled={busy} className={conflict.resolution === "skip" ? "active" : ""} onClick={() => void resolveConflict(conflict.identityKey, "skip")}>Skip</button><button disabled={busy} className={conflict.resolution === "add-separately" ? "active" : ""} onClick={() => void resolveConflict(conflict.identityKey, "add-separately")}>Add separately</button></div></article>)}</div>}</section>}
      <section className="import-history"><h2>Import history</h2>{snapshot.imports.map((entry) => <div className="history-row" key={entry.id}><FileText size={20} /><div><strong>{entry.filename}</strong><span>{formatDate(entry.importedAt)}</span></div><span>{entry.imported.toLocaleString()} added</span><span>{entry.duplicates.toLocaleString()} duplicates</span></div>)}</section>
    </main>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>("library");
  const [selectedAuthorName, setSelectedAuthorName] = useState<string>();
  const [mainMenuVisible, setMainMenuVisible] = useState(true);
  const [booksVisible, setBooksVisible] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [primaryNavigationWidth, setPrimaryNavigationWidth] = useState(() =>
    readStoredWidth(PRIMARY_NAVIGATION_STORAGE_KEY, PRIMARY_NAVIGATION_DEFAULT, PRIMARY_NAVIGATION_MIN, PRIMARY_NAVIGATION_MAX));
  const [bookListWidth, setBookListWidth] = useState(() =>
    readStoredWidth(BOOK_LIST_STORAGE_KEY, BOOK_LIST_DEFAULT, BOOK_LIST_MIN, BOOK_LIST_MAX));
  const {
    snapshot, selectedBookId, setSelectedBookId, book, loading, appError, setAppError,
    updateState, refresh, retryLoad, chooseVault, refreshSelectedBook,
    checkForUpdates, downloadUpdate, installUpdate,
  } = useReadingDeskData(api, appVersion);
  const compactNavigation = viewportWidth <= PRIMARY_NAVIGATION_COMPACT_BREAKPOINT;
  const visibleNavigationWidth = mainMenuVisible
    ? (compactNavigation ? PRIMARY_NAVIGATION_COMPACT : primaryNavigationWidth)
    : 0;
  const maximumBookListWidth = Math.max(
    BOOK_LIST_MIN,
    Math.min(BOOK_LIST_MAX, viewportWidth - visibleNavigationWidth - BOOK_WORKSPACE_MIN),
  );
  const visibleBookListWidth = clamp(bookListWidth, BOOK_LIST_MIN, maximumBookListWidth);

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

  if (loading) return <main className="loading-screen"><BookOpen size={42} weight="light" /><span>Opening your reading desk…</span></main>;
  if (!snapshot) return <main className="loading-screen"><WarningCircle size={42} weight="light" /><span role="alert">{appError || "Could not open your reading desk."}</span><button className="primary-button" onClick={() => void retryLoad()}>Try again</button></main>;
  if (!snapshot.vaultPath) return <Onboarding onSelect={chooseVault} />;

  return (
    <div
      className={`app-shell${!mainMenuVisible ? " main-menu-hidden" : ""}`}
      style={{ "--primary-navigation-width": `${primaryNavigationWidth}px` } as React.CSSProperties}
    >
      {appError && <div className="error-banner app-error-banner" role="alert"><WarningCircle size={20} />{appError}<button onClick={() => setAppError("")} aria-label="Dismiss error">×</button></div>}
      {(updateState.stage === "available" || updateState.stage === "downloaded") && (
        <div className="update-notice" role="status">
          <div><strong>{updateState.stage === "downloaded" ? "Update ready" : `Reading Desk ${updateState.availableVersion || "update"} available`}</strong><span>{updateState.stage === "downloaded" ? "Restart when you are ready to install it." : "Download it from Settings when convenient."}</span></div>
          <button onClick={() => setRoute("settings")}>View update</button>
        </div>
      )}
      {mainMenuVisible && <Sidebar route={route} setRoute={setRoute} vaultPath={snapshot.vaultPath} vaultWatch={snapshot.vaultWatch} onHide={() => setMainMenuVisible(false)} />}
      {mainMenuVisible && !compactNavigation && <PanelResizer label="Resize primary navigation" value={primaryNavigationWidth} minimum={PRIMARY_NAVIGATION_MIN} maximum={PRIMARY_NAVIGATION_MAX} onChange={setPrimaryNavigationWidth} className="primary-navigation-resizer" />}
      {!mainMenuVisible && route !== "library" && <button className="floating-panel-toggle" onClick={() => setMainMenuVisible(true)} aria-label="Show main menu" title="Show main menu"><SidebarSimple size={21} /></button>}
      <div hidden={route !== "library"}
        className={`library-route${!booksVisible ? " books-hidden" : ""}`}
        style={{ "--book-list-width": `${visibleBookListWidth}px` } as React.CSSProperties}
      >
        {booksVisible && <LibraryPanel books={snapshot.books} selectedId={selectedBookId} onSelect={setSelectedBookId} onHide={() => setBooksVisible(false)} />}
        {booksVisible && <PanelResizer label="Resize book list" value={visibleBookListWidth} minimum={BOOK_LIST_MIN} maximum={maximumBookListWidth} onChange={setBookListWidth} className="book-list-resizer" />}
        {book ? <BookWorkspace book={book} books={snapshot.books} authors={snapshot.authors} onAuthor={openAuthor} onRefresh={refreshSelectedBook} onOpenBook={openBook} mainMenuVisible={mainMenuVisible} booksVisible={booksVisible} onToggleMainMenu={() => setMainMenuVisible((value) => !value)} onToggleBooks={() => setBooksVisible((value) => !value)} /> : <div className="empty-workspace"><Books size={42} /><h2>Your library is ready</h2><p>Import My Clippings.txt to create your first book note.</p><button className="primary-button" onClick={() => setRoute("imports")}>Import clippings</button></div>}
      </div>
      {route === "authors" && <AuthorsView authors={snapshot.authors} initialName={selectedAuthorName} onOpenBook={openBook} onMerged={async () => { await refresh(); }} />}
      {route === "imports" && <ImportsView snapshot={snapshot} onCommitted={async () => { await refresh(); }} />}
      {route === "insights" && <InsightsView snapshot={snapshot} />}
      {route === "settings" && <SettingsView
        appVersion={appVersion}
        snapshot={snapshot}
        updateState={updateState}
        onChooseVault={async () => { try { await chooseVault(); } catch (reason) { setAppError(reason instanceof Error ? reason.message : "Could not change the vault."); } }}
        onCheckForUpdates={checkForUpdates}
        onDownloadUpdate={downloadUpdate}
        onInstallUpdate={installUpdate}
      />}
      {route === "help" && <HelpView appVersion={appVersion} onGoToImports={() => setRoute("imports")} onGoToSettings={() => setRoute("settings")} />}
    </div>
  );
}
