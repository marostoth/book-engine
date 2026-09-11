# System Architecture Specification

## 1. High-Level Topology

Raw Documents (EPUB / PDF)
          │
          ▼
[ Ingestion Pipeline ] ──(Python CLI / packages/ingestion)
          │
          ├── Relocates endnotes -> inline [^n] per chapter
          ├── Normalizes typography & extracts images -> assets/
          ├── Injects persistent paragraph anchors (^p-001)
          └── Generates _meta.json & practice-deck.md
          │
          ▼
LOCAL FILE VAULT (Sole Permanent Record)
  books/<book-id>/
    ├── _meta.json            <-- Hierarchical TOC & stats
    ├── assets/               <-- Extracted diagrams/figures
    └── ch-01.md              <-- Tagged source text
  notes/<book-id>/
    ├── ch-01-notes.md        <-- User notes & reflections
    └── practice-deck.md      <-- Pre-generated study items
          │
          ▲ (File System Watcher / Async Read-Write)
          ▼
TAURI V2 DESKTOP APPLICATION
  OS AppData Cache (Ephemeral):
    └── index.db (SQLite + FTS5)  <-- Sub-15ms search & FSRS
  Core Shell (Rust + TipTap UI):
    ├── Single-Chapter Virtualized DOM View
    ├── W3C Text Quote Highlight Engine
    ├── Popover Footnote Resolver
    └── Extractive Practice & Gatekeeper Suite

### As-Built Directory Manifest

```
book-engine/
├── .agent/
│   └── skills/                  # Autonomous verification harnesses
│       ├── audit-anchors.py         # Verifies paragraph anchor & footnote definition integrity
│       └── benchmark-fts.py         # Benchmarks SQLite FTS5 query latency (<15ms target)
├── apps/
│   └── desktop/                 # Tauri v2 native desktop application & React frontend
│       ├── src/                 # React 18+ client application
│       │   ├── components/      # UI components (Reader, Sidebar, TopNav, Modals, Popovers)
│       │   │   ├── BookSelector.tsx     # Dynamic vault library switcher popover
│       │   │   ├── FootnotePopover.tsx  # Floating UI citation preview popover
│       │   │   ├── GatekeeperModal.tsx  # Chapter Gatekeeper 3-card recall challenge modal
│       │   │   ├── NotesPane.tsx        # Dual-pane Markdown reflection notes editor
│       │   │   ├── OmniSearchModal.tsx  # Ctrl+K global full-text search palette
│       │   │   ├── PracticeModal.tsx    # Extractive practice suite (Cloze & Scramble drills)
│       │   │   ├── Reader.tsx           # Virtualized TipTap chapter canvas with margin anchors
│       │   │   ├── SelectionMenu.tsx    # Floating UI selection toolbar (Highlight, Note, Link)
│       │   │   ├── SettingsPopover.tsx  # Reader preferences & Gatekeeper settings popover
│       │   │   ├── Sidebar.tsx          # Hierarchical TOC & linear chapter navigation drawer
│       │   │   └── TopNav.tsx           # Top navigation chrome, progress bar, view modes & themes
│       │   ├── lib/             # Core TypeScript utilities, transformers, and contracts
│       │   │   ├── api.ts               # Tauri IPC invoke wrappers with browser dev fallbacks
│       │   │   ├── bionic.ts            # Deterministic bionic fixation bolding transformer
│       │   │   ├── highlights.ts        # W3C Text Quote Selector parser & serializer
│       │   │   ├── markdown.ts          # Chapter Markdown preprocessor & anchor normalizer
│       │   │   └── types.ts             # Canonical TypeScript interfaces & data contracts
│       │   ├── App.tsx          # Application shell, global state coordinator & router
│       │   ├── index.css        # Editorial design tokens, typography, and margin glyphs
│       │   └── main.tsx         # React DOM mount entrypoint
│       └── src-tauri/           # Rust backend shell (Tauri v2 + SQLite)
│           ├── src/
│           │   ├── commands.rs          # Asynchronous Tauri IPC command handlers
│           │   ├── db.rs                # SQLite connection, FTS5 indexer, and card store
│           │   ├── fsrs.rs              # Local FSRS-4.5 spaced repetition scheduling engine
│           │   ├── lib.rs               # Application builder, plugin setup, and invoke router
│           │   ├── main.rs              # Tauri binary executable entrypoint
│           │   └── vault.rs             # File vault scanner, manifest deserializer & I/O
│           ├── Cargo.toml       # Rust dependency manifest (rusqlite, tokio, tauri v2)
│           └── tauri.conf.json  # Tauri v2 window, security, and bundle configuration
├── packages/
│   └── ingestion/               # Python CLI & deterministic parsing pipeline
│       ├── ingest/              # Ingestion library modules
│       │   ├── anchors.py               # Deterministic paragraph anchor (^p-xxx) injector
│       │   ├── assets.py                # EPUB embedded image & diagram extractor
│       │   ├── cli.py                   # Command-line entrypoint (`book-ingest`)
│       │   ├── endnotes.py              # Backmatter endnote relocation to inline footnotes
│       │   ├── epub_parser.py           # XHTML chapter extractor & typography normalizer
│       │   ├── models.py                # Pydantic schema validation for metadata and cards
│       │   ├── pipeline.py              # End-to-end ingestion pipeline coordinator
│       │   ├── salience.py              # Deterministic salience scorer & Cloze deck generator
│       │   └── sample_generator.py      # Starter sample generator for development
│       ├── tests/               # Pytest verification suite for anchors, TOC, and pipeline
│       └── pyproject.toml       # Python package configuration and CLI entrypoints
├── scripts/
│   └── create_desktop_shortcut.ps1 # One-click Windows desktop shortcut generator
├── vault/                       # SOLE PERMANENT RECORD: User Markdown vault (Versioned / Syncable)
│   ├── books/<book-id>/         # Chapter Markdown (`ch-XX.md`), `_meta.json`, and extracted assets
│   └── notes/<book-id>/         # Chapter notes, serialized highlights, and study decks
└── %APPDATA%\book-engine\       # EPHEMERAL CACHE: OS AppData (Never in vault; reconstructible)
    └── app_cache/index.db       # SQLite database (FTS5 search index + FSRS card review states)
```

