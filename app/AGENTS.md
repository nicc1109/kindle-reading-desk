# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- This is a Windows-first Electron desktop app, with the browser build retained for visual preview and QA.
- The approved visual target is the revised “Reading Desk” mock: warm editorial styling, compact searchable book list, and one book workspace at a time.
- Books are the primary unit. Highlights sort by page/location inside a book; authors, imports, and book-level reading insights are supporting views.
- The library orders books by their latest clipping timestamp, the only reading-recency signal available in My Clippings.txt.
- The primary navigation and book list are resizable desktop panes. Their preferred widths persist locally, while compact layouts clamp them without discarding those preferences.
- Clipping-level writing is called Notes in the UI. The Notes editor is collapsed whenever a clipping is selected and opens only on demand; book-level reflection remains a separate feature.
- There is no separate full-page book mode. Independent pane visibility and resizing provide the workspace controls.
- List rows are explicitly excerpts; the selected clipping view must always render the complete text stored in My Clippings.txt.
- The Obsidian vault is canonical. Existing clipping blocks are append-only during imports; user-authored Markdown outside managed regions must be preserved.
- The first release is local-only, English UI, and has no account, analytics, cloud database, external metadata lookup, or AI feature.
