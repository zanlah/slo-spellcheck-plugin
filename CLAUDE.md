# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Microsoft Word (Office 365) taskpane add-in that provides Slovenian spell checking. Uses the **nspell** library with the **dictionary-sl** Slovenian dictionary to check document text and offer replacement suggestions.

## Commands

- `npm run dev-server` — Start webpack dev server (HTTPS on port 3000). Run in one terminal.
- `npm start` — Sideload the add-in into Word (run in a second terminal after dev-server is up).
- `npm run build` — Production build to `dist/`.
- `npm run stop` — Uninstall the sideloaded add-in from Word.

No test runner or linter is configured.

## Architecture

The entire add-in is a single taskpane with three source files in `src/taskpane/`:

- **taskpane.js** — All application logic: dictionary loading (fetches `.aff`/`.dic` files at runtime from `dist/dict/`), word tokenization (regex-based, includes Slovenian characters č/š/ž/ć/đ), spell checking via nspell, and Word document interaction via the Office.js API (`Word.run`).
- **taskpane.html** — Static HTML loaded by the taskpane. Pulls in Office.js from CDN.
- **taskpane.css** — Styling (Fluent-inspired, 360px max-width panel).

**manifest.xml** — Office Add-in manifest. Defines the add-in ID, locale (`sl-SI`), permissions (`ReadWriteDocument`), and source location (`https://localhost:3000/taskpane.html`).

**webpack.config.js** — Bundles `taskpane.js`, copies HTML/CSS/assets/dictionary files to `dist/`. Uses `office-addin-dev-certs` for HTTPS in dev mode. Dictionary files from `node_modules/dictionary-sl` are copied to `dist/dict/`.

## Key Patterns

- Dictionary is lazy-loaded once and cached in `nspellInstance`. The `.aff` and `.dic` files are fetched via HTTP from the `dict/` path relative to the taskpane URL.
- `Word.run()` is used for all document interactions (reading body text, search-and-replace). Each call creates its own context — replacements use `matchCase: true, matchWholeWord: true` and replace only the first match.
- No framework — vanilla JS with direct DOM manipulation.
