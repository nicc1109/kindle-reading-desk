import { useCallback, useEffect, useState } from "react";
import type { AppSnapshot, AppUpdateState, BookRecord, ReadingDeskApi } from "../../shared/types";

const errorMessage = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export function useReadingDeskData(api: ReadingDeskApi, appVersion: string) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const [book, setBook] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState("");
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    stage: window.readingDesk ? "idle" : "unsupported",
    currentVersion: appVersion,
    message: window.readingDesk ? undefined : "Update checks are available in the installed Windows app.",
  });

  const refresh = useCallback(async () => {
    const next = await api.getSnapshot();
    setSnapshot(next);
    setAppError("");
    setSelectedBookId((current) => current && next.books.some((candidate) => candidate.id === current) ? current : next.books[0]?.id);
    return next;
  }, [api]);

  useEffect(() => {
    void refresh().catch((reason) => setAppError(errorMessage(reason, "Could not load the vault."))).finally(() => setLoading(false));
    return api.onVaultChanged(() => void refresh().catch((reason) => setAppError(errorMessage(reason, "Could not refresh the vault."))));
  }, [api, refresh]);

  useEffect(() => {
    void api.getUpdateState().then(setUpdateState).catch((reason) => setUpdateState((current) => ({ ...current, stage: "error", message: errorMessage(reason, "Could not read the update status.") })));
    return api.onUpdateState(setUpdateState);
  }, [api]);

  useEffect(() => {
    if (!selectedBookId) { setBook(null); return; }
    void api.getBook(selectedBookId).then(setBook).catch((reason) => setAppError(errorMessage(reason, "Could not open that book.")));
  }, [api, selectedBookId, snapshot?.books]);

  const retryLoad = async () => {
    setLoading(true);
    try { await refresh(); }
    catch (reason) { setAppError(errorMessage(reason, "Could not load the vault.")); }
    finally { setLoading(false); }
  };
  const chooseVault = async () => {
    const next = await api.selectVault();
    setSnapshot(next);
    setSelectedBookId(next.books[0]?.id);
    setAppError("");
  };
  const refreshSelectedBook = async () => {
    await refresh();
    if (selectedBookId) setBook(await api.getBook(selectedBookId));
  };
  const checkForUpdates = async () => {
    try { setUpdateState(await api.checkForUpdates()); }
    catch (reason) { setUpdateState((current) => ({ ...current, stage: "error", message: errorMessage(reason, "Could not check for updates.") })); }
  };
  const downloadUpdate = async () => {
    try { setUpdateState(await api.downloadUpdate()); }
    catch (reason) { setUpdateState((current) => ({ ...current, stage: "error", message: errorMessage(reason, "Could not download the update.") })); }
  };
  const installUpdate = async () => {
    try { if (!await api.installUpdate()) throw new Error("Could not start the update installer."); }
    catch (reason) { setUpdateState((current) => ({ ...current, stage: "error", message: errorMessage(reason, "Could not install the update.") })); }
  };

  return { snapshot, selectedBookId, setSelectedBookId, book, loading, appError, setAppError, updateState, refresh, retryLoad, chooseVault, refreshSelectedBook, checkForUpdates, downloadUpdate, installUpdate };
}
