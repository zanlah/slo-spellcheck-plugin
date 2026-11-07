# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Microsoft Word (Office 365) taskpane add-in that provides Slovenian spell checking. Uses a prebuilt word automaton (`src/taskpane/dict/sl.dawg`, ~3.3M word forms from Sloleks 3.1 + LibreOffice Hunspell sl_SI) to check document text and offer replacement suggestions.

## Commands

- `npm run dev-server` — Start webpack dev server (HTTPS on port 3000). Run in one terminal.
- `npm start` — Sideload the add-in into Word (run in a second terminal after dev-server is up).
- `npm run build` — Production build to `dist/`.
- `npm run stop` — Uninstall the sideloaded add-in from Word.

- `npm test` — Node's built-in test runner over `test/*.test.mjs` (uses the real dictionary files).

## Architecture

The entire add-in is a single taskpane with three source files in `src/taskpane/`:

- **taskpane.js** — UI and Word interaction: dictionary loading (fetches `dict/sl.dawg` + `dict/custom.dic`), tokenization (`\p{L}` letters joined by `'`/`-`), running the checkers, and Office.js calls (`Word.run`).
- **speller.js** — Spell checking API (`check`, `correct`, `suggest`, `add`, `remove`): Hunspell-like casing rules, hyphenated compounds, user words, and the missing-diacritic heuristic (rare word whose č/š/ž variant is ≥128x more frequent).
- **morph.js** — Reader for `dict/sl-morph.bin` (lazy-loaded): `analyzeWord(form)` returns Sloleks readings (lemma, category, case/number/gender/…), `entries(word)` returns full paradigms, most frequent first.
- **paradigm-view.js** — Renders paradigms as tables (noun case × number, adjective gender tables per degree, verb tense × person).
- **checkers/oblike.js** — `createFormChecker(morph).check(text)`: case after prepositions, dual after dva/dve, plural after 3–4, genitive plural after 5+. Flags a word only when no Sloleks reading fits; stops at pronouns, verbs, adverbs, capitalised names, abbreviations and numbers to keep false alarms low. Measured on Šolar with `scripts/eval/` (teachers' annotations are incomplete — review `samples.json` by hand).
- **checkers/izgovor.js** — Spoken first sound for s/z and k/h (acronyms spelled out, numbers by their spoken form).
- **dawg.js** — Reader for the binary word automaton: exact lookup, per-word frequency class, and weighted Damerau-Levenshtein search used for suggestions.
- **taskpane.html** — Static HTML loaded by the taskpane. Pulls in Office.js from CDN.
- **taskpane.css** — Styling (Fluent-inspired, 360px max-width panel).

**manifest.xml** — Office Add-in manifest. Defines the add-in ID, locale (`sl-SI`), permissions (`ReadWriteDocument`), and source location (`https://localhost:3000/taskpane.html`).

**webpack.config.js** — Bundles `taskpane.js`, copies HTML/CSS/assets/dictionary files to `dist/`. Uses `office-addin-dev-certs` for HTTPS in dev mode. Copies `src/taskpane/dict/sl.dawg` to `dist/dict/` and emits a gzipped copy that `http-server -g` serves.

**scripts/build-dictionary.mjs** (`npm run build:dict -- <Sloleks.3.1.zip>`) — Regenerates `sl.dawg` and `sl-morph.bin` from Sloleks (streamed via `unzip -p`) plus the Hunspell forms from `dictionary-sl`/`nspell` (now build-time only). Drops non-standard forms and filters unchecked automatic proper nouns that look like corpus typos. Format is documented in `scripts/dawg-encode.mjs`.

## Key Patterns

- Dictionary is lazy-loaded once and cached in `spellerPromise`. Files are fetched from the `dict/` path relative to the taskpane URL.
- `Word.run()` is used for all document interactions (reading body text, search-and-replace). Each call creates its own context — replacements use `matchCase: true, matchWholeWord: true` and replace only the first match.
- No framework — vanilla JS with direct DOM manipulation.
