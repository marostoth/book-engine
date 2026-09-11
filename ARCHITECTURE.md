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

## 4. Zero-Hallucination Practice Architecture

1. **Salience Scorer:** Ranks sentences based on glossary matches, bold formatting, definitional syntax, and summary sections.
2. **Deterministic Cloze Engine:** Masks proper nouns, cataloged glossary terms, or bold phrases. Answers are exact string slices.
3. **Scrambled Argument Reordering:** Randomizes sequential clauses or list items for manual reassembly.
4. **FSRS Scheduling:** Review intervals calculated locally via the Free Spaced Repetition Scheduler algorithm in SQLite.

---

## 5. Desktop Reader Core: As-Built Implementation (Phase 2)

### Tauri v2 IPC Interface (`apps/desktop/src-tauri/`)
All disk I/O operations are offloaded from the Tauri main thread using `tokio::task::spawn_blocking` to preserve unblocked UI responsiveness:

| Command | Signature | Description |
| :--- | :--- | :--- |
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


