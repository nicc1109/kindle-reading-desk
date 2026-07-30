const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getSnapshot: () => ipcRenderer.invoke("app:snapshot"),
  getBook: (bookId) => ipcRenderer.invoke("app:get-book", bookId),
  selectVault: () => ipcRenderer.invoke("vault:select"),
  chooseImport: () => ipcRenderer.invoke("import:choose"),
  previewImportPath: (filePath) => ipcRenderer.invoke("import:preview-path", filePath),
  setConflictResolution: (token, identityKey, resolution) =>
    ipcRenderer.invoke("import:set-resolution", token, identityKey, resolution),
  commitImport: (token) => ipcRenderer.invoke("import:commit", token),
  updateBook: (bookId, patch) => ipcRenderer.invoke("book:update", bookId, patch),
  updateClipping: (bookId, clippingId, patch) => ipcRenderer.invoke("clipping:update", bookId, clippingId, patch),
  mergeBooks: (sourceBookId, targetBookId) => ipcRenderer.invoke("book:merge", sourceBookId, targetBookId),
  mergeAuthors: (sourceName, targetName) => ipcRenderer.invoke("author:merge", sourceName, targetName),
  openBookInObsidian: (bookId) => ipcRenderer.invoke("book:open-obsidian", bookId),
  showBookInFolder: (bookId) => ipcRenderer.invoke("book:show-folder", bookId),
  onVaultChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("vault:changed", listener);
    return () => ipcRenderer.removeListener("vault:changed", listener);
  },
};

contextBridge.exposeInMainWorld("readingDesk", api);
