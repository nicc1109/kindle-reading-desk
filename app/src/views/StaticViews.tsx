import { BookOpen, CheckCircle, FolderOpen, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { AppSnapshot, BookStatus } from "../../shared/types";
import { StatusDot } from "../components/StatusDot";

export function InsightsView({ snapshot }: { snapshot: AppSnapshot }) {
  const statuses = (["Reading", "Finished", "Paused", "Reference"] as BookStatus[]).map((status) => ({ status, count: snapshot.books.filter((book) => book.status === status).length }));
  const recurring = snapshot.authors.filter((author) => author.books.length > 1).sort((a, b) => b.books.length - a.books.length).slice(0, 6);
  return <main className="section-view insights-view">
    <header className="section-header"><span>READING INSIGHTS</span><h1>A quiet view of your reading</h1><p>Book-level signals for orientation—not a feed of every highlight.</p></header>
    <div className="insight-stats"><div><strong>{snapshot.books.length}</strong><span>Books in vault</span></div><div><strong>{snapshot.authors.length}</strong><span>Authors</span></div><div><strong>{snapshot.books.reduce((sum, book) => sum + book.clippingCount, 0).toLocaleString()}</strong><span>Highlights & notes</span></div></div>
    <div className="insights-columns"><section><h2>Reading lifecycle</h2>{statuses.map(({ status, count }) => <div className="insight-row" key={status}><span><StatusDot status={status} />{status}</span><strong>{count}</strong></div>)}</section><section><h2>Authors you returned to</h2>{recurring.map((author) => <div className="insight-row" key={author.id}><span>{author.name}</span><strong>{author.books.length} books</strong></div>)}</section></div>
  </main>;
}

export function HelpView({ appVersion, onGoToImports, onGoToSettings }: { appVersion: string; onGoToImports: () => void; onGoToSettings: () => void }) {
  return <main className="section-view help-view">
    <header className="section-header"><span>HELP</span><h1>From Kindle export to reading notes</h1><p>Reading Desk keeps the process simple and leaves your vault readable in any Markdown editor.</p></header>
    <div className="help-layout">
      <section className="help-steps">
        <article><span>1</span><div><h2>Choose a vault</h2><p>Use a dedicated Obsidian folder so Reading Desk can keep books, authors, and import records organized.</p></div></article>
        <article><span>2</span><div><h2>Import My Clippings.txt</h2><p>Connect your Kindle, open its documents folder, and choose the latest cumulative export.</p></div></article>
        <article><span>3</span><div><h2>Review before adding</h2><p>Duplicates are skipped. If Kindle identity data collides with different text, Skip remains the safe default.</p></div></article>
        <article><span>4</span><div><h2>Read and reflect</h2><p>Favorite passages, add tags, and write clipping notes or book reflections that are saved back into ordinary Markdown.</p></div></article>
      </section>
      <aside className="help-aside"><h2>Good to know</h2><p>Reimporting the same file does not duplicate clippings, and a shorter export never removes older material.</p><p>Your own frontmatter and writing outside Reading Desk’s managed regions stay untouched.</p><div className="help-actions"><button className="primary-button" onClick={onGoToImports}>Open Imports</button><button className="secondary-button" onClick={onGoToSettings}>Review Settings</button></div><small>Reading Desk {appVersion}</small></aside>
    </div>
  </main>;
}

export function Onboarding({ onSelect }: { onSelect: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const select = async () => {
    setBusy(true); setError("");
    try { await onSelect(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open that vault. Try again."); }
    finally { setBusy(false); }
  };
  return <main className="onboarding">
    <BookOpen size={46} weight="light" /><span>READING DESK</span><h1>Turn Kindle clippings into a lasting reading practice.</h1>
    <p>Choose or create a dedicated Obsidian vault. Your books, highlights, notes, and reflections stay as ordinary Markdown on your computer.</p>
    {error && <div className="error-banner" role="alert"><WarningCircle size={20} />{error}</div>}
    <button className="primary-button large" disabled={busy} onClick={() => void select()}><FolderOpen size={20} /> {busy ? "Opening vault…" : "Choose or create a vault"}</button>
    <div className="privacy-note"><CheckCircle size={18} /><span>Local-only · no account · no analytics</span></div>
  </main>;
}