---

## 2. Ingestion & Content Normalization

### Endnote Relocation Pass
EPUB backmatter citations (`notes.xhtml#n1`) are severed when splitting by chapter. The ingestion script resolves internal reference targets, extracts the citation text, inlines it as a standard Markdown footnote definition at the bottom of the corresponding chapter (`[^1]: Citation text`), and updates the in-text link to `[^1]`.

### Paragraph Anchor Tagging
Every top-level paragraph in chapter Markdown files receives a deterministic anchor:
`Market segmentation is the bedrock of targeted positioning. ^p-042`
Anchors follow the format `^p-[0-9]{3,}` and are preserved across re-indexes.

### Hierarchical Spine Contract (_meta.json)
The manifest models multi-level books (Parts -> Chapters -> Sections) with word counts, paths, and anchors.

---

## 3. Storage Separation & Synchronization

- **Vault (`vault/`):** Human-readable plain-text Markdown files and images. Can be edited externally (Obsidian, Neovim, VS Code).
- **Ephemeral Cache (`index.db`):** Stored strictly in the OS application data folder (`%APPDATA%\book-engine\`). Never checked into version control.

### Highlight Stability (W3C Text Quote Selector)
Highlights store `exact`, `prefix`, and `suffix` context fields alongside paragraph anchors to survive external edits.

---

## 4. Zero-Hallucination Practice Architecture: As-Built Implementation (Phase 4)

### Local FSRS-4.5 Scheduling Engine (`apps/desktop/src-tauri/src/fsrs.rs`)
Review intervals and memory retention calculations are computed locally via the Free Spaced Repetition Scheduler (FSRS-4.5) algorithm without network dependencies:
- **Card States:** `New (0)`, `Learning (1)`, `Review (2)`, `Relearning (3)`.
- **4-Tier Rating Scale:** `Again (1)`, `Hard (2)`, `Good (3)`, `Easy (4)`.
- **Math Standard:** Initial stability $S_0(G)$, difficulty $D_0(G)$, power-law retrievability $R(t, S) = (1 + 19/9 \cdot t/S)^{-0.5}$, and stability updates for successful recall ($S'$) or forgetting ($S'_{forget}$). Target retention is configured to $90\%$ ($r = 0.90$).

### Ephemeral SQLite Schema (`%APPDATA%\book-engine\app_cache\index.db`)
Card state, stability, difficulty, and scheduling timestamps are strictly decoupled from the Markdown vault:
```sql
CREATE TABLE IF NOT EXISTS fsrs_cards (
    card_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter_file TEXT NOT NULL,
    anchor TEXT,
    item_type TEXT NOT NULL, -- 'cloze' | 'scramble'
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    state INTEGER NOT NULL DEFAULT 0,
    stability REAL NOT NULL DEFAULT 0.0,
    difficulty REAL NOT NULL DEFAULT 0.0,
    due INTEGER NOT NULL DEFAULT 0,
    last_review INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_cards (due, book_id);
```

### Background Deck Synchronization & Verbatim Guardrail
When a book mounts, `sync_practice_deck` reads `vault/notes/<book-id>/practice-deck.md`:
- Parses Cloze items (`{{c1::target}}` and `==target==`) and scrambled clauses.
- **Programmatic Verbatim Validation:** Cross-checks that every `answer_key` exists as an exact character substring in the chapter text (`vault/books/<book-id>/<chapter_file>`). Non-verbatim or speculative cards are rejected.
- Uses `INSERT OR IGNORE` so user review history and FSRS metrics are never overwritten on re-syncs.

### Practice Suite & Gatekeeper UI Components
- **TopNav Practice Button:** Displays live due badge count. Opens distraction-free `PracticeModal.tsx`.
- **Deterministic Cloze Drill:** Real-time input validation, "Show Answer" reveal, 4-tier FSRS rating buttons with interval estimates, and `Jump to §p-xxx` anchor navigation.
- **Scrambled Argument Drill:** Clickable badge pills allowing users to reassemble sentence clauses with verbatim sequence checking.
- **Reader Settings & Chapter Gatekeeper:** `SettingsPopover.tsx` allows toggling Gatekeeper Mode and configuring Daily Review Target. When Gatekeeper is enabled, advancing chapters requires solving a 3-card recall challenge.

---

## 5. Desktop Reader Core: As-Built Implementation (Phase 2)

### Tauri v2 IPC Interface (`apps/desktop/src-tauri/`)
All disk I/O operations are offloaded from the Tauri main thread using `tokio::task::spawn_blocking` to preserve unblocked UI responsiveness:

| Command | Signature | Description |
| :--- | :--- | :--- |
| `get_library_books` | `() -> Result<Vec<BookMetadata>, AppError>` | Scans `vault/books/*/` for `_meta.json`, returning dynamic library manifest with `id`, `title`, `author`, `chapter_count`, and `total_words`. |
| `list_books` | `() -> Result<Vec<BookSummary>, String>` | Scans `vault/books/` and parses available `_meta.json` records. |
| `load_book_meta` | `(book_id: String) -> Result<String, String>` | Reads `vault/books/<book_id>/_meta.json` as JSON string. |
| `load_chapter` | `(book_id: String, chapter_file: String) -> Result<String, String>` | Reads chapter Markdown text (`ch-XX.md`) from the vault. |
| `load_notes` | `(book_id: String, notes_file: String) -> Result<String, String>` | Reads `vault/notes/<book_id>/<notes_file>` (auto-scaffolds starter template if missing). |
| `save_notes` | `(book_id: String, notes_file: String, content: String) -> Result<(), String>` | Persists user reflection notes to `vault/notes/<book_id>/<notes_file>`. |

### Frontend Component Hierarchy (`apps/desktop/src/`)
The desktop client is structured around a single-chapter virtualized TipTap canvas:

```
App.tsx (Global state: theme, viewMode, activeBook, activeChapter)
├── Sidebar.tsx (Translucent collapsible TOC, active chapter indicator, word & anchor counts)
├── TopNav.tsx (Progress bar, chapter title, theme toggles, viewing mode switches)
└── [ Main Content Area ]
    ├── Reader.tsx (TipTap editor: mounts ONLY one chapter at a time)
    │   ├── SelectionMenu.tsx (Floating UI pill: [Highlight], [Note], [Copy Link])
    │   └── FootnotePopover.tsx (Floating UI citation popover on [^n] click/hover)
    └── NotesPane.tsx (Dual-Pane side-by-side reflection notes editor with 800ms auto-save)
```

**Supporting Utilities:**
- `src/lib/api.ts`: Tauri IPC invoke wrappers with browser development fallback.
- `src/lib/markdown.ts`: Pre-processes chapter Markdown into TipTap HTML, separating footnote definitions and injecting interactive anchors (`data-anchor="^p-xxx"`) and footnote markers (`data-fn="n"`).
- `src/lib/bionic.ts`: Deterministic Bionic reading transformer bolding the initial 40–50% of word tokens for eye fixation.
- `src/lib/types.ts`: TypeScript contracts matching `BookMeta`, `ChapterMeta`, `TOCItem`, and theme definitions.

### Editorial Design System & Tokens
The reader pairs an editorial serif with a clean sans-serif UI, constrained to `max-w-prose` (65–75 CPL) with generous leading (`leading-relaxed` / 1.85 line-height):

* **Typography**:
  - Reader Body: `'Newsreader', 'Charter', Georgia, serif`
  - Interface Chrome: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
  - Code & Paragraph Anchors: `'JetBrains Mono', 'Fira Code', monospace`

* **Theme Palettes**:

| Token | Warm Paper (`theme-paper`) | Sepia (`theme-sepia`) | Nord Dark (`theme-nord`) |
| :--- | :--- | :--- | :--- |
| **Background** (`--theme-bg`) | `#FBFBFA` | `#F4ECD8` | `#2E3440` |
| **Surface** (`--theme-surface`) | `#F4F4F0` | `#EAE0C8` | `#3B4252` |
| **Border** (`--theme-border`) | `#E6E4DD` | `#D8CCB0` | `#4C566A` |
| **Text** (`--theme-text`) | `#2A2826` | `#3D3226` | `#ECEFF4` |
| **Muted** (`--theme-muted`) | `#736F6E` | `#857463` | `#949FB5` |
| **Accent** (`--theme-accent`) | `#9A3412` | `#A2522B` | `#88C0D0` |

---

## 6. Highlight Engine & SQLite FTS5 Ephemeral Search: As-Built Implementation (Phase 3)

### Ephemeral SQLite FTS5 Database (`index.db`)
Strictly isolated within OS Application Data (`%APPDATA%\book-engine\app_cache\index.db` on Windows, `~/.config/book-engine/app_cache/index.db` on Linux, `~/Library/Application Support/book-engine/app_cache/index.db` on macOS). The database is ephemeral and completely decoupled from `vault/`. If deleted, it is recreated and re-indexed automatically from vault Markdown files on next launch.

**SQLite Schema & FTS5 Configuration (`apps/desktop/src-tauri/src/db.rs`):**
```sql
-- Tracks file modifications for fast incremental indexing
CREATE TABLE IF NOT EXISTS indexed_chapters (
    book_id TEXT,
    chapter_file TEXT,
    mtime INTEGER,
    PRIMARY KEY(book_id, chapter_file)
);

-- Virtual full-text search table with Porter Stemmer and Unicode61 tokenization
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5 (
    book_id,
    chapter_file,
    anchor,
    text,
    tokenize='porter unicode61'
);
```

### Tauri v2 IPC Interface & Async Background Indexing
All SQLite queries, FTS5 matches, and disk indexing execute exclusively inside `tokio::task::spawn_blocking` worker threads. The Tauri main thread and UI event loop are never blocked:

| Command | Signature | Description |
| :--- | :--- | :--- |
| `index_vault` | `() -> Result<usize, String>` | Scans `vault/books/*/*.md`, detects modified chapters via `mtime`, splits text into paragraphs, and indexes into SQLite FTS5. Returns indexed paragraph count. Runs automatically on startup in a detached background thread. |
| `search_vault` | `(query: String) -> Result<Vec<SearchResult>, String>` | Queries `search_index` using BM25 ranking and SQLite `snippet()` syntax with `<mark>` tags. Returns up to 40 matches. |

**Search Result Contract (`SearchResult`):**
```rust
pub struct SearchResult {
    pub book_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub snippet: String,
}
```

### W3C Text Quote Selector Highlighting Engine (`apps/desktop/src/lib/highlights.ts`)
Text selections in the TipTap reader pane generate persistent highlight records adhering strictly to the W3C Text Quote Selector specification. Offsets and volatile DOM tree coordinates are strictly prohibited.

**W3C Highlight Data Contract (`HighlightItem`):**
```typescript
export interface HighlightItem {
  id: string;          // Deterministic unique identifier (hl-<timestamp>-<rand>)
  exact: string;       // Target verbatim quote
  prefix: string;      // Contextual prefix (up to 32 characters preceding)
  suffix: string;      // Contextual suffix (up to 32 characters following)
  anchor?: string;     // Nearest paragraph anchor (^p-xxx)
  color?: string;      // Color token (yellow, emerald, blue, purple)
  note?: string;       // Optional attached reflection note
  createdAt: string;   // ISO-8601 timestamp
}
```

**Persistence & Markdown Vault Roundtrip:**
Highlights are serialized into `vault/notes/<book-id>/<chapter-file>-notes.md` inside a dedicated `## Highlights` section containing both machine-readable JSON in an HTML comment and a human-readable list:
```markdown
## Highlights

<!-- highlights-json
[
  {
    "id": "hl-1789116786-a1b2c",
    "exact": "Market segmentation is the bedrock of targeted positioning.",
    "prefix": "Strategy formulation requires focus. ",
    "suffix": " Without segmentation, value propositions fail.",
    "anchor": "^p-042",
    "color": "yellow",
    "createdAt": "2026-09-11T08:53:00.000Z"
  }
]
-->

- > "Market segmentation is the bedrock of targeted positioning." (^p-042)
```

**Fuzzy Hydration & TreeWalker Injection Algorithm (`applyHighlightsToHtml`):**
When a chapter HTML payload is prepared for mounting into TipTap:
1. `parseHighlightsFromNotes`: Scans `<!-- highlights-json ... -->` in the chapter's notes file and parses the `HighlightItem[]` payload.
2. `Paragraph Resolution`: For each highlight, attempts to locate the parent paragraph by querying `[data-anchor="^p-xxx"]`. If anchor is absent or paragraph was reorganized, falls back to scanning candidate `<p>` elements.
3. `Fuzzy Recovery Pass`:
   - Checks verbatim match: `pText.includes(hl.exact)`.
   - If verbatim match fails (e.g. whitespace or punctuation slightly edited externally), executes relaxed normalization: `text.replace(/\s+/g, " ")`.
4. `Non-Destructive TreeWalker DOM Injection`:
   - Uses `document.createTreeWalker(el, NodeFilter.SHOW_TEXT)` to locate the precise text node containing `hl.exact` without traversing existing `<mark>` elements.
   - Slices the text node into `before`, `match`, and `after`.
   - Inserts `<mark class="w3c-highlight ..." data-hl-id="hl-xxx">` containing the match and replaces the target text node within a `DocumentFragment`, preserving adjacent inline nodes (such as footnote markers `[^n]`).

### Omni-Search Command Palette (`apps/desktop/src/components/OmniSearchModal.tsx`)
- **Keyboard-Driven Interaction:** Global listener toggles modal via `Ctrl + K` (Windows/Linux) or `Cmd + K` (macOS), with Arrow keys for selection, `Enter` to navigate, and `Escape` to dismiss.
- **Debounced Sub-Millisecond Search:** Queries are debounced by 150ms and dispatched asynchronously via `search_vault`.
- **Snippet `<mark>` Rendering:** SQLite FTS5 snippets with `<mark>` highlight tags are sanitized and rendered directly in the result item preview.
- **Cross-Chapter Anchor Navigation:** Selecting a search result switches the active chapter (maintaining single-chapter DOM virtualization), waits for DOM mounting, and smoothly scrolls directly to the target paragraph anchor (`^p-xxx`) with a brief visual flash highlight (`ring-2 ring-accent`).

### Verification & Performance Benchmark Standard
- **Anchor Integrity:** Verified via `python .agent/skills/audit-anchors.py`.
- **FTS Query Benchmark:** Verified via `python .agent/skills/benchmark-fts.py`.
  - Average Query Latency: **0.075 ms** (Strict requirement: < 15.0 ms).
  - p95 Latency: **0.105 ms**.
  - p99 Latency: **0.254 ms**.

---

## 7. Dynamic Vault Library & Anchor Rendering Standards (Phase 3 Extension / Polish)

### Dynamic Vault Scanner (`scan_library_books`)
The backend scans `vault/books/` dynamically on startup and command invocation, discovering all book directories containing valid `_meta.json` manifests.
- Safe deserialization using non-panicking constructs (strict zero `.unwrap()` standard).
- Returns typed `BookMetadata` (`id`, `title`, `author`, `chapter_count`, `total_words`).
- Reversible error representation via `AppError` enum using `thiserror`.

### Book Selector Dropdown & State Persistence
- Interactive `BookSelector.tsx` popover in the Sidebar header with library icon, book title, author, and animated chevron.
- Also available in compact mode in `TopNav.tsx` when the sidebar is collapsed.
- Persists active book ID in `localStorage` (`book_engine_active_book_id`).
- Switching books cleanly dismounts the current chapter, loads the new manifest, reloads the hierarchical Table of Contents, and mounts Chapter 1.

### Polished TipTap Paragraph Anchors
- Raw paragraph anchors (`^p-001`, `§p-001`) are stripped from inline text bodies during markdown ingestion into HTML.
- Parsed into headless custom node attributes (`<p data-anchor="p-001">`) via TipTap's `AnchorParagraph` extension.
- Displayed via CSS pseudo-element (`.reader-prose p[data-anchor]::before`) as a subtle, muted `§` glyph in the left margin (`left: -1.75rem`) that smoothly reveals on paragraph hover without polluting text selection or clipboard payloads.



