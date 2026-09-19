# System Architecture

This document says what the program **is**. It does not say how it got that way: the rule a fix taught lives
in [AGENTS.md](./AGENTS.md), and the whole story lives in `docs/review/2026-09-14-findings.md`.

Three rules shape everything below.

1. **The vault is the only permanent record.** `index.db` is a copy. Delete it and the app builds it again.
2. **Nothing is shown that the book does not say.** Every practice card, citation and quote is text of the
   book, checked character by character.
3. **What this document names, a test checks.** `packages/ingestion/tests/test_the_docs_match_the_code.py`
   fails when a path named here does not exist, when the command table and the backend disagree, or when the
   manifest stops naming every source file. `tests/test_what_the_docs_promise.py` fails when a document names
   a crate or an npm package the build does not have.

---

## 1. Topology

```
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
    ├── ch-01-notes.md        <-- User notes & reflections (the notes pane is its only writer)
    ├── ch-01-highlights.json <-- Saved highlights (the reader is its only writer)
    ├── practice-deck.md      <-- Pre-generated study items
    ├── inspectional.json     <-- Your exit assessment (an import never writes it)
    └── bookmark.json         <-- Where you stopped reading: chapter & paragraph
  preferences.json            <-- Reader settings: theme, pacer speed, Gatekeeper, daily target
          │
          ▲ (Async Read-Write; the index is built at startup and on "Rescan library")
          ▼
TAURI V2 DESKTOP APPLICATION
  OS AppData Cache (Ephemeral):
    └── index.db (SQLite + FTS5)  <-- Search: a word under 15ms, a 2-letter prefix under 120ms, & FSRS
  Core Shell (Rust + TipTap UI):
    ├── Single-Chapter Virtualized DOM View
    ├── W3C Text Quote Highlight Engine
    ├── Popover Footnote Resolver
    └── Extractive Practice & Gatekeeper Suite
```

---

## 2. As-Built Directory Manifest

A comment here says what a file is **for**, in one line. A test fails when a path below does not exist, when a
tracked source file is missing from the tree, or when a comment grows past 120 characters. Test files are left
out of the tree on purpose; a test sits beside the file it tests.

