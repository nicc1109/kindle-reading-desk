import { ArrowClockwise, BookOpen, CheckCircle, DownloadSimple, FolderOpen } from "@phosphor-icons/react";
import type { AppSnapshot, AppUpdateState } from "../../shared/types";

export function SettingsView({ appVersion, snapshot, updateState, onChooseVault, onCheckForUpdates, onDownloadUpdate, onInstallUpdate }: {
  appVersion: string;
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
  const actionLabel = updateDownloaded ? "Restart and install" : updateAvailable ? "Download update" : checking ? "Checking…" : downloading ? `Downloading ${updateState.progress || 0}%` : "Check for updates";
  const stageLabel: Record<AppUpdateState["stage"], string> = {
    idle: "Ready to check", checking: "Checking for updates", "up-to-date": "Up to date",
    available: `Version ${updateState.availableVersion || "new"} available`, downloading: `Downloading ${updateState.progress || 0}%`,
    downloaded: "Ready to install", error: "Update problem", unsupported: "Installed app only",
  };
  return <main className="section-view settings-view">
    <header className="section-header"><span>SETTINGS</span><h1>Your reading desk, kept local</h1><p>Choose where Reading Desk stores its Markdown library and review what the app can access.</p></header>
    <div className="settings-grid">
      <section className="settings-card vault-settings-card"><div className="settings-card-heading"><FolderOpen size={26} weight="light" /><div><h2>Obsidian vault</h2><p>Books, authors, and import history are stored in this folder.</p></div></div><div className="vault-path-value" title={snapshot.vaultPath || undefined}>{snapshot.vaultPath}</div><button className="secondary-button" onClick={() => void onChooseVault()}><FolderOpen size={18} /> Choose a different vault</button></section>
      <section className="settings-card"><div className="settings-card-heading"><CheckCircle size={26} weight="light" /><div><h2>Privacy</h2><p>Reading Desk works without an account or cloud service.</p></div></div><ul className="settings-facts"><li>Your library stays on this computer. Optional Google Docs exports send only the selected book's highlights to Google.</li><li>No analytics or reading telemetry is collected.</li><li>Existing Markdown outside managed sections is preserved during imports.</li></ul></section>
      <section className="settings-card"><div className="settings-card-heading"><BookOpen size={26} weight="light" /><div><h2>About Reading Desk</h2><p>A local companion for Kindle clippings and Obsidian.</p></div></div><dl className="about-list"><div><dt>Version</dt><dd>{appVersion}</dd></div><div><dt>Storage</dt><dd>Local Markdown</dd></div><div><dt>Platform</dt><dd>Windows desktop</dd></div></dl></section>
      <section className="settings-card update-settings-card" aria-live="polite">
        <div className="settings-card-heading"><ArrowClockwise size={26} weight="light" /><div><h2>App updates</h2><p>Reading Desk checks public GitHub Releases and lets you choose when to install.</p></div></div>
        <div className={`update-status update-status-${updateState.stage}`}><div><strong>{stageLabel[updateState.stage]}</strong><span>Current version {updateState.currentVersion}</span></div>{downloading && <div className="update-progress" role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={updateState.progress || 0}><span style={{ width: `${updateState.progress || 0}%` }} /></div>}{updateState.message && <p>{updateState.message}</p>}</div>
        <button className={updateDownloaded || updateAvailable ? "primary-button" : "secondary-button"} onClick={() => void updateAction()} disabled={checking || downloading || updateState.stage === "unsupported"}>{updateAvailable ? <DownloadSimple size={18} /> : <ArrowClockwise size={18} />}{actionLabel}</button>
      </section>
    </div>
  </main>;
}
