# Book Engine

A high-performance, local-first reading and study desktop application built with **Tauri v2**, **React 18+**, **TipTap/ProseMirror**, **SQLite FTS5**, and **Python**.

Designed for deep reading of academic, technical, and dense literature with persistent paragraph anchoring, zero-hallucination extractive study generation, and sub-millisecond search.

---

## Core Design Principles

1. **Markdown Vault is Ground Truth:**
   - The user's Markdown vault (`vault/`) is the sole permanent record.
   - Your study progress is part of that record. Every card review and every piece of reading time is written as one line to `vault/notes/<book-id>/reviews.jsonl` and `vault/notes/<book-id>/reading.jsonl`.
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
    └── notes/<book-id>/         # Chapter notes, serialized highlights, and study decks
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
```

Ingestion relocates endnotes into chapter-level inline footnotes `[^n]`, tags every paragraph with persistent anchors `^p-xxx`, extracts diagrams into `assets/`, and generates `_meta.json`.

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

#### Build Production Release & Windows Installer (NSIS)
To compile the optimized release executable and native Windows installer package:

```bash
# From apps/desktop directory (or root via npm --prefix apps/desktop run tauri build)
npm run tauri build
```

The build produces:
- **Standalone Portable Binary**: `apps/desktop/src-tauri/target/release/book-engine-desktop.exe` (~13.8 MB)
- **Windows NSIS Setup Package**: `apps/desktop/src-tauri/target/release/bundle/nsis/Book Engine_0.1.0_x64-setup.exe` (~3.5 MB)


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