```
book-engine/
├── .claude/                                  # What Claude Code loads by itself
│   └── skills/                               # The rules for one area, loaded when you touch that area
│       ├── backend-rules/SKILL.md            # 6 Rust rules, for `apps/desktop/src-tauri/`
│       ├── frontend-rules/SKILL.md           # 12 React rules, for `apps/desktop/src/`
│       ├── health-audit/SKILL.md             # The 12-vector audit procedure; type `/health-audit`
│       ├── import-books/SKILL.md             # The inbox procedure; type `/import-books`
│       └── ingestion-rules/SKILL.md          # 18 import rules, for `packages/ingestion/`
├── .agent/
│   └── skills/                               # Autonomous verification harnesses
│       ├── audit-anchors.py                  # Verifies paragraph anchor & footnote definition integrity
│       ├── audit-practice.py                 # Audits zero-hallucination verbatim extractive study cards
│       ├── audit-system.py                   # Health orchestrator; runs the 12 verification vectors
│       ├── benchmark-fts.py                  # Benchmarks FTS5 query latency on a copy of the index, never the live one
│       ├── process-inbox.py                  # Automated fail-safe batch book intake pipeline & ledger manager
│       └── test-index-rebuild.py             # Verifies self-healing FTS5 index reconstruction from vault
├── AGENTS.md                                 # Canonical agent directives, operational guardrails & technology standards
├── CLAUDE.md                                 # Claude agent pointer referencing canonical AGENTS.md
├── GEMINI.md                                 # Gemini agent pointer referencing canonical AGENTS.md
├── apps/
│   └── desktop/                              # Tauri v2 native desktop application & React frontend
│       ├── src-tauri/                        # Rust backend shell (Tauri v2 + SQLite)
│       │   ├── icons/                        # High-resolution native application branding icons
│       │   │   ├── source-icon.svg           # Master vector editorial monogram
│       │   │   ├── icon.ico                  # Windows multi-resolution taskbar & titlebar icon
│       │   │   ├── 32x32.png                 # Compact native icon
│       │   │   ├── 128x128.png               # Medium application icon
│       │   │   ├── 128x128@2x.png            # Retina high-DPI icon
│       │   │   └── icon.png                  # 512x512 master application branding asset
│       │   ├── src/
│       │   │   ├── commands.rs               # Asynchronous Tauri IPC command handlers
│       │   │   ├── db/                       # Modular SQLite storage, FTS5 indexer & analytics
│       │   │   │   ├── analytics.rs          # Retention metrics, study analytics & review heatmap
│       │   │   │   ├── backfill.rs           # One-time copy of an older cache into the vault study log
│       │   │   │   ├── card_identity.rs      # Stable practice card ids from the question text (FNV-1a), not the deck position
│       │   │   │   ├── chapter_blocks.rs     # Which blocks of a chapter file hold text of the book
│       │   │   │   ├── deck_sync.rs          # Practice deck sync
│       │   │   │   ├── due_cards.rs          # Practice session card picker
│       │   │   │   ├── fsrs_parser.rs        # Practice card markdown extraction & verbatim validator (a card whose chapter cannot be read is left out)
│       │   │   │   ├── fsrs_store.rs         # FSRS deck statistics & review submission (card update and review log row in one transaction)
│       │   │   │   ├── indexer.rs            # Vault indexing, one transaction per book, and FTS5 full-text search
│       │   │   │   ├── models.rs             # SQLite row models and analytics transfer structs
│       │   │   │   ├── reading_velocity.rs   # Chapter reading time & completed chapters, with no word count or speed
│       │   │   │   ├── removed_books.rs      # A book that left the vault
│       │   │   │   ├── restore.rs            # Puts the study progress back into the cache from the vault study log
│       │   │   │   ├── schema.rs             # SQLite database initialization & migrations
│       │   │   │   ├── search_query.rs       # Typed search to FTS5 expression
│       │   │   │   ├── search_text.rs        # The plain text search keeps of a paragraph, and the marks around a hit
│       │   │   │   ├── seed_lexicon.rs       # Curated seed dictionary entries & initial SQLite database seeding
│       │   │   │   └── mod.rs                # Ephemeral SQLite database module root & test suite
│       │   │   ├── fsrs/                     # FSRS engine test module
│       │   │   ├── fsrs.rs                   # Local FSRS-5 spaced repetition scheduling engine
│       │   │   ├── lib.rs                    # Application builder, plugin setup, and invoke router
│       │   │   ├── main.rs                   # Tauri binary executable entrypoint
│       │   │   ├── test_support.rs           # Test-only sandbox
│       │   │   └── vault/                    # Modular vault file I/O & notes aggregation
│       │   │       ├── analytical.rs         # Level 3 analytical store loader, saver & unit tests
│       │   │       ├── book_pictures.rs      # The picture folder of each book (`books/<book>/assets`), the only files the window may load through the asset protocol
│       │   │       ├── bookmark.rs           # Where you stopped reading
│       │   │       ├── highlights.rs         # Chapter highlights file
│       │   │       ├── inspectional.rs       # Your exit assessment in `vault/notes/<book-id>/inspectional.json`, never in the `_meta.json` an import writes again
│       │   │       ├── json_store.rs         # Safe JSON read for vault files
│       │   │       ├── locate.rs             # Finds the vault folder, and remembers the one the reader picked
│       │   │       ├── models.rs             # Vault metadata, analytical and note structures
│       │   │       ├── notes.rs              # Chapter reflection notes loader, saver & summary export
│       │   │       ├── paths.rs              # The only way from a name the page sends to a vault path
│       │   │       ├── preferences.rs        # Reader settings in `vault/preferences.json`, kept key for key
│       │   │       ├── reader.rs             # Book discovery & chapter I/O
│       │   │       ├── safe_write.rs         # The one vault write
│       │   │       ├── study_log.rs          # The permanent record of your study
│       │   │       ├── syntopicon.rs         # Level 4 Syntopicon topic file I/O & report exporter
│       │   │       ├── syntopicon_check.rs   # Level 4 Where a topic citation points, and whether its quote is still in the book
│       │   │       ├── syntopicon_compiler.rs # Level 4 Dialectical dossier compiler producing Markdown reports
│       │   │       ├── syntopicon_models.rs  # Level 4 Syntopicon neutral terms & controversy structs
│       │   │       ├── text_file.rs          # Chapters & notes are read with `\n` line endings only
│       │   │       ├── vocabulary.rs         # Vault vocabulary persistence with case-insensitive deduplication
│       │   │       └── mod.rs                # Vault module facade
│       │   ├── build.rs                      # Tauri build script
│       │   ├── Cargo.toml                    # Rust dependency manifest (rusqlite, tokio, tauri v2)
│       │   └── tauri.conf.json               # Tauri v2 window, security, and bundle configuration
│       ├── src/                              # React 18+ client application
│       │   ├── components/                   # UI components (Reader, Sidebar, TopNav, Modals, Popovers)
│       │   │   ├── analytical/               # Level 3 Analytical reading & interpretive workbench (Rules 4–12)
│       │   │   │   ├── AnalyticalWorkbenchPane.tsx # Mortimer Adler companion pane (Terms, Args, Inquiries, Critique)
│       │   │   │   ├── ArgumentBuilderModal.tsx # Premise-to-conclusion argument graph assembler (Rules 6–7)
│       │   │   │   ├── ArgumentGutterBadge.tsx # Right-gutter cited paragraph markers (T, C, P, ?)
│       │   │   │   ├── ArgumentsTab.tsx      # Rules 6 & 7 argument graph listing & premise viewer tab
│       │   │   │   ├── CritiqueModal.tsx     # Stage III critical evaluation modal (Rules 9–12)
│       │   │   │   ├── CritiqueTab.tsx       # Evaluative critique review & defect breakdown tab
│       │   │   │   ├── InquiriesTab.tsx      # Rules 4 & 8 author inquiry ledger & solution audit tab
│       │   │   │   ├── InquiryModal.tsx      # Rules 4 & 8 author inquiry cataloging & solution modal
│       │   │   │   ├── TermsTab.tsx          # Rule 5 specialized author terminology listing tab
│       │   │   │   └── TermModal.tsx         # Rule 5 author terminology definition modal
│       │   │   ├── analytics/                # Modular analytics subcomponents
│       │   │   │   ├── HeatmapGrid.tsx       # GitHub-style annual FSRS study activity heatmap
│       │   │   │   └── VelocityTable.tsx     # Chapter reading time & completion table
│       │   │   ├── elementary/               # Modular Level 1 Elementary Reading components & mechanics
│       │   │   │   ├── ElementaryCanvas.tsx  # Reading canvas wrapper with dynamic typographical measure
│       │   │   │   ├── ElementaryPacingControls.tsx # TopNav pacer Play/Pause toggle, WPM stepper & focus ruler controls
│       │   │   │   ├── FocusRuler.tsx        # Active reading block tracker & sibling paragraph dimmer
│       │   │   │   ├── LexiconPopover.tsx    # Floating offline lexicon definition & vocabulary saver popover
│       │   │   │   ├── PacingOverlay.tsx     # Visual laser/underline beam pacer sweep indicator
│       │   │   │   ├── useElementaryMechanics.ts # Pacer state, RAF loop, duration calculation, scroll guard & pacer speed keys ([ and ])
│       │   │   │   ├── useLinePacer.ts       # Discrete line clock, saccadic pause & RAF line glide hook
│       │   │   │   └── usePacerDrag.ts       # Tactile pointer drag scrubbing, seek resolver & keyboard stepping hook
│       │   │   ├── inspectional/             # Modular Level 2 Inspectional Reading components
│       │   │   │   ├── BlueprintView.tsx     # Structural Book Blueprint (dossier, analytical TOC, clusters)
│       │   │   │   ├── DipStream.tsx         # Virtualized feed of chapter dip sampling cards
│       │   │   │   ├── InspectionalExitModal.tsx # Four-question Adlerian exit assessment modal
│       │   │   │   └── SkimTimerWidget.tsx   # Ambient skimming countdown timer & exit trigger
│       │   │   ├── navigation/               # Modular navigation rails
│       │   │   │   └── LevelRail.tsx         # Fixed 36px vertical rail for Adler reading level modes (I–IV)
│       │   │   ├── notes/                    # Modular notes slide-over subcomponents
│       │   │   │   ├── DrawerFilterBar.tsx   # Chapter, color & search filter controls
│       │   │   │   └── NoteEntryCard.tsx     # Highlight / reflection quote card
│       │   │   ├── practice/                 # Modular practice drill subcomponents
│       │   │   │   ├── ClozeDrill.tsx        # Extractive Cloze completion drill
│       │   │   │   ├── GatekeeperCardDrill.tsx # Dual-modality Cloze & Scenario MCQ challenge drill for Chapter Gatekeeper
│       │   │   │   ├── RatingBar.tsx         # FSRS-5 Again/Hard/Good/Easy rating bar with suggested rating badge
│       │   │   │   ├── ScenarioCardView.tsx  # Quiz card drill
│       │   │   │   └── ScrambleDrill.tsx     # Drag/click scrambled clause reconstruction drill
│       │   │   ├── reader/                   # Modular TipTap custom extensions & reader hooks
│       │   │   │   ├── ReaderHighlights.ts   # Draws the saved highlights over the chapter text, so they show over marks, blocks & Bionic reading
│       │   │   │   ├── TableExtensions.ts    # Table, row, header cell & cell nodes
│       │   │   │   ├── TipTapExtensions.ts   # BlockAnchors on every anchored block, the superscript mark & the FootnoteRef node
│       │   │   │   ├── readerEditorOptions.ts # The options the reader gives TipTap, built once so a render sets none again
│       │   │   │   ├── readerExtensions.ts   # The reader's nodes & marks
│       │   │   │   └── useReaderSelection.ts # Text selection, highlights from the words of the chapter document, anchor detection & lexicon de-confliction
│       │   │   ├── settings/                 # Modular reader settings tabs
│       │   │   │   ├── ElementaryTab.tsx     # Level 1 Elementary Reading shell & settings tab
│       │   │   │   ├── FocusRulerControls.tsx # Focus ruler contrast presets, fine stepper & spotlight toggle
│       │   │   │   ├── GeneralTab.tsx        # Reading palette, font family, font size & line height
│       │   │   │   ├── InspectionalTab.tsx   # Skim timer, exit card, sampling depth & single-key paging
│       │   │   │   ├── PacerControls.tsx     # Pacer velocity, line sweep vs chunk underline, focus lock & direct launch button
│       │   │   │   └── PracticeTab.tsx       # Chapter Gatekeeper, recall quota, daily target & deck sync
│       │   │   ├── sidebar/                  # Modular sidebar subcomponents
│       │   │   │   └── TOCItemRow.tsx        # Hierarchical TOC tree item row
│       │   │   ├── syntopicon/               # Modular Level 4 Syntopical Reading & Syntopicon components
│       │   │   │   ├── ControversyModal.tsx  # Rule 4 multi-author controversy and issue definition modal
│       │   │   │   ├── IssueMatrixTab.tsx    # Rules 3 & 4 framed question feed & controversy matrix tab
│       │   │   │   ├── NeutralTermModal.tsx  # Rule 2 neutral semantic bridge & author term mapping modal
│       │   │   │   ├── SynthesisTab.tsx      # Rule 5 dialectical synthesis editor & Markdown dossier compiler tab
│       │   │   │   ├── SyntopiconPane.tsx    # Level IV Syntopicon registry, topic manager & tab shell
│       │   │   │   └── SyntopicTermsTab.tsx  # Rule 2 neutral terminology directory & citation mapper tab
│       │   │   ├── AnalyticsModal.tsx        # FSRS retention heatmap & reading time dashboard modal
│       │   │   ├── AppModals.tsx             # Modular modal dialog coordinator & container
│       │   │   ├── BackendErrorBar.tsx       # Error bar
│       │   │   ├── BookSelector.tsx          # Dynamic vault library switcher popover
│       │   │   ├── DiscardNotice.tsx         # The line a dialog shows after the first Escape when the reader has typed
│       │   │   ├── FigureLightboxModal.tsx   # High-resolution diagram pan/zoom lightbox with split page link
│       │   │   ├── FootnotePopover.tsx       # Floating UI citation preview popover
│       │   │   ├── GatekeeperModal.tsx       # Chapter Gatekeeper dynamic-quota recall challenge modal
│       │   │   ├── LevelCompanionPane.tsx    # Modular Level III & IV companion pane coordinator
│       │   │   ├── LevelGuideModal.tsx       # Contextual HUD, level cheatsheets & keyboard shortcuts modal
│       │   │   ├── NotesDrawer.tsx           # Unified slide-over notes & W3C highlights drawer with summary export
│       │   │   ├── NotesPane.tsx             # Dual-pane Markdown reflection notes editor (locked until the notes file loads; one pane per chapter)
│       │   │   ├── OmniSearchModal.tsx       # Ctrl+K global full-text search palette
│       │   │   ├── PracticeModal.tsx         # Extractive practice suite (Cloze, Scenario MCQ & Scramble drills)
│       │   │   ├── PreferencesGate.tsx       # Holds the app back until the reader settings are read from vault/preferences.json
│       │   │   ├── Reader.tsx                # Virtualized TipTap chapter canvas with margin anchors
│       │   │   ├── SelectionMenu.tsx         # Floating UI selection toolbar (Highlight, Note, Link)
│       │   │   ├── SettingsPopover.tsx       # Reader preferences & Gatekeeper settings popover
│       │   │   ├── Sidebar.tsx               # Hierarchical TOC & linear chapter navigation drawer
│       │   │   ├── TopNav.tsx                # Top navigation chrome, progress bar, view modes & themes
│       │   │   └── VaultGate.tsx             # Asks the reader to pick a vault folder when none was found
│       │   ├── hooks/                        # Modular application custom hooks
│       │   │   ├── useAnalyticalModals.ts    # Level 3 modal open/close & staged target coordinator
│       │   │   ├── useAnalyticalSession.ts   # Analytical reading store, cascading integrity & persistence hook
│       │   │   ├── useBookSession.ts         # Book loading, reading progress, session timing & chapter jumping
│       │   │   ├── useChapterGate.ts         # Chapter Gatekeeper (soft gate)
│       │   │   ├── useDialog.ts              # One keyboard rule for every dialog: Escape, focus trap, focus back, a name
│       │   │   ├── useInspectionalSession.ts # Inspectional countdown timer, sub-view, exit prompt & the exit assessment of the open book
│       │   │   ├── useLibrary.ts             # React context for the book list and the rescan control
│       │   │   ├── usePracticeDeck.ts        # Practice deck state, mode/ratio filtering & daily target limits
│       │   │   ├── useSettings.ts            # React context for the reader settings
│       │   │   └── useSyntopiconSession.ts   # Level 4 Syntopicon registry, cascade-pruning & topic session hook
│       │   ├── lib/                          # Core TypeScript utilities, transformers, and contracts
│       │   │   ├── api/                      # Modular Tauri IPC client modules (every call goes through callBackend)
│       │   │   │   ├── dev/                  # Browser stand-in for the backend
│       │   │   │   │   ├── devBackend.ts     # Single entry point
│       │   │   │   │   ├── fallbackAnalytical.ts # Sample analytical store & localStorage analytical data
│       │   │   │   │   ├── fallbackAnalytics.ts # In-memory analytics mock generators
│       │   │   │   │   ├── fallbackBooks.ts  # Sample library & chapters, localStorage notes, plain text search
│       │   │   │   │   ├── fallbackHighlights.ts # Sample chapter highlights in browser storage
│       │   │   │   │   ├── fallbackLexicon.ts # In-memory dictionary and deduplicated vocabulary storage
│       │   │   │   │   ├── fallbackNotes.ts  # Sample chapter notes, in-browser notes aggregation & summary export
│       │   │   │   │   ├── fallbackPractice.ts # Sample practice cards, due-card filter & simple review schedule
│       │   │   │   │   ├── fallbackReaderState.ts # Reader settings, bookmarks & exit assessments in browser storage
│       │   │   │   │   ├── fallbackSyntopicon.ts # Sample syntopicon topic & localStorage topic registry
│       │   │   │   │   ├── fallbackVault.ts  # Browser stand-in for `get_vault_status`
│       │   │   │   │   └── mockData.ts       # Default mock book catalogs & sample chapters
│       │   │   │   ├── analyticalApi.ts      # Analytical reading store load/save IPC
│       │   │   │   ├── analyticsApi.ts       # Study analytics & reading time IPC client
│       │   │   │   ├── bookmarkApi.ts        # Where you stopped reading IPC
│       │   │   │   ├── clientBase.ts         # Tauri detection & callBackend
│       │   │   │   ├── highlightsApi.ts      # Chapter highlights IPC
│       │   │   │   ├── lexiconApi.ts         # Sanitized offline dictionary lookup & vocabulary vault persistence IPC
│       │   │   │   ├── notesApi.ts           # Cross-chapter note aggregation & summary export IPC
│       │   │   │   ├── practiceApi.ts        # FSRS practice card synchronization & review IPC
│       │   │   │   ├── preferencesApi.ts     # Reader settings IPC
│       │   │   │   ├── syntopiconApi.ts      # Level 4 Syntopicon topic registry & persistence IPC client
│       │   │   │   └── vaultApi.ts           # Wrappers for the vault commands, and the `VaultStatus` shape
│       │   │   ├── types/                    # Modular contract definitions
│       │   │   │   ├── analytical.ts         # Level 3 analytical terms, citations & argument graph interfaces
│       │   │   │   └── syntopicon.ts         # Level 4 syntopical neutral terms, questions & controversy models
│       │   │   ├── analyticsText.ts          # Analytics numbers as text
│       │   │   ├── anchors.ts                # Paragraph anchor forms
│       │   │   ├── api.ts                    # Unified API client facade
│       │   │   ├── backendErrors.ts          # Error bar store
│       │   │   ├── backendShapes.ts          # Checks what comes in from outside the window before the app believes it
│       │   │   ├── bionic.ts                 # Bionic reading on a chapter document
│       │   │   ├── chapterGate.ts            # Pure Chapter Gatekeeper rules
│       │   │   ├── citations.ts              # Where a passage is
│       │   │   ├── elementaryPacer.ts        # Pure pacer timing, chunking, and contrast opacity functions
│       │   │   ├── exitAssessment.ts         # The exit assessment of the open book
│       │   │   ├── highlights.ts             # W3C Text Quote Selector
│       │   │   ├── levelGuideData.ts         # Mortimer Adler levels static cheatsheet & hotkeys registry
│       │   │   ├── libraryRescan.ts          # "Rescan library"
│       │   │   ├── markdown.ts               # Chapter Markdown as a document of reader nodes
│       │   │   ├── markdownInline.ts         # Inline tokens as reader nodes
│       │   │   ├── markdownNodes.ts          # The markdown-it parser & the block tokens of one block as reader nodes
│       │   │   ├── markdownTables.ts         # No lost table words
│       │   │   ├── noteLine.ts               # One line of a chapter's notes as the notes drawer shows it
│       │   │   ├── notesAggregator.ts        # Cross-chapter note aggregation, anchor sorting & summary compiler
│       │   │   ├── notesAutosave.ts          # Chapter notes autosave
│       │   │   ├── notesQuote.ts             # A quote sent to the chapter notes
│       │   │   ├── practiceContract.json     # Exact get_due_cards scenario-card JSON shared by the Rust & TS contract tests
│       │   │   ├── practiceSession.ts        # Pure practice/gatekeeper session
│       │   │   ├── practiceTypes.ts          # FSRS practice models (ScenarioOption, ScenarioPayload, PracticeCardItem)
│       │   │   ├── preferences.ts            # Reader settings
│       │   │   ├── readerLoads.ts            # Book & chapter loading
│       │   │   ├── readerLocation.ts         # Book + chapter file + anchor locations
│       │   │   ├── readerProgress.ts         # How far down a chapter the reader is
│       │   │   ├── readerShortcuts.ts        # Keyboard shortcut owners
│       │   │   ├── readerText.ts             # The text of a chapter document as the reader shows it, with the document position of each character
│       │   │   ├── readingPlace.ts           # Where you stopped
│       │   │   ├── readingTime.ts            # Reading time
│       │   │   ├── reviewDays.ts             # Review days
│       │   │   ├── searchIndex.ts            # Search update when the app opens and on Rescan
│       │   │   ├── searchQuery.ts            # Search box minimum length (2 characters), the same as the backend
│       │   │   ├── searchSnippet.ts          # Search result snippets as React text with a <mark> around each hit, so book text never becomes HTML
│       │   │   ├── tableOfContents.ts        # Contents entries
│       │   │   └── types.ts                  # Canonical TypeScript interfaces & data contracts
│       │   ├── App.tsx                       # Application shell, global state coordinator & router
│       │   ├── index.css                     # Editorial design tokens, typography, and margin glyphs
│       │   ├── main.tsx                      # React DOM mount entrypoint
│       │   └── vite-env.d.ts                 # Vite client types (import.meta.env)
│       └── vite.config.ts                    # Vite build and vitest settings; finds every `src/**/*.test.{ts,tsx}` by pattern
├── docs/
│   └── review/                               # Code review registers
│       └── 2026-09-14-findings.md            # 76 verified findings from the review of commit 050fe3f, with fix checkboxes
├── inbox/                                    # Ingestion quarantine & staging directory
│   ├── .gitkeep                              # Tracked directory marker
│   └── processed/                            # Quarantined & processed binary source documents (.epub, .pdf)
├── packages/
│   └── ingestion/                            # Python CLI & deterministic parsing pipeline
│       ├── ingest/                           # Ingestion library modules
│       │   ├── __init__.py                   # Marks `ingest` a package and exports `ingest_book`
│       │   ├── anchors.py                    # Deterministic paragraph anchor (^p-xxx) injector
│       │   ├── assets.py                     # Asset extraction, micro-asset filtering & page-level image suppression
│       │   ├── batch.py                      # Batch document intake utility (.epub & .pdf)
│       │   ├── book_build.py                 # Builds a book in `vault/.import/<book-id>/`, then puts it in the vault all at once
│       │   ├── book_check.py                 # The check of a book before it goes into the vault
│       │   ├── book_id.py                    # The rule for a book id, which names the folders of a book
│       │   ├── book_source.py                # The file each book came from (`source` in `_meta.json`)
│       │   ├── chapter_shape.py              # A page of a book that holds nothing but a title is no chapter
│       │   ├── citations.py                  # Checks a topic citation still points at its passage and a report link still opens one
│       │   ├── cli.py                        # Command-line entrypoint (`book-ingest`)
│       │   ├── cloze.py                      # Cloze (fill-in) cards
│       │   ├── console.py                    # What a command prints
│       │   ├── elementary.py                 # Deterministic Flesch-Kincaid & reading time metrics
│       │   ├── endnotes.py                   # Backmatter endnote relocation to inline footnotes
│       │   ├── epub_parser.py                # XHTML chapter extractor & typography normalizer
│       │   ├── glyph_repair.py               # Remaps a font that names its maths characters wrongly, before any text is read
│       │   ├── layout_stitcher.py            # Narrative sentence healing, layout reconciliation & callout hoisting
│       │   ├── ledger.py                     # The intake ledger `vault/_ledger.json`
│       │   ├── line_endings.py               # One line ending
│       │   ├── markdown_text.py              # Book text in chapter Markdown
│       │   ├── models.py                     # Pydantic schema validation for metadata and cards
│       │   ├── note_documents.py             # Which documents of an EPUB hold nothing but notes, and so make no chapter
│       │   ├── pdf_outline.py                # The parts of a PDF book from its outline
│       │   ├── pdf_parser.py                 # Sequential part-by-part PDF parser & asset coordinator
│       │   ├── pdf_sanitizer.py              # PDF slug normalization, drop-cap healing, heading & author sanitization
│       │   ├── pipeline.py                   # End-to-end ingestion pipeline coordinator
│       │   ├── places.py                     # A new import finds each old chapter and paragraph in the new text, and moves what the reader's files point to
│       │   ├── reimport.py                   # Stops an import of a book the vault already has before it writes anything, and names the reader's own files
│       │   ├── salience.py                   # Deterministic salience scorer & practice deck writer
│       │   ├── sample_generator.py           # Starter sample generator for development
│       │   ├── scenarios.py                  # Quiz cards that ask which sentence comes right after a passage
│       │   ├── text_repair.py                # A page's own layout marks come off the text, and a word a hyphen cut in two is made whole
│       │   ├── toc_links.py                  # Links the EPUB contents to the import
│       │   ├── vault_changes.py              # Puts a new book folder and changed vault files in place all together, or puts each change back
│       │   └── vector_figures.py             # Vector diagram rasterization, boundary stops & full-width section bounds
│       ├── tests/                            # Pytest verification suite for anchors, schemas, TOC, and pipeline
│       ├── pyproject.toml                    # Python package configuration and CLI entrypoints
│       └── requirements.lock                 # The exact version of every package that the import needs, and of every package that the tests and the checks need
├── scripts/
│   ├── create_desktop_shortcut.ps1           # One-click Windows desktop shortcut generator
│   └── free-dev-port.mjs                     # Frees the Vite dev port, but only this project's own leftovers
├── vault/                                    # SOLE PERMANENT RECORD
│   ├── .import/                              # Where an import builds a book before it goes into `books/`
│   ├── books/<book-id>/                      # Chapter Markdown (`ch-XX.md`), `_meta.json`, and extracted assets
│   ├── notes/<book-id>/                      # Chapter notes, highlights, decks, the study log, the exit assessment and the bookmark
│   ├── preferences.json                      # Reader settings
│   └── syntopicon/                           # Level 4 Syntopicon topic registries & compiled reports
│       ├── topics/                           # Cross-book syntopical topics (`<topic-id>.json`)
│       └── reports/                          # Compiled dialectical dossiers (`<topic-id>-synthesis.md`)
└── %APPDATA%\book-engine\                    # EPHEMERAL CACHE
    └── app_cache/index.db                    # SQLite database (FTS5 search index + a copy of the study progress)
```

