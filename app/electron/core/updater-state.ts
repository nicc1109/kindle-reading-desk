import type { AppUpdateState } from "../../shared/types.js";

export type UpdaterEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "up-to-date" }
  | { type: "downloading"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }
  | { type: "unsupported" };

export function reduceUpdaterState(current: AppUpdateState, currentVersion: string, event: UpdaterEvent): AppUpdateState {
  const base = { ...current, currentVersion };
  switch (event.type) {
    case "checking":
      return { ...base, stage: "checking", progress: undefined, message: undefined };
    case "available":
      return { ...base, stage: "available", availableVersion: event.version, progress: undefined, message: `Reading Desk ${event.version} is ready to download.` };
    case "up-to-date":
      return { ...base, stage: "up-to-date", availableVersion: undefined, progress: undefined, message: "You are using the latest version." };
    case "downloading": {
      const progress = Math.max(0, Math.min(100, Math.round(event.percent)));
      return { ...base, stage: "downloading", progress, message: progress ? "Downloading the update…" : "Starting download…" };
    }
    case "downloaded":
      return { ...base, stage: "downloaded", availableVersion: event.version, progress: 100, message: "The update is ready. Restart Reading Desk to install it." };
    case "error":
      return { ...base, stage: "error", progress: undefined, message: `Update check failed: ${event.message}` };
    case "unsupported":
      return { ...base, stage: "unsupported", message: "Update checks are available in the installed Windows app." };
  }
}
