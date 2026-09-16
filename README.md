# Book Engine

A high-performance, local-first reading and study desktop application built with **Tauri v2**, **React 18+**, **TipTap/ProseMirror**, **SQLite FTS5**, and **Python**.

Designed for deep reading of academic, technical, and dense literature with persistent paragraph anchoring, zero-hallucination extractive study generation, and sub-millisecond search.

---

## Core Design Principles

1. **Markdown Vault is Ground Truth:**
   - The user's Markdown vault (`vault/`) is the sole permanent record.
   - Your study progress is part of that record. Every card review and every piece of reading time is written as one line to `vault/notes/<book-id>/reviews.jsonl` and `vault/notes/<book-id>/reading.jsonl`.
   - Where you stopped reading is kept per book in `vault/notes/<book-id>/bookmark.json`, and your reader settings (theme, pacer speed, Gatekeeper, daily target) in `vault/preferences.json`. A release build or a new PC opens the book you read last, at the paragraph where you stopped, with your own settings.
   - Your exit assessment of a book is kept next to your notes, in `vault/notes/<book-id>/inspectional.json`. An import makes `vault/books/<book-id>/` again, so nothing you write is kept there.
   - Only one copy of the app runs. A second start brings the open window to the front, so two copies never save over each other's work.
   - SQLite (`index.db`) is strictly an ephemeral query accelerator and search cache stored in OS AppData (`%APPDATA%\book-engine\app_cache\`).
   - If `index.db` is deleted, the system rebuilds the search index from the vault files and puts your card schedules, review history and reading time back from those log files at the next start. Nothing is lost, and moving to another PC takes your progress with the vault.

2. **W3C Text Quote Selector Highlighting Standard:**
   - Highlights do not rely on fragile character-count offsets or volatile DOM tree paths.
   - Highlights store `exact`, `prefix`, and `suffix` context fields alongside paragraph anchors (`^p-xxx`) to survive external edits and markdown formatting changes.

3. **Single-Chapter DOM Virtualization:**
   - Multi-chapter books are never mounted simultaneously in the DOM.
   - The TipTap/ProseMirror editor virtualizes and renders only the current active chapter, ensuring 60+ FPS scrolling and sub-10ms input response even for massive texts.

4. **Zero-Hallucination Extractive Practice:**
   - Study items (Cloze deletions, scrambled clauses, and citations) are 100% deterministic and extractive.
   - Answer keys are programmatically verified as exact character substrings of the source chapter text. Generative hallucinations are strictly prohibited.

---

## Repository Structure

```
book-engine/
├── .agent/
│   └── skills/                  # Autonomous verification scripts (audit-anchors, benchmark-fts)
├── AGENTS.md                    # Canonical agent directives, guardrails & standards
├── apps/
│   └── desktop/                 # Tauri v2 desktop application
│       ├── src/                 # React 18+ frontend (TipTap, Floating UI, Tailwind CSS)
│       └── src-tauri/           # Rust backend (Tauri v2, rusqlite/FTS5, vault watcher)
├── packages/
│   └── ingestion/               # Python CLI & pipeline for deterministic book parsing
│       ├── ingest/              # EPUB/PDF parser, anchor tagging, and salience scorer
│       └── tests/               # Pytest suite for ingestion integrity
├── scripts/                     # Reusable automation utilities (desktop shortcut generator)
└── vault/                       # Local Markdown vault (Sole Permanent Record)
    ├── books/<book-id>/         # Chapter Markdown (`ch-XX.md`), `_meta.json`, and extracted assets
    └── notes/<book-id>/         # Chapter notes, highlights, your exit assessment, and study decks
```

---

## Prerequisites

Ensure the following runtimes are installed on your workstation:

- **Node.js**: `18.0+` (LTS recommended) and `npm`
- **Rust & Cargo**: `1.75+` (with Tauri v2 prerequisites installed for your OS)
- **Python**: `3.11+` with `pip`

---

## Developer Quickstart

### 1. Ingestion Pipeline (`packages/ingestion`)

Install the ingestion package in editable mode:

```bash
# Install dependencies and CLI tool
python -m pip install -e packages/ingestion
```

Ingest an EPUB or PDF into the local vault:

```bash
# Ingest an EPUB file into vault/books/<book-id>/
python -m ingest.cli path/to/book.epub --vault vault

# Or use the installed CLI command directly
book-ingest path/to/book.epub --vault vault --book-id my-book

# Replace a book that the vault already has (your own files for it are kept)
python -m ingest.cli path/to/book.epub --vault vault --force
```

Ingestion relocates endnotes into chapter-level inline footnotes `[^n]`, tags every paragraph with persistent anchors `^p-xxx`, extracts diagrams into `assets/`, and generates `_meta.json`.

An import stops, and changes nothing, when the vault already has the book, for example an annotated copy of a PDF you imported before. It names your own files for that book in `vault/notes/<book-id>/`. Run the import again with `--force` to replace the book: your own files are kept, but a paragraph they point to can be a different paragraph after the new import.

A book you import while the app is open shows after you click **Rescan library** at the bottom of the book list. The app reads the library again and updates search.

If search cannot read a file of a book, such as a damaged `_meta.json` or a chapter that is not UTF-8 text, the error bar names the file, and the other books are still updated. A book you delete from the vault leaves search when the app opens again or after a rescan.

Search shows each result as plain text, with the words it found marked. A tag in a chapter file, such as `<sup>`, is not shown and is not found, so a search for "sup" finds only real words. The first time the app opens after this change, it reads every chapter for search again, which takes a few seconds. An EPUB book that shows HTML as an example, such as `<img>`, keeps it as text when you import it.

The app knows a book by the name of its folder in `vault/books/`. A book you delete also leaves practice and the "All Books" analytics. Its notes and study log stay in `vault/notes/`, so its progress comes back if you put the book back. If you rename a book folder, the book opens as a new book, and the error bar tells you the name to give it back.

The analytics show how long you read each chapter and which chapters you finished. Time counts while the words of a chapter are on screen and the app window has focus. A chapter is finished when you scroll to 90% of it. The analytics show no word count and no reading speed, because the app cannot see how many words you read.

The review heatmap counts each review on the day you made it, in the time zone of your computer. Its rows go from Monday to Sunday, and its last column ends today.

The analytics show a dash for a number the app does not have, such as the retention rate before your first review. "Reviews Due" counts the reviews that practice gives you now, and new cards are counted apart. The reading table names each chapter and book by its title.

---

### 2. Desktop Application (`apps/desktop`)

Install Node dependencies from the repository root:

```bash
npm install
```

#### Run in Browser (Vite Dev Server)
For rapid frontend component and style development with browser mocks (sample books, sample notes, and browser storage). The mocks answer only in this browser dev server. Inside the desktop app, a failed backend call shows an error instead:

```bash
npm run dev
# Starts Vite dev server at http://localhost:5173
```

#### Run Native Desktop App (Tauri v2)
To launch the full native desktop client with the Rust backend and SQLite FTS5 search:

```bash
npm run tauri dev
```

#### One-Click Windows Desktop Shortcut
To generate a convenient desktop shortcut (`Book Engine.lnk`) configured with automated port cleanup and minimized console launching:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create_desktop_shortcut.ps1
```

If Book Engine is already open, the shortcut brings its window to the front. It does not stop the dev server of the open app, and it does not start a second copy. A shortcut keeps the command it was made with, so run the script again after the script changes.

#### Build Production Release & Windows Installer (NSIS)
To compile the optimized release executable and native Windows installer package:

```bash
# From apps/desktop directory (or root via npm --prefix apps/desktop run tauri build)
npm run tauri build
```

The build produces:
- **Standalone Portable Binary**: `apps/desktop/src-tauri/target/release/book-engine-desktop.exe` (~13.8 MB). Put a `vault` folder beside it and it finds it on its own; otherwise it asks you to choose your vault folder the first time and remembers it.
- **Windows NSIS Setup Package**: `apps/desktop/src-tauri/target/release/bundle/nsis/Book Engine_0.1.0_x64-setup.exe` (~3.5 MB). On the first start it asks you to choose your vault folder, because the installer starts the app in its own install folder.

The built app runs only its own code. A tag in a book cannot run a script, the window loads pictures only from the `assets` folder of each book, and it reaches no server but Google Fonts for its two fonts. `npm run tauri dev` and the browser dev server do not use these rules, so try a change that loads something new in a built app.


---

### 3. Verification & Benchmarking Suite

Run the full verification suite before committing changes:

```bash
# 1. Verify Rust backend compilation, strict typing, and unit tests
#    (unit tests run in a temporary vault and database, never your real data)
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

# 2. Verify frontend TypeScript types, unit tests, and production build
npm --prefix apps/desktop test
npm run build

# 3. Verify paragraph anchor and footnote integrity in vault
python .agent/skills/audit-anchors.py vault/books/sample
python .agent/skills/audit-anchors.py vault/books/wealth-of-nations

# 4. Run SQLite FTS5 query latency benchmarks (must pass under 15ms)
python .agent/skills/benchmark-fts.py

# 5. Run ingestion pipeline automated test suite
python -m pytest packages/ingestion/tests/
```

---

## License

Private & Proprietary. All rights reserved.
