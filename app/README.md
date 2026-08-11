# Reading Desk

Current desktop release: **0.2.1**.

[Download the latest Windows installer](https://github.com/nicc1109/kindle-reading-desk/releases/latest)

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

## Publish a Windows update

Installed Windows copies check the repository's public GitHub Releases shortly after launch. When a newer version exists, Reading Desk shows an update notice and provides download and restart controls in **Settings → App updates**.

To publish a version:

1. Update `version` in `package.json` and `package-lock.json` using semantic versioning.
2. Commit the tested changes directly to `main`.
3. Tag that commit, for example `git tag v0.2.2`.
4. Push the commit and tag: `git push origin main --follow-tags`.

The Windows release workflow builds the installer, runs the tests, and attaches the `.exe`, `.blockmap`, and `latest.yml` update metadata to a normal GitHub Release. Releases must not be marked as prereleases because stable installed copies ignore prerelease updates.