---

## 3. Storage: the vault is the record, the cache is a copy

- **Vault (`vault/`):** plain-text Markdown and images. It can be edited from outside the app (Obsidian,
  Neovim, VS Code).
- **Ephemeral cache (`index.db`):** in the OS application data folder, never in version control. Everything in
  it is built again from the vault.
- **Where the vault is:** looked for in this order (`src-tauri/src/vault/locate.rs`): the folder the reader
  picked, saved in `%APPDATA%\book-engine\settings.json`; the `BOOK_ENGINE_VAULT` variable; then a `vault/`
  folder walking up from the program. When none is found, `VaultGate.tsx` asks the reader to pick one.
- **Your study is in the vault:** every card review and every piece of reading time is one line in
  `vault/notes/<book-id>/reviews.jsonl` and `reading.jsonl` (`src-tauri/src/vault/study_log.rs`).
- **Your place and your settings are in the vault:** `vault/notes/<book-id>/bookmark.json` holds the chapter
  and the paragraph in the middle of the screen; `vault/preferences.json` holds the reader settings.
- **Your answers are not in the files an import makes:** the exit assessment of a book lives in
  `vault/notes/<book-id>/inspectional.json`, which an import never writes.
- **One book per book id:** a book id comes from the file name and holds 1 to 255 characters from `a-z`,
  `0-9`, `-` and `_`. A name in another writing system is transliterated, so two books never collide.
