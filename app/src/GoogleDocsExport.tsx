import { useEffect, useRef, useState } from "react";
import type { BookRecord, ReadingDeskApi } from "../shared/types";
import type { GoogleDocsAvailability, GoogleDocsExportResult } from "../shared/google-docs";
import { exportSections, orderedHighlights } from "../shared/highlight-export";

export function GoogleDocsExport({ book, api, onClose }: { book: BookRecord; api: ReadingDeskApi; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [availability, setAvailability] = useState<GoogleDocsAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GoogleDocsExportResult | null>(null);
  const count = orderedHighlights(book).length;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void api.getGoogleDocsAvailability().then((value) => { if (active) setAvailability(value); })
      .catch(() => { if (active) setError("Could not check Google Docs availability. Close and try again."); });
    return () => { active = false; element?.close(); };
  }, [api]);
  const startExport = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setResult(null);
    try { setResult(await api.exportBookToGoogleDocs(book.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Export failed. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const cancel = async () => {
    try { await api.cancelGoogleDocsExport(); }
    catch { setError("Could not cancel the export. Wait for it to finish."); }
  };
  return <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title" onCancel={(event) => {
    event.preventDefault();
    if (busyRef.current) void cancel(); else onClose();
  }}>
    <header><div><span className="export-eyebrow">BOOK EXPORT</span><h2 id="export-title">Export to Google Docs</h2></div><button className="secondary-button" disabled={busy} onClick={onClose}>Close</button></header>
    <p><strong>{book.title}</strong> · {count} {count === 1 ? "highlight" : "highlights"}</p>
    <p>All highlights, in book order, in <strong>bold</strong>. Write your annotations in the normal-text Notes paragraphs. Existing Kindle notes and vault reflections are not included.</p>
    <p>Each export creates a new document. Later edits in Google Docs are not synced to your vault.</p>
    <div className="export-notice" role="status">{busy ? "Complete Google sign-in in your browser, then wait for the export…" : availability?.message || "Checking Google Docs availability…"}</div>
    {!count && <p role="status">This book has no highlights to export.</p>}
    {error && <p className="export-error" role="alert">{error}</p>}
    {result && <div className={`export-result ${result.status}`} role="status">
      <p>{result.status === "complete" ? `${result.highlightCount} highlights exported. Your document is ready.` : result.message}</p>
      <a href={result.documentUrl} target="_blank" rel="noopener noreferrer">{result.status === "complete" ? "Open Google Doc" : "Inspect incomplete Google Doc"} ↗</a>
    </div>}
    <section className="export-preview" aria-label="Document preview">
      {exportSections(book).map((section, index) => section.kind === "title"
        ? <h3 key={index}>{section.text}</h3>
        : <p key={index} className={`export-${section.kind}`}>{section.kind === "highlight" ? <strong>{section.text}</strong> : section.text}</p>)}
    </section>
    <footer><span>Only the selected book is sent to Google.</span>{busy
      ? <button className="secondary-button" onClick={() => void cancel()}>Cancel export</button>
      : <button className="primary-button" disabled={!availability?.available || !count || Boolean(result)} onClick={() => void startExport()}>Sign in &amp; create document</button>}</footer>
  </dialog>;
}
