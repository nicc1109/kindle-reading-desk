# Reading Desk

Current desktop release: **0.2.0**.

Reading Desk is a Windows-first, local desktop companion for Kindle `My Clippings.txt` exports. It imports clippings incrementally into ordinary Markdown files in a dedicated Obsidian vault, then provides a book-first interface for reviewing highlights, preserving notes, and writing reflections.

## Use the app

1. Launch Reading Desk and choose or create a dedicated vault folder.
2. Open **Imports**, choose the latest cumulative `My Clippings.txt`, and review the preview.
3. Resolve any content collisions. **Skip** is the safe default; **Add separately** preserves both versions.
4. Commit the import. Reimporting the same file adds nothing, and a shorter export never deletes older clippings.
5. Browse books from **Library**, click an author to see all of their books, and open any generated note directly in Obsidian.

The vault remains usable without Reading Desk:

```text
Books/<book>.md
Authors/<author>.md
_Index/Library.md
.kindle-library/imports/
```

App-owned Markdown is bounded by HTML markers. Unknown frontmatter and writing outside managed regions are preserved.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run desktop:dev
npm test
npm run build
npm run dist:win
```

`npm run dev` opens the browser-based design preview with representative sample data. The real filesystem importer is available in Electron through the isolated preload bridge.

`npm run qa:windows` exercises the freshly packaged executable in `release/win-unpacked` against an isolated temporary vault.
