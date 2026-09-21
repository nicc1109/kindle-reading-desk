import { BookOpen, Books, ChartBar, CheckCircle, DownloadSimple, Gear, Question, SidebarSimple, User, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { VaultWatchState } from "../../shared/types";
import type { Route } from "../routes";

function NavButton({ active, icon, label, onClick }: { active?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className={`nav-button${active ? " active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>{icon}<span>{label}</span></button>;
}

export function Sidebar({ route, setRoute, vaultPath, vaultWatch, onHide }: { route: Route; setRoute: (route: Route) => void; vaultPath: string; vaultWatch?: VaultWatchState; onHide: () => void }) {
  const watcherError = vaultWatch?.status === "error";
  const watcherLabel = watcherError ? "Vault watcher error" : vaultWatch?.status === "watching" ? "Watching vault" : "Vault watcher stopped";
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="Reading Desk"><BookOpen size={31} weight="light" /><button className="panel-toggle" onClick={onHide} aria-label="Hide main menu" title="Hide main menu"><SidebarSimple size={20} /></button></div>
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
      <div className={`vault-status${watcherError ? " error" : ""}`} title={vaultWatch?.message}>
        <div>{watcherError ? <WarningCircle size={17} weight="fill" /> : <CheckCircle size={17} weight="fill" />}<span>{watcherLabel}</span></div>
        <p>Obsidian vault</p><strong title={vaultPath}>{vaultPath.split(/[\\/]/).at(-1)}</strong>
      </div>
    </aside>
  );
}
