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

- **Node.js**: `22.6.0+` and `npm`. The frontend tests are TypeScript files that Node runs itself, with
  `--experimental-strip-types`, and that flag arrived in Node 22.6.0. The root `package.json` says the same in
  `engines`, so `npm install` warns you when your Node is older.
- **Rust & Cargo**: `1.88+` (with Tauri v2 prerequisites installed for your OS). Tauri 2.11.5 itself asks for
  1.77.2, but other crates of the same build ask for 1.88. `apps/desktop/src-tauri/Cargo.toml` says `1.88` in
  `rust-version`, so cargo tells you plainly instead of failing inside a dependency.
- **Python**: `3.11+` with `pip`. The import reads `pyproject.toml` with `tomllib`, which arrived in 3.11.

---

## Developer Quickstart

### 1. Ingestion Pipeline (`packages/ingestion`)

Install the packages with the versions of the lock file, then the ingestion package in editable mode:

```bash
# Install the dependencies with the exact versions that the import is tested with
python -m pip install -r packages/ingestion/requirements.lock

# Install the CLI tool
python -m pip install --no-deps -e packages/ingestion
```

Keep the versions of the lock file: a new version of a package, such as pymupdf4llm, can change the text of a book that you import again. `pytest packages/ingestion/tests` fails when an installed version is not the version of the lock file.

The lock file gives you the tests and the checks as well as the import: pytest, Pillow, packaging, mypy and ruff. `pyproject.toml` keeps them apart from the import in its `dev` group, so `pip install book-engine-ingestion` alone gives a computer only what it needs to read a book (IN-11).

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

A PDF import keeps every part that the PDF outline names, not only the chapters: the contents, the preface, the appendices, the glossary, the references and the index. Each part is a chapter file, `ch-01.md`, `ch-02.md` and so on, in page order. Only the chapters, the pages between them (such as the title page of a part) and the appendices make practice cards. The import prints the pages that no part of the outline covers, which it does not import. A PDF book that you import again with `--force` can get new chapter numbers, and your notes and reading time move with their chapters.

An EPUB import keeps every text that the book shows: code with its lines and spaces, figures and their captions, boxes beside the text, definition lists and line breaks. A link in the text keeps its words, and only a link to a note becomes a footnote. The header and the license that Project Gutenberg adds to its books are left out. To get text that an older import lost, import the book again with `--force`. Your notes move with their paragraphs.

Each entry of the contents names the chapter file that holds it and the paragraph where it starts, so the sidebar opens the right place even when chapters share a title, such as "CHAPTER I." in every book of The Wealth of Nations. An EPUB book imported before this change shows its chapter list in the sidebar until you import it again.

An import stops, and changes nothing, when the vault already has the book, for example an annotated copy of a PDF you imported before. It names your own files for that book in `vault/notes/<book-id>/`. Run the import again with `--force` to replace the book. Your own files are kept, and they follow their text when a chapter or a paragraph gets another number: your bookmark, reading time, notes, highlights and citations. For example, a new import of a PDF book keeps its front matter as parts of their own, so chapter 7 can move from `ch-07.md` to `ch-11.md`. When the new book does not have the text of a place, that place points to the nearest paragraph, and the import names it. Close the app before you import a book again.

An import builds the book in `vault/.import/<book-id>/` and checks it there: every paragraph must have its anchor, and every footnote link must have its note. Only a whole book that passes the check goes into the vault, together with its practice deck and your moved files. When an import fails or stops, for example on an error in chapter 2, the vault stays as it was, and the error names the problem. A new import writes the whole book folder again, so no chapter file or picture of the older import stays. Two imports of the same file write the same bytes.

A book id comes from the file name. Letters with marks become plain letters, and a name in another script, such as "Война и мир", gets a short code, such as `book-74b780f4`. Two files can still get the same book id, such as "Principles of Marketing 2020.pdf" and "Principles of Marketing 2023.pdf". The import of the second file then stops, even with `--force`, and names the file of the other book. To import it as a different book, run it again with the `--book-id` that the stop gives. To replace the other book with it, run it again with `--book-id <that book id> --force`. Each import records its file in `_meta.json`, so a new import finds the book that the same file made, also after you rename the file.

