# Changelog

## 0.2.4 - 2026-08-11

- Fixed the packaged Windows app crash caused by importing the CommonJS `electron-updater` package as an ESM named export.
- Added a packaged-runtime verification step to the release check for the updater startup path.

## 0.2.3 - 2026-08-11

- Disabled `electron-builder`'s implicit tag publishing so the authorized GitHub Release step can upload Windows artifacts reliably.

## 0.2.2 - 2026-08-11

- Made the parser test suite portable by replacing its dependency on a private Kindle export with a committed synthetic fixture.
- Fixed clean GitHub Actions release builds while keeping personal `My Clippings.txt` data excluded from the repository.

## 0.2.1 - 2026-08-11

- Redesigned passage and book reflections with working prompts, honest save states, and responsive layouts.
- Improved generated Obsidian Markdown and removed repeated empty reflection headings.
- Added automatic Windows update checks backed by public GitHub Releases.
- Added in-app download progress and restart-to-install controls under Settings.
- Added a tagged GitHub Actions workflow that packages Windows releases automatically.

## 0.2.0 - 2026-07-30

- Added working Settings and Help destinations to replace inactive navigation controls.
- Added local-vault, privacy, import, and version guidance inside the desktop app.
- Added a dedicated Reading Desk Windows application icon and complete package metadata.
- Updated native Windows QA to exercise the newly packaged executable instead of an older installed copy.

## 0.1.0 - 2026-07-29

- Initial Reading Desk desktop release.