- **One line ending:** every file an import writes has `\n` line endings, on every system
  (`ingest/line_endings.py`).
- **Cache shape:** `PRAGMA user_version` holds the shape of `index.db` and `CACHE_SCHEMA_VERSION`
  (`db/schema.rs`) is the shape this build knows. A file stamped higher was made by a newer build and is not
  opened.
- **Newest load wins:** the reader takes a ticket for every load (`createLoadGuard`, `src/lib/readerLoads.ts`)
  and an answer that is no longer the newest is thrown away.
- **One pane per chapter:** `App.tsx` gives the notes pane a key of book and chapter, so the notes of one
  chapter can never be saved into another.
- **A quote is saved at once:** "Add note" on a selection puts the quote at the end of the chapter notes and
  saves straight away (`addQuoteToNotes`, `src/lib/notesQuote.ts`).
- **One writer per file:** `ch-XX-notes.md` holds only what the reader writes, and the notes pane is its only
  writer. Nothing parses a highlight out of Markdown.
- **Safe vault write:** every write goes through `write_file` (`src-tauri/src/vault/safe_write.rs`): the bytes
  go to a temporary file in the same folder, are flushed to disk, then replace the file.
- **Names from the page stay in the vault:** a book id, chapter file, notes file or topic id that the window
  sends is checked by `src-tauri/src/vault/paths.rs` before it is part of a path. A book id or topic id is
  `a-z`, `0-9`, `-`, `_`, 1 to 255 characters, not starting with `-`. A chapter file is `ch-`, two or more
  digits, `.md`. A notes file is `ch-`, two or more digits, `-notes.md`. A path must still be inside the vault
  after every link on the way to it is followed.