The import writes its files with Unix line endings (`\n`), also on Windows. A chapter or notes file with Windows line endings, from an older import or from a text editor, still works in the app. A book that an older import made from an EPUB file with Windows line endings can have paragraphs without an anchor. Import it again with `--force` to repair it.

A book id names the folders of the book, so it has 1 to 255 characters from a-z, 0-9, `-` and `_`, and it does not start with `-`. An import with another `--book-id`, such as `../my-book` or `My Book`, stops before it writes anything. The app uses the same rule: a book folder that you rename by hand to another name does not open, and no name that the app page sends can reach a file outside the vault.

A book you import while the app is open shows after you click **Rescan library** at the bottom of the book list. The app reads the library again and updates search.

If search cannot read a file of a book, such as a damaged `_meta.json` or a chapter that is not UTF-8 text, the error bar names the file, and the other books are still updated. A book you delete from the vault leaves search when the app opens again or after a rescan.

Search shows each result as plain text, with the words it found marked. A tag in a chapter file, such as `<sup>`, is not shown and is not found, so a search for "sup" finds only real words. The first time the app opens after this change, it reads every chapter for search again, which takes a few seconds. An EPUB book that shows HTML as an example, such as `<img>`, keeps it as text when you import it.

The app knows a book by the name of its folder in `vault/books/`. A book you delete also leaves practice and the "All Books" analytics. Its notes and study log stay in `vault/notes/`, so its progress comes back if you put the book back. If you rename a book folder, the book opens as a new book, and the error bar tells you the name to give it back.

The analytics show how long you read each chapter and which chapters you finished. Time counts while the words of a chapter are on screen and the app window has focus. A chapter is finished when you scroll to 90% of it. The analytics show no word count and no reading speed, because the app cannot see how many words you read.

The review heatmap counts each review on the day you made it, in the time zone of your computer. Its rows go from Monday to Sunday, and its last column ends today.

The analytics show a dash for a number the app does not have, such as the retention rate before your first review. "Reviews Due" counts the reviews that practice gives you now, and new cards are counted apart. The reading table names each chapter and book by its title.

---

### 2. Desktop Application (`apps/desktop`)

Install Node dependencies from the repository root. `apps/desktop` is a workspace of the root package, so this one
command installs the frontend as well, and it writes one lock file, `package-lock.json`, at the root:

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

Run the full verification suite before committing changes. One command runs the lot, and stops at the first
failure (TL-05):

```bash
npm run check
```

The same three groups run on every push, in `.github/workflows/check.yml`. To run one group on its own, or to see
what `npm run check` is made of:

```bash
# 1. Verify Rust backend compilation, strict typing, and unit tests
#    (unit tests run in a temporary vault and database, never your real data)
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

# 2. Verify frontend TypeScript types, unit tests, and production build
npm --prefix apps/desktop test
npm run build

# 3. Put a book in the vault, if it is still empty. This makes a small sample book and imports it, so the
#    checks below have something to read. Your own books are untouched, and nothing of this goes into git.
python -m ingest.sample_generator --vault vault

# 4. Verify paragraph anchor and footnote integrity in every book of the vault
#    (name one book folder to check only that book; a folder with no book in it fails)
python .agent/skills/audit-anchors.py

# 5. Verify that every practice card says what its chapter says
python .agent/skills/audit-practice.py

# 6. Run SQLite FTS5 query latency benchmarks (must pass under 15ms)
#    (it measures a copy of your search index and never writes to the index itself)
python .agent/skills/benchmark-fts.py

# 7. Run ingestion pipeline automated test suite
python -m pytest packages/ingestion/tests/
```

---

## License

Private & Proprietary. All rights reserved.