- **Damaged vault file:** a JSON file that cannot be parsed is never read as empty data, because the next save
  would write that emptiness back (`read_json_file`, `src-tauri/src/vault/json_store.rs`).
- **One copy of the app:** only one copy runs (`one_copy_only`, `src-tauri/src/lib.rs`, the single-instance
  plugin registered before every other plugin). A second start brings the open window to the front.
- **No hidden fallback:** inside the app every frontend call goes through `callBackend`
  (`src/lib/api/clientBase.ts`). A failed load or save rejects with the backend error and shows in the error
  bar. Only a dev build in a browser answers from the stand-ins in `src/lib/api/dev/`.
- **Nothing watches the vault:** there is no file system watcher, and the `notify` crate is in neither
  `Cargo.toml` nor `Cargo.lock`. `index_vault` runs when the window opens and when the reader clicks **Rescan
  library** at the bottom of the book list (`lib/libraryRescan.ts`). A book imported while the app is open
  shows after one click.

### Highlight stability

A highlight stores `exact`, `prefix` and `suffix` context beside its paragraph anchor (W3C Text Quote
Selector), so it survives an edit made outside the app.

---

## 4. Vault file formats

### `_meta.json` — the spine of a book

A hierarchical table of contents (Parts -> Chapters -> Sections) with word counts, file paths and anchors.
The importer writes it on every import and the app only reads it, so it holds nothing the reader writes. It
records the file the book came from (`source`: the file name and the SHA-256 of its bytes) and no time, so two
imports of the same file write the same bytes.

Each entry of the contents carries the chapter file it opens (`href`, such as `ch-16.md`) and the paragraph it
starts at (`anchor`, such as `^p-012`). Titles are never compared, because chapters share titles: every book
of *The Wealth of Nations* starts again at "CHAPTER I.".

### Chapter files — `ch-NN.md`

Every top-level paragraph ends with a deterministic anchor:

```
Market segmentation is the bedrock of targeted positioning. ^p-042
```

Anchors are `^p-[0-9]{3,}` and hold across re-indexing. A new import can renumber them, and the reader's files
follow the text (`ingest/places.py`).

### `practice-deck.md` — the study items

```markdown
### Scenario: sc-ch-01-001
- **Chapter:** ch-01
- **Anchor:** ^p-003
**Scenario:** Which sentence comes right after this passage in the book?
"Every sentence of paragraph ^p-003 but the last."
- [ ] (A) A sentence of another paragraph of the chapter.
- [x] (D) The last sentence of paragraph ^p-003.
> **Rationale:** Right after this passage, the book says: "The last sentence of paragraph ^p-003."
```

Cloze items are written `{{c1::target}}` or `==target==`. Every answer key must be an exact character
substring of the chapter it names; a card that fails is rejected, not corrected.

### The study log — `reviews.jsonl`, `reading.jsonl`

One line per review and per piece of reading time. This is the permanent record; the `fsrs_cards` and
`reading_sessions` tables of the cache are rebuilt from it by `db/restore.rs` at every start. Nothing is taken
away and nothing is counted twice: a review the cache already has, matched on the card and the second it
happened, is skipped.

### Reader state

`bookmark.json` (chapter and paragraph), `ch-XX-highlights.json`, `ch-XX-notes.md`, `inspectional.json`,
`analytical.json`, `vocabulary.json`, and `vault/preferences.json`.

---

## 5. The cache database (`index.db`)

`%APPDATA%\book-engine\app_cache\index.db` on Windows, `~/.config/book-engine/app_cache/index.db` on Linux,
`~/Library/Application Support/book-engine/app_cache/index.db` on macOS. Delete it and the next start builds
the search index again from the vault Markdown and puts the study progress back from the study log.

Unit tests never open this database or the real vault. In test builds `get_db_path()` and `find_vault_root()`
resolve only inside a per-test temporary sandbox (`src-tauri/src/test_support.rs`) and return an error when no
sandbox is active.

```sql
-- Search (db/indexer.rs, db/schema.rs)
CREATE TABLE IF NOT EXISTS indexed_chapters (
    book_id TEXT, chapter_file TEXT, mtime INTEGER,
    PRIMARY KEY (book_id, chapter_file)
);
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5 (
    book_id, chapter_file, anchor, text, tokenize='porter unicode61'
);

-- Practice (db/fsrs_store.rs, db/card_identity.rs)
CREATE TABLE IF NOT EXISTS fsrs_cards (
    card_id TEXT PRIMARY KEY,        -- question id: <book>-card-<hash> or <book>-sc-<hash>
    book_id TEXT NOT NULL,
    chapter_file TEXT NOT NULL,
    anchor TEXT,
    item_type TEXT NOT NULL,         -- 'cloze' | 'scramble' | 'scenario'
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    state INTEGER NOT NULL DEFAULT 0,
    stability REAL NOT NULL DEFAULT 0.0,
    difficulty REAL NOT NULL DEFAULT 0.0,
    due INTEGER NOT NULL DEFAULT 0,
    last_review INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    card_type TEXT DEFAULT 'cloze',
    payload TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_cards (due, book_id);

-- A card is archived, never deleted: reason 'not_in_deck', 'duplicate' or 'book_not_in_vault'.
CREATE TABLE IF NOT EXISTS fsrs_cards_archive (
    archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
    archived_at INTEGER NOT NULL,
    reason TEXT NOT NULL
    -- followed by every fsrs_cards column, card_id to payload
);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_archive_card ON fsrs_cards_archive (card_id);

-- Analytics (db/analytics.rs, db/reading_velocity.rs)
CREATE TABLE IF NOT EXISTS review_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL, book_id TEXT NOT NULL,
    rating INTEGER NOT NULL, reviewed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_logs_date ON review_logs (reviewed_at);

CREATE TABLE IF NOT EXISTS reading_sessions (
    book_id TEXT NOT NULL, chapter_file TEXT NOT NULL,
    seconds_spent INTEGER NOT NULL DEFAULT 0,
    words_read INTEGER NOT NULL DEFAULT 0,  -- not used; reading time is counted, not speed
    completed INTEGER NOT NULL DEFAULT 0,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, chapter_file)
);
```

---

## 6. Backend commands

These 38 commands are the whole interface between the window and the backend. Every one is registered in
`generate_handler![...]` in `src-tauri/src/lib.rs`, and every one runs its disk work on a background thread
(`tokio::task::spawn_blocking`). A `tauri::AppHandle` argument is left out of the signatures below.

**A test compares this table with `lib.rs` both ways**, because the four tables this one replaces had invented
six commands that no longer existed and missed nine that did.

| Command | Signature | What it does |
| :--- | :--- | :--- |
| `get_library_books` | `() -> Result<Vec<BookMetadata>, AppError>` | Every book in `vault/books/`, read from its `_meta.json`. |
| `load_book_meta` | `(book_id) -> Result<String, String>` | The raw `_meta.json` of one book. |
| `load_chapter` | `(book_id, chapter_file) -> Result<String, String>` | One chapter's Markdown, and it opens that book's `assets/` folder to the asset protocol. |
| `load_notes` | `(book_id, notes_file) -> Result<String, String>` | One chapter's notes file. |
| `save_notes` | `(book_id, notes_file, content) -> Result<(), String>` | Writes that notes file. The notes pane is its only writer. |
| `get_all_book_notes` | `(book_id) -> Result<Vec<AggregatedNoteItem>, String>` | Every note line of a book, for the notes drawer. |
| `export_book_summary` | `(book_id) -> Result<String, String>` | Writes a Markdown summary of a book's notes and highlights. |
| `index_vault` | `() -> Result<IndexSummary, String>` | Indexes every changed chapter into FTS5, one transaction per book, and drops the rows of books that left the vault. |
| `search_vault` | `(query) -> Result<Vec<SearchResult>, String>` | BM25 search. A snippet is plain text with U+E000/U+E001 around each hit, never HTML. Under 2 characters finds nothing. Returns up to 30 matches. |
| `sync_practice_deck` | `(book_id) -> Result<usize, String>` | Reads `practice-deck.md`, checks every answer against the chapter character by character, and upserts one card per question. Returns the number of questions. |
| `get_due_cards` | `(book_id?, card_type?, limit?, hybrid_ratio?) -> Result<Vec<PracticeCardItem>, String>` | Up to `limit` cards (default 50): due reviews first, most overdue first, then new cards. |
| `get_chapter_due_cards` | `(book_id, chapter_file, card_type?, limit?, hybrid_ratio?) -> Result<Vec<PracticeCardItem>, String>` | The same, for one chapter. The Chapter Gatekeeper uses it. |
| `submit_review` | `(card_id, rating) -> Result<CardSchedule, String>` | Rates a card 1–4, computes the new FSRS-5 schedule, and writes the card and its `review_logs` row in one transaction. |
| `record_reading_progress` | `(book_id, chapter_file, seconds_spent, completed) -> Result<(), String>` | Adds reading time for a chapter to the study log and the cache. |
| `get_reading_velocity` | `(book_id?) -> Result<ReadingVelocityStats, String>` | Reading time and completion per chapter. |
| `get_study_analytics` | `(book_id?) -> Result<StudyAnalytics, String>` | Card state counts, retention, and the reviews in 15-minute blocks the heatmap is drawn from. |
| `get_vault_path` | `() -> Result<String, String>` | The vault folder in use. |
| `get_vault_status` | `() -> Result<VaultStatus, String>` | Where the vault is, or why it was not found. |
| `choose_vault_folder` | `() -> Result<Option<VaultStatus>, String>` | Opens the folder picker and saves the choice. The only use of the dialog plugin. |
| `get_chapter_highlights` | `(book_id, chapter_file) -> Result<Vec<HighlightItem>, String>` | The saved highlights of a chapter. |
| `save_chapter_highlights` | `(book_id, chapter_file, highlights) -> Result<(), String>` | Writes them. The reader is their only writer. |
| `get_bookmark` | `(book_id) -> Result<Option<Bookmark>, String>` | Where the reader stopped in a book. |
| `save_bookmark` | `(book_id, chapter_file, anchor?) -> Result<(), String>` | Saves that place. |
| `get_last_bookmark` | `() -> Result<Option<BookBookmark>, String>` | The newest bookmark of any book, so the app knows which book to open. |
| `get_preferences` | `() -> Result<Option<Preferences>, String>` | The reader settings from `vault/preferences.json`. |
| `save_preferences` | `(preferences) -> Result<(), String>` | Writes them. |
| `lookup_dictionary_term` | `(word) -> Result<Option<DictionaryEntry>, String>` | Looks a word up in the bundled lexicon. |
| `save_book_vocabulary` | `(book_id, entry) -> Result<(), String>` | Saves a looked-up word with the chapter and anchor it was read at. |
| `get_inspectional_blueprint` | `(book_id) -> Result<InspectionalBlueprint, String>` | Level 2: the pivotal chapters, the preface and the dip samples of a book. |
| `get_inspectional_exit_assessment` | `(book_id) -> Result<Option<ExitAssessmentPayload>, String>` | The reader's exit assessment. |
| `save_inspectional_exit_assessment` | `(book_id, assessment) -> Result<(), String>` | Writes it to `inspectional.json`. |
| `get_analytical_data` | `(book_id) -> Result<AnalyticalStore, String>` | Level 3: terms, arguments, inquiries and critiques of a book. |
| `save_analytical_data` | `(book_id, data) -> Result<(), String>` | Writes `analytical.json`. |
| `get_syntopic_topics` | `() -> Result<Vec<SyntopicTopicSummary>, String>` | Level 4: every topic in `vault/syntopicon/topics/`. |
| `get_syntopic_topic` | `(topic_id) -> Result<SyntopicTopic, String>` | One topic in full. |
| `create_syntopic_topic` | `(title, description) -> Result<SyntopicTopic, String>` | Makes a new topic file. |
| `save_syntopic_topic` | `(topic) -> Result<(), String>` | Writes it. |
| `export_syntopic_report` | `(topic_id) -> Result<String, String>` | Compiles the dialectical dossier into `vault/syntopicon/reports/`. |

---

## 7. Frontend

### Component tree

```
App.tsx (reader settings with the theme, viewMode, activeBook, activeChapter)
├── BackendErrorBar.tsx (every failed load or save, with a count and Dismiss)
├── VaultGate.tsx (shown instead of the reader when no vault folder was found)
├── Sidebar.tsx (collapsible contents, active chapter, word & anchor counts)
├── TopNav.tsx (progress bar, chapter title, theme toggles, view mode switches)
└── [ Main Content Area ]
    ├── Reader.tsx (TipTap editor: mounts ONLY one chapter at a time)
    │   ├── SelectionMenu.tsx (pill: [Highlight], [Note], [Copy Link])
    │   └── FootnotePopover.tsx (citation popover on [^n] click or hover)
    └── NotesPane.tsx (side-by-side notes editor, shown in dual view mode)
```

`SelectionMenu` and `FootnotePopover` position themselves with plain React and inline styles. **No positioning
library is installed**; `@floating-ui/react` was in `package.json` and imported nowhere, and it has been
removed.

### The reader's own rules

- The reader is memoized, so every handler is made once with `useCallback`, and the TipTap options are built
  outside render (`readerEditorOptions.ts`) because TipTap compares them by identity.
- A chapter is a document of the nodes in `readerExtensions.ts`, built by `parseChapterMarkdown`
  (`lib/markdown.ts`) block by block. Chapter HTML is never built as a string.
- Every dialog calls `useDialog` (`hooks/useDialog.ts`) and spreads its `panelProps`. That gives Escape, a
  focus trap, focus back on the way out, and `role="dialog"` with a name. No dialog watches `window` for keys.
- A dialog the reader types into passes `protectTyping`, so the first Escape shows `DiscardNotice` and only
  the second throws the words away.
- The app never writes a paragraph anchor of its own. A citation keeps the anchor of its block
  (`citationAnchorAt`, `lib/citations.ts`), or an empty anchor when there is none.

### Design tokens

The reader pairs an editorial serif with a sans-serif interface, held to `max-w-prose` (65–75 characters a
line) with 1.85 line-height.

- Reader body: `'Newsreader', 'Charter', Georgia, serif`
- Interface: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- Code and paragraph anchors: `'JetBrains Mono', 'Fira Code', monospace`

| Token | Warm Paper (`theme-paper`) | Sepia (`theme-sepia`) | Nord Dark (`theme-nord`) |
| :--- | :--- | :--- | :--- |
| `--theme-bg` | `#FBFBFA` | `#F4ECD8` | `#2E3440` |
| `--theme-surface` | `#F4F4F0` | `#EAE0C8` | `#3B4252` |
| `--theme-border` | `#E6E4DD` | `#D8CCB0` | `#4C566A` |
| `--theme-text` | `#2A2826` | `#3D3226` | `#ECEFF4` |
| `--theme-muted` | `#736F6E` | `#857463` | `#949FB5` |
| `--theme-accent` | `#9A3412` | `#A2522B` | `#88C0D0` |

---

## 8. Ingestion pipeline

An import is deterministic: the same file imported twice writes the same bytes. `requirements.lock` pins every
package and every package those need, because a new pymupdf can change a book's Markdown.

### Build, check, then put in place

An import builds the whole book in `vault/.import/<book-id>/`, where the app does not look for books
(`BookBuild`, `ingest/book_build.py`). Then:

1. **Check** (`ingest/book_check.py`): every paragraph ends with its anchor, every footnote link has its note,
   no character is broken. A book that fails stops the import and the vault keeps what it had.
2. **All together** (`ingest/vault_changes.py`): new texts go to temporary files, the old book folder moves
   aside to `vault/.import/<book-id>.replaced`, the new folder takes its place, then the temporary files. A
   failed step puts everything back. A move retries for up to 5 seconds, because Windows can hold a file while
   OneDrive or a virus scanner reads it.
3. **Only then** is the old folder removed.

A stopped import removes its build folder. After a power cut between the two folder moves, the old book is in
`<book-id>.replaced` and the next import stops and says to move it back.

### EPUB (`ingest/epub_parser.py`)

`html_to_markdown_blocks` writes every text a browser shows. A container such as `<div>`, `<aside>`,
`<figure>` or `<header>` gives the blocks inside it. A paragraph is one line, because a browser shows a line
break in the source as a space; a `<br>` stays a `<br>`. A `<pre>` keeps its lines and spaces and becomes a
code block, with `&#10;` for the blank lines inside it. The book's navigation, and the header and licence
Project Gutenberg adds, are left out.

**Endnotes** (`ingest/endnotes.py`): a link becomes a footnote only when its target can be a note and the link
or the target says so (`epub:type="noteref"`, `role="doc-noteref"`, `footnote`, `endnote`) or the link looks
like a note marker. Any other link keeps its words.

**Text that looks like HTML** (`ingest/markdown_text.py`): `escape_markdown_text` writes a `<` that could
start a tag as `&lt;` and an `&` that could start a character reference as `&amp;`, in every paragraph,
heading, list, table, quote and image text. `AT&T` and `2 < 3` stay as they are.

### PDF (`ingest/pdf_outline.py`, `ingest/pdf_parser.py`)

`outline_parts` makes a part of every outline entry at the chapter level, and of every entry above that level
that holds no chapter. The chapter level is the outline level with the most chapter-looking titles ("Chapter
3", "Chapter IV", "3. Pricing"). Parts are numbered `ch-01.md`, `ch-02.md` in page order, as in an EPUB, because
the app opens only chapter files with those names. A PDF with no usable outline is cut into parts of 35 pages.

A part before the first chapter is front matter, after the last is back matter, between two chapters is body,
and one whose title starts with "Appendix" is an appendix. Only chapters, body parts and appendices make
practice cards and count for the reading metrics.

**Figures** (`ingest/vector_figures.py`): a vector diagram is rasterized across the full printable band at 200
DPI. Boundaries stop before the next heading or table by whole-word match (`\bchapter\b`, `\bpart\b`,
`\btable\b`). Anything under 50 pt or thinner than 6:1 is pruned.

**Glyphs** (`ingest/glyph_repair.py`): a font that names its maths characters wrongly is remapped before any
text is read, so an `=` does not come out as a `¼`.

### Your files follow a new import (`ingest/places.py`)

A new import can renumber chapters and paragraphs. Before writing anything, the import reads the chapters the
vault has, then pairs old and new paragraphs in book order by their letters and digits, so a changed space or
mark does not count. A changed paragraph pairs with one that has much the same words, or that holds its words.
A chapter goes to the new chapter holding most of its paragraphs.

What moves: `bookmark.json`, the chapter file of each `reading.jsonl` line, `<chapter>-notes.md` and
`<chapter>-highlights.json` and every `^p-` anchor in them, `analytical.json`, and the citations of that book
in `vault/syntopicon/topics/*.json`. Card progress needs no move, because a card is known by its question.

**Close the app before importing a book again**, because the app writes the bookmark and reading time with the
chapter files it loaded.

### Cloze card generation (`ingest/cloze.py`)

Up to 8 cards a chapter. A card comes from a sentence of plain text; tables, code, HTML, images and footnote
texts give none. The answer is a marked term, searched in this order: bold, "X is defined as / refers to /
means", a quoted term, then "the purpose / principle / role of X is". It has 3 to 50 characters, holds a
letter, and neither starts nor ends with a small word. The prompt is the sentence as the reader sees it, with
one blank, and the answer appears nowhere else in it. A chapter with no marked term gets one card for its most
repeated 2- or 3-word term.

Answer and exact source are text of the chapter byte for byte. The generator checks both, the app checks the
answer again on deck sync, and `audit-practice.py` checks them with the same rules.

### The ledger (`ingest/ledger.py`)

`vault/_ledger.json` records each file the inbox took in: the SHA-256 of its bytes, the book it made, and that
book's chapter and word counts. Only the inbox adds a line, because only the inbox knows the file it moved
into `inbox/processed/`. `keep_numbers_true` runs at the end of every import, so the counts follow the book
whoever runs it.

---

## 9. Reader features

### Search

`index_vault` indexes a chapter when its text hash changed or it has no rows. Each row holds one paragraph as
plain text: tags and comments out, character references turned into their characters (`db/search_text.rs`).
Each book is written in its own transaction, so one unreadable book stops nothing; the files it could not read
come back in `problems`. Search results are drawn as React text with a `<mark>` around each hit, never as HTML
(`lib/searchSnippet.ts`). Latency is measured by `.agent/skills/benchmark-fts.py`, which reads a copy of the
index made with the SQLite backup API and requires an average under 15 ms.

### Highlights

A highlight saves its words from the text the reader sees (`lib/readerText.ts`) with `exact`, `prefix` and
`suffix`, and `highlightRanges` finds them again. Anchors convert between the saved form `^p-xxx` and the HTML
attribute form `p-xxx` (`lib/anchors.ts`).

### Practice and FSRS-5 (`src-tauri/src/fsrs.rs`)

Card states `New (0)`, `Learning (1)`, `Review (2)`, `Relearning (3)`; ratings `Again (1)`, `Hard (2)`,
`Good (3)`, `Easy (4)`. FSRS-5 with its 19 default weights: initial stability $S_0(G) = w_{G-1}$, initial
difficulty $D_0(G) = w_4 - e^{w_5 (G-1)} + 1$, retrievability $R(t, S) = (1 + \frac{19}{81} \cdot t/S)^{-0.5}$
so $R(S, S) = 0.9$. Target retention is 90%, so the interval is the rounded stability in days, 1 to 36,500.
Again brings a card back after 10 minutes. `fsrs/tests.rs` pins reference numbers from py-fsrs 5.1.3.

**One card per question:** `card_identity` hashes (FNV-1a, 64 bit) the item type and the normalized question
and answer. The deck position, chapter and anchor are not part of the id, so a deck generated again keeps the
progress of every unchanged question. A card whose question leaves the deck is archived with its progress and
comes back with it.

**Chapter Gatekeeper** (`GatekeeperModal.tsx`, `hooks/useChapterGate.ts`, `lib/chapterGate.ts`): a soft gate.
When it is on, every move to a **later** chapter of the open book tests up to `gatekeeperQuota` due cards of
the chapter being left. Moving back, staying, opening another book and syntopical moves pass at once. The gate
passes only when every card is rated Good or Easy and no scenario answer is wrong. "Skip Gatekeeper for now"
is the explicit override.

### Analytics

`reviewDays.ts` puts each 15-minute block on the day it starts in the window's time zone, draws the heatmap
Monday to Sunday with today in the last column, and counts streaks on calendar days, so a clock change is
still one day. `analyticsText.ts` shows a dash for a number the app does not have and never a default, so a
real 0 shows as 0.

### The four reading levels

1. **Elementary** — the pacer and the focus ruler.
2. **Inspectional** — the blueprint: pivotal chapters, the preface, non-overlapping head and tail dips, and
   an exit assessment in `inspectional.json`.
3. **Analytical** — terms, premise-to-conclusion argument graphs, author inquiries and Stage III critiques
   (Adler Rules 4–12) in `analytical.json`, with right-gutter badges on cited paragraphs.
4. **Syntopical** — `vault/syntopicon/`: neutral terms, universal questions, cross-book author perspectives
   and controversies. Every topic must cite at least two distinct books in the vault. Clicking a cross-book
   citation loads that book, opens the chapter and scrolls to the anchor. A compiled dossier goes to
   `vault/syntopicon/reports/`.

### The pacer (`lib/elementaryPacer.ts`)

A chunk underline paced by `Range.getClientRects()`, with a focus ruler and adjustable speed (`[` and `]` at
the elementary level). Alt+P starts and stops it. Every reader shortcut has exactly one owner
(`lib/readerShortcuts.ts`), so one key press runs its action once.

### The figure lightbox (`components/FigureLightboxModal.tsx`)

Clicking a diagram opens a full-screen lightbox with zoom in, zoom out, 1:1 reset and keyboard controls
(`+`, `-`, `0`, `Escape`). Its **Split View** button switches the window to dual view mode, which shows the
notes pane beside the chapter text. There is no publisher PDF pane: the app ships no PDF viewer, and a PDF
book exists in the vault only as Markdown and extracted images.

---

## 10. Packaging and security

Built with `npm run tauri build`. `tauri.conf.json` names `productName: "Book Engine"`, identifier
`com.bookengine.reader`, a minimum window of 900x600 and a default of 1280x860. The only bundle target is
`nsis`, with `installMode: "currentUser"` so no elevation prompt appears. The build writes the executable to
`apps/desktop/src-tauri/target/release/` and the installer to `target/release/bundle/nsis/`.

**The installer carries no Python.** There is no `resources` entry and no `externalBin`, and no Rust file
starts a Python process, so the shipped app cannot import a book. See `LICENSES.md`.

**Content security policy:** `default-src 'self'`, `script-src 'self'` (no inline script, no `onerror`, no
`data:` script, no code in a string), `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
`font-src 'self' https://fonts.gstatic.com`, `img-src 'self' asset: http://asset.localhost`,
`connect-src 'self' ipc: http://ipc.localhost`, and `object-src`, `base-uri`, `form-action` all `'none'`.

`assetProtocol.scope` is empty, so on its own the asset protocol opens nothing. `load_chapter` opens only that
book's `books/<book>/assets` folder, and a folder that is a link is left out. Tauri applies the policy only in
the built app; `tauri dev` loads from the Vite server, which sends none. `index.html` must hold no `<style>`
element, because Tauri would give it a nonce and a browser then ignores `'unsafe-inline'`.

**Two plugins only:** dialog, for the folder picker `choose_vault_folder` opens, and single-instance.
`src-tauri/src/security_config_tests.rs` fails when `Cargo.toml` names any other.

**TipTap 3.30.4 or later** on every `@tiptap/*` package, the first version without the `__proto__` hole of
`mergeAttributes` (GHSA-cp6q-959q-f8rh). The reader takes from the starter kit only what a chapter file uses;
`readerExtensions.ts` turns off the rest.

**Licence:** AGPL-3.0-or-later. `LICENSE` is the licence text itself; `LICENSES.md` is the measured position on
every dependency of all three ecosystems.

---

## 11. Health audit

`.agent/skills/audit-system.py` runs 12 vectors. Each one fails when it read nothing, so an empty folder is
never a pass.

1. **Ledger & vault parity** — every book in `vault/books/` and every binary in `inbox/processed/` is in
   `_ledger.json` with a matching SHA-256.
2. **Anchor & asset integrity** — paragraph anchors are present and unique, every footnote link has its
   definition, and every `![alt](assets/...)` names a file that exists.
3. **Zero-hallucination guardrail** — every answer key and rationale quote is an exact substring of the
   chapter it cites, every quiz option is chapter text without its Markdown marks, and every cloze answer is a
   term whose prompt shows the exact source.
4. **Backend safety** — `cargo check` and `cargo test` with zero errors, inside the temporary sandbox.
5. **Frontend safety** — TypeScript strict typecheck with zero errors.
6. **FTS5 latency** — average query under 15 ms.
7. **Desktop runtime launch** — the release binary starts and stays up for 5 seconds.
8. **Inspectional parity** — blueprints, pivotal chapters, non-overlapping dip samples, exit assessments.
9. **Analytical parity** — terms, argument graphs, critiques and inquiry solutions in `analytical.json`.
10. **Syntopical parity** — neutral terms, universal questions, cross-book perspectives, and every citation
    anchor resolving to a real paragraph. It reads and parses the topic files; it does not hash them.
11. **Elementary parity** — readability metrics in `_meta.json` within bounds, and chapter word counts
    matching the spine.
12. **Modularity & isolation** — no SQLite database anywhere inside `vault/`, and every source file in
    `apps/desktop/src/` and `packages/ingestion/ingest/` at or under 300 lines.
