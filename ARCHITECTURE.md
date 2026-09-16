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
    ├── ch-01-notes.md        <-- User notes & reflections (the notes pane is its only writer)
    ├── ch-01-highlights.json <-- Saved highlights (the reader is its only writer)
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
│       ├── audit-practice.py        # Audits zero-hallucination verbatim extractive study cards
│       ├── audit-system.py          # Universal dynamic health orchestrator (12 vectors: Ledger, Anchors, Cards, Rust, TS, FTS5, GUI smoke test, Inspectional, Analytical, Syntopical, Elementary, Modularity & Isolation)
│       ├── benchmark-fts.py         # Benchmarks SQLite FTS5 query latency (<15ms target)
│       ├── process-inbox.py         # Automated fail-safe batch book intake pipeline & ledger manager
│       └── test-index-rebuild.py    # Verifies self-healing FTS5 index reconstruction from vault
├── AGENTS.md                    # Canonical agent directives, operational guardrails & technology standards
├── CLAUDE.md                    # Claude agent pointer referencing canonical AGENTS.md
├── GEMINI.md                    # Gemini agent pointer referencing canonical AGENTS.md
├── apps/
│   └── desktop/                 # Tauri v2 native desktop application & React frontend
│       ├── src/                 # React 18+ client application
│       │   ├── components/      # UI components (Reader, Sidebar, TopNav, Modals, Popovers)
│       │   │   ├── analytics/       # Modular analytics subcomponents
│       │   │   │   ├── HeatmapGrid.tsx      # GitHub-style annual FSRS study activity heatmap
│       │   │   │   └── VelocityTable.tsx    # Chapter reading velocity, completion & WPM table
│       │   │   ├── analytical/      # Level 3 Analytical reading & interpretive workbench (Rules 4–12)
│       │   │   │   ├── AnalyticalWorkbenchPane.tsx # Mortimer Adler companion pane (Terms, Args, Inquiries, Critique)
│       │   │   │   ├── ArgumentBuilderModal.tsx    # Premise-to-conclusion argument graph assembler (Rules 6–7)
│       │   │   │   ├── ArgumentGutterBadge.tsx     # Right-gutter cited paragraph markers (T, C, P, ?)
│       │   │   │   ├── ArgumentsTab.tsx            # Rules 6 & 7 argument graph listing & premise viewer tab
│       │   │   │   ├── CritiqueModal.tsx           # Stage III critical evaluation modal (Rules 9–12)
│       │   │   │   ├── CritiqueTab.tsx             # Evaluative critique review & defect breakdown tab
│       │   │   │   ├── InquiriesTab.tsx            # Rules 4 & 8 author inquiry ledger & solution audit tab
│       │   │   │   ├── InquiryModal.tsx            # Rules 4 & 8 author inquiry cataloging & solution modal
│       │   │   │   ├── TermsTab.tsx                # Rule 5 specialized author terminology listing tab
│       │   │   │   └── TermModal.tsx               # Rule 5 author terminology definition modal
│       │   │   ├── notes/           # Modular notes slide-over subcomponents
│       │   │   │   ├── DrawerFilterBar.tsx  # Chapter, color & search filter controls
│       │   │   │   └── NoteEntryCard.tsx    # Highlight / reflection quote card
│       │   │   ├── elementary/      # Modular Level 1 Elementary Reading components & mechanics
│       │   │   │   ├── ElementaryCanvas.tsx         # Reading canvas wrapper with dynamic typographical measure
│       │   │   │   ├── ElementaryPacingControls.tsx # TopNav pacer Play/Pause toggle, WPM stepper & focus ruler controls
│       │   │   │   ├── FocusRuler.tsx               # Active reading block tracker & sibling paragraph dimmer
│       │   │   │   ├── LexiconPopover.tsx           # Floating offline lexicon definition & vocabulary saver popover
│       │   │   │   ├── PacingOverlay.tsx            # Visual laser/underline beam pacer sweep indicator
│       │   │   │   ├── useElementaryMechanics.ts    # Pacer state, RAF loop, duration calculation, scroll guard & pacer speed keys ([ and ])
│       │   │   │   ├── useLinePacer.ts              # Discrete line clock, saccadic pause & RAF line glide hook
│       │   │   │   └── usePacerDrag.ts              # Tactile pointer drag scrubbing, seek resolver & keyboard stepping hook
│       │   │   ├── inspectional/    # Modular Level 2 Inspectional Reading components
│       │   │   │   ├── BlueprintView.tsx        # Structural Book Blueprint (dossier, analytical TOC, clusters)
│       │   │   │   ├── DipStream.tsx            # Virtualized feed of chapter dip sampling cards
│       │   │   │   ├── InspectionalExitModal.tsx # Four-question Adlerian exit assessment modal
│       │   │   │   └── SkimTimerWidget.tsx      # Ambient skimming countdown timer & exit trigger
│       │   │   ├── navigation/      # Modular navigation rails
│       │   │   │   └── LevelRail.tsx        # Fixed 36px vertical rail for Adler reading level modes (I–IV)
│       │   │   ├── practice/        # Modular practice drill subcomponents
│       │   │   │   ├── ClozeDrill.tsx       # Extractive Cloze completion drill
│       │   │   │   ├── GatekeeperCardDrill.tsx # Dual-modality Cloze & Scenario MCQ challenge drill for Chapter Gatekeeper
│       │   │   │   ├── RatingBar.tsx        # FSRS-5 Again/Hard/Good/Easy rating bar with suggested rating badge
│       │   │   │   ├── ScenarioCardView.tsx # Deductive multiple-choice scenario drill with anti-bias option shuffling
│       │   │   │   └── ScrambleDrill.tsx    # Drag/click scrambled clause reconstruction drill
│       │   │   ├── reader/          # Modular TipTap custom extensions & reader hooks
│       │   │   │   ├── TipTapExtensions.ts  # AnchorParagraph & FootnoteRef custom Prosemirror nodes
│       │   │   │   └── useReaderSelection.ts # Text selection, highlights, anchor detection & lexicon de-confliction
│       │   │   ├── settings/        # Modular reader settings tabs
│       │   │   │   ├── ElementaryTab.tsx       # Level 1 Elementary Reading shell & settings tab
│       │   │   │   ├── FocusRulerControls.tsx  # Focus ruler contrast presets, fine stepper & spotlight toggle
│       │   │   │   ├── GeneralTab.tsx          # Reading palette, font family, font size & line height
│       │   │   │   ├── InspectionalTab.tsx     # Skim timer, exit card, sampling depth & single-key paging
│       │   │   │   ├── PacerControls.tsx       # Pacer velocity, line sweep vs chunk underline, focus lock & direct launch button
│       │   │   │   └── PracticeTab.tsx         # Chapter Gatekeeper, recall quota, daily target & deck sync
│       │   │   ├── sidebar/         # Modular sidebar subcomponents
│       │   │   │   └── TOCItemRow.tsx       # Hierarchical TOC tree item row
│       │   │   ├── syntopicon/      # Modular Level 4 Syntopical Reading & Syntopicon components
│       │   │   │   ├── ControversyModal.tsx # Rule 4 multi-author controversy and issue definition modal
│       │   │   │   ├── IssueMatrixTab.tsx   # Rules 3 & 4 framed question feed & controversy matrix tab
│       │   │   │   ├── NeutralTermModal.tsx # Rule 2 neutral semantic bridge & author term mapping modal
│       │   │   │   ├── SynthesisTab.tsx     # Rule 5 dialectical synthesis editor & Markdown dossier compiler tab
│       │   │   │   ├── SyntopiconPane.tsx   # Level IV Syntopicon registry, topic manager & tab shell
│       │   │   │   └── SyntopicTermsTab.tsx # Rule 2 neutral terminology directory & citation mapper tab
│       │   │   ├── AnalyticsModal.tsx   # FSRS retention heatmap & reading velocity dashboard modal
│       │   │   ├── AppModals.tsx        # Modular modal dialog coordinator & container
│       │   │   ├── BackendErrorBar.tsx  # Error bar: every failed backend load or save, with a count and Dismiss
│       │   │   ├── BookSelector.tsx     # Dynamic vault library switcher popover
│       │   │   ├── FigureLightboxModal.tsx # High-resolution diagram pan/zoom lightbox with split page link
│       │   │   ├── FootnotePopover.tsx  # Floating UI citation preview popover
│       │   │   ├── GatekeeperModal.tsx  # Chapter Gatekeeper dynamic-quota recall challenge modal
│       │   │   ├── LevelCompanionPane.tsx # Modular Level III & IV companion pane coordinator
│       │   │   ├── LevelGuideModal.tsx  # Contextual HUD, level cheatsheets & keyboard shortcuts modal
│       │   │   ├── NotesDrawer.tsx      # Unified slide-over notes & W3C highlights drawer with summary export
│       │   │   ├── NotesPane.tsx        # Dual-pane Markdown reflection notes editor (locked until the notes file loads; one pane per chapter)
│       │   │   ├── OmniSearchModal.tsx  # Ctrl+K global full-text search palette
│       │   │   ├── PracticeModal.tsx    # Extractive practice suite (Cloze, Scenario MCQ & Scramble drills)
│       │   │   ├── Reader.tsx           # Virtualized TipTap chapter canvas with margin anchors
│       │   │   ├── SelectionMenu.tsx    # Floating UI selection toolbar (Highlight, Note, Link)
│       │   │   ├── SettingsPopover.tsx  # Reader preferences & Gatekeeper settings popover
│       │   │   ├── Sidebar.tsx          # Hierarchical TOC & linear chapter navigation drawer
│       │   │   └── TopNav.tsx           # Top navigation chrome, progress bar, view modes & themes
│       │   ├── hooks/           # Modular application custom hooks
│       │   │   ├── useAnalyticalModals.ts    # Level 3 modal open/close & staged target coordinator
│       │   │   ├── useAnalyticalSession.ts   # Analytical reading store, cascading integrity & persistence hook
│       │   │   ├── useBookSession.ts         # Book loading, reading progress, session timing & chapter jumping (every in-book chapter change goes through openChapter; only the newest load lands)
│       │   │   ├── useChapterGate.ts         # Chapter Gatekeeper (soft gate): tests the due cards of the chapter the reader leaves
│       │   │   ├── useInspectionalSession.ts # Inspectional countdown timer, sub-view & exit prompt manager
│       │   │   ├── usePracticeDeck.ts        # Practice deck state, mode/ratio filtering & daily target limits
│       │   │   └── useSyntopiconSession.ts   # Level 4 Syntopicon registry, cascade-pruning & topic session hook
│       │   ├── lib/             # Core TypeScript utilities, transformers, and contracts
│       │   │   ├── api/             # Modular Tauri IPC client modules (every call goes through callBackend)
│       │   │   │   ├── dev/             # Browser stand-in for the backend: callBackend loads it only in a dev build outside Tauri
│       │   │   │   │   ├── devBackend.ts        # Single entry point: the stand-in for every API function
│       │   │   │   │   ├── fallbackAnalytical.ts # Sample analytical store & localStorage analytical data
│       │   │   │   │   ├── fallbackAnalytics.ts # In-memory analytics mock generators
│       │   │   │   │   ├── fallbackBooks.ts     # Sample library & chapters, localStorage notes, plain text search
│       │   │   │   │   ├── fallbackHighlights.ts # Sample chapter highlights in browser storage
│       │   │   │   │   ├── fallbackLexicon.ts   # In-memory dictionary and deduplicated vocabulary storage
│       │   │   │   │   ├── fallbackNotes.ts     # Sample chapter notes, in-browser notes aggregation & summary export
│       │   │   │   │   ├── fallbackPractice.ts  # Sample practice cards, due-card filter & simple review schedule
│       │   │   │   │   ├── fallbackSyntopicon.ts # Sample syntopicon topic & localStorage topic registry
│       │   │   │   │   └── mockData.ts          # Default mock book catalogs & sample chapters
│       │   │   │   ├── analyticalApi.ts     # Analytical reading store load/save IPC
│       │   │   │   ├── analyticsApi.ts      # Study analytics, reading session & velocity IPC client
│       │   │   │   ├── clientBase.ts        # Tauri detection & callBackend: inside the app a failed command rejects
│       │   │   │   ├── highlightsApi.ts     # Chapter highlights IPC: the only writer of `<chapter>-highlights.json`
│       │   │   │   ├── lexiconApi.ts        # Sanitized offline dictionary lookup & vocabulary vault persistence IPC
│       │   │   │   ├── notesApi.ts          # Cross-chapter note aggregation & summary export IPC
│       │   │   │   ├── practiceApi.ts       # FSRS practice card synchronization & review IPC
│       │   │   │   └── syntopiconApi.ts     # Level 4 Syntopicon topic registry & persistence IPC client
│       │   │   ├── types/           # Modular contract definitions
│       │   │   │   ├── analytical.ts        # Level 3 analytical terms, citations & argument graph interfaces
│       │   │   │   └── syntopicon.ts        # Level 4 syntopical neutral terms, questions & controversy models
│       │   │   ├── anchors.ts           # Paragraph anchor forms: saved ^p-xxx vs. HTML data-anchor p-xxx
│       │   │   ├── api.ts               # Unified API client facade: a failed backend call reaches the caller
│       │   │   ├── apiFailures.test.ts  # API tests: inside the app, every failed backend call rejects; empty answers stay empty
│       │   │   ├── backendErrors.ts     # Error bar store: failed loads and saves, repeats counted, newest 5 kept
│       │   │   ├── backendErrors.test.ts # Error bar tests: a repeated failure raises its count; Tauri rejection values become text
│       │   │   ├── bionic.ts            # Deterministic bionic fixation bolding transformer
│       │   │   ├── chapterGate.ts       # Pure Chapter Gatekeeper rules: which chapter moves are gated, which gate runs pass
│       │   │   ├── chapterGate.test.ts  # Gate tests: later chapters only, every level but syntopical, wrong answers never pass
│       │   │   ├── elementaryPacer.ts      # Pure pacer timing, chunking, and contrast opacity functions
│       │   │   ├── elementaryPacer.test.ts # Unit tests for pacer timing, chunking, and contrast math
│       │   │   ├── highlights.ts        # W3C Text Quote Selector reader, paragraph placement & old-comment parser (finds the JSON list, not the first `-->`)
│       │   │   ├── highlights.test.ts   # Highlight tests: a saved anchor brings each highlight back to its own paragraph
│       │   │   ├── levelGuideData.ts    # Mortimer Adler levels static cheatsheet & hotkeys registry
│       │   │   ├── markdown.ts          # Chapter Markdown preprocessor & anchor normalizer
│       │   │   ├── notesAggregator.ts   # Cross-chapter note aggregation, anchor sorting & summary compiler
│       │   │   ├── notesAutosave.ts     # Chapter notes autosave: one save per typing pause, one when the chapter closes, and one now
│       │   │   ├── notesAutosave.test.ts # Autosave tests: the words go into the chapter they were typed in
│       │   │   ├── notesQuote.ts        # A quote sent to the chapter notes: where it goes, and saved at once
│       │   │   ├── notesQuote.test.ts   # Quote tests: a quote reaches the file with no keystroke after it
│       │   │   ├── notesWriters.test.ts # Writer tests: the chapter notes and the highlights use different backend commands
│       │   │   ├── practiceContract.json    # Exact get_due_cards scenario-card JSON shared by the Rust & TS contract tests
│       │   │   ├── practiceContract.test.ts # Contract tests: backend field names vs. frontend grading & browser mocks
│       │   │   ├── practiceSession.ts       # Pure practice/gatekeeper session: card type per practice mode, fixed card copy, position, ratings & completion
│       │   │   ├── practiceSession.test.ts  # Session tests: all due cards shown while the due list shrinks, gatekeeper quota
│       │   │   ├── practiceTypes.ts     # FSRS practice models (ScenarioOption, ScenarioPayload, PracticeCardItem)
│       │   │   ├── preferences.ts       # Default v2 preferences & deep-merge migration helper
│       │   │   ├── readerLoads.ts       # Book & chapter loading: only the newest load may change the reader
│       │   │   ├── readerLoads.test.ts  # Load tests: a slow chapter that answers late changes nothing
│       │   │   ├── readerLocation.ts    # Book + chapter file + anchor locations: search hits open their own book
│       │   │   ├── readerLocation.test.ts # Location tests: a hit in another book's ch-01.md opens that book, not the open one
│       │   │   ├── readerShortcuts.ts   # Keyboard shortcut owners: App listener (Ctrl+K, Alt+P, ? / F1) or elementary canvas ([ and ])
│       │   │   ├── readerShortcuts.test.ts # Shortcut tests: one Alt+P press toggles the pacer once at every reading level
│       │   │   ├── searchQuery.ts       # Search box minimum length (2 characters), the same as the backend
│       │   │   ├── searchQuery.test.ts  # Search length tests: 1 character does not search, spaces at the ends do not count
│       │   │   └── types.ts             # Canonical TypeScript interfaces & data contracts
│       │   ├── App.tsx          # Application shell, global state coordinator & router
│       │   ├── index.css        # Editorial design tokens, typography, and margin glyphs
│       │   ├── main.tsx         # React DOM mount entrypoint
│       │   └── vite-env.d.ts    # Vite client types (import.meta.env)
│       └── src-tauri/           # Rust backend shell (Tauri v2 + SQLite)
│           ├── icons/           # High-resolution native application branding icons
│           │   ├── source-icon.svg      # Master vector editorial monogram
│           │   ├── icon.ico             # Windows multi-resolution taskbar & titlebar icon
│           │   ├── 32x32.png            # Compact native icon
│           │   ├── 128x128.png          # Medium application icon
│           │   ├── 128x128@2x.png       # Retina high-DPI icon
│           │   └── icon.png             # 512x512 master application branding asset
│           ├── src/
│           │   ├── commands.rs          # Asynchronous Tauri IPC command handlers
│           │   ├── db/                  # Modular SQLite storage, FTS5 indexer & analytics
│           │   │   ├── analytics.rs         # Retention metrics, study analytics & review heatmap
│           │   │   ├── backfill.rs          # One-time copy of an older cache into the vault study log
│           │   │   ├── backfill_tests.rs    # Copy tests: the cache reaches the vault once, and never twice
│           │   │   ├── card_identity.rs     # Stable practice card ids from the question text (FNV-1a), not the deck position
│           │   │   ├── deck_sync.rs         # Practice deck sync: one card per question, archive for cards that left the deck, old-id migration
│           │   │   ├── deck_sync_tests.rs   # Deck sync tests: removed, changed, reordered, returning & duplicate cards
│           │   │   ├── due_cards.rs         # Practice session card picker: due reviews first, then new cards (cloze/scenario mix), for the whole book or one chapter (Chapter Gatekeeper)
│           │   │   ├── fsrs_parser.rs       # Practice card markdown extraction & verbatim validator
│           │   │   ├── fsrs_store.rs        # FSRS deck statistics & review submission (card update and review log row in one transaction)
│           │   │   ├── fsrs_store_tests.rs  # Review saving tests: failed log row, card without a book id, double click
│           │   │   ├── indexer.rs           # Background vault indexing & FTS5 full-text search
│           │   │   ├── models.rs            # SQLite row models and analytics transfer structs
│           │   │   ├── reading_velocity.rs  # Chapter reading session recording & velocity calculations
│           │   │   ├── restore.rs           # Puts the study progress back into the cache from the vault study log
│           │   │   ├── restore_tests.rs     # Restore tests: throwing the cache away loses no study progress
│           │   │   ├── schema.rs            # SQLite database initialization & migrations
│           │   │   ├── search_query.rs      # Typed search to FTS5 expression: quoted words & phrases, hyphen spellings, AND/OR/NOT operators, 2-character minimum
│           │   │   ├── search_tests.rs      # Search tests on a real FTS5 index: operators, inner punctuation, phrases, short searches
│           │   │   ├── seed_lexicon.rs      # Curated seed dictionary entries & initial SQLite database seeding
│           │   │   └── mod.rs               # Ephemeral SQLite database module root & test suite
│           │   ├── fsrs/                # FSRS engine test module
│           │   │   └── tests.rs             # FSRS-5 reference tests with numbers from the official py-fsrs 5.1.3
│           │   ├── fsrs.rs              # Local FSRS-5 spaced repetition scheduling engine
│           │   ├── lib.rs               # Application builder, plugin setup, and invoke router
│           │   ├── main.rs              # Tauri binary executable entrypoint
│           │   ├── test_support.rs      # Test-only sandbox: temporary vault & cache database per unit test, also for its test threads (Sandbox::spawn)
│           │   ├── vault/               # Modular vault file I/O & notes aggregation
│           │   │   ├── analytical.rs        # Level 3 analytical store loader, saver & unit tests; a damaged file stops the load and the save
│           │   │   ├── highlights.rs        # Chapter highlights file: load, save, and the one-time move out of the old notes comment (quotes may hold `-->`)
│           │   │   ├── highlights_tests.rs  # Highlight tests: a notes save cannot erase a highlight, and the move keeps the reader's text
│           │   │   ├── json_store.rs        # Safe JSON read for vault files: byte order mark removed, a damaged file errors and is copied to <name>.corrupt-<time>
│           │   │   ├── locate.rs            # Finds the vault folder, and remembers the one the reader picked
│           │   │   ├── locate_tests.rs      # Find tests: a folder with no books inside is refused, and nothing is remembered
│           │   │   ├── models.rs            # Vault metadata, analytical and note structures
│           │   │   ├── notes.rs             # Chapter reflection notes loader, saver & summary export
│           │   │   ├── reader.rs            # Book discovery & chapter I/O; a rewritten _meta.json keeps its key order and line endings (the vault folder comes from locate.rs)
│           │   │   ├── reader_tests.rs      # Vault write tests: no half-written file while a save runs, _meta.json key order and line endings kept
│           │   │   ├── safe_write.rs        # The one vault write: temporary file in the same folder, flushed, then renamed over the target, so a save is never half done
│           │   │   ├── study_log.rs         # The permanent record of your study: reviews & reading time, one line each
│           │   │   ├── syntopicon.rs        # Level 4 Syntopicon topic file I/O & report exporter
│           │   │   ├── syntopicon_compiler.rs # Level 4 Dialectical dossier compiler producing Markdown reports
│           │   │   ├── syntopicon_models.rs # Level 4 Syntopicon neutral terms & controversy structs
│           │   │   ├── vocabulary.rs        # Vault vocabulary persistence with case-insensitive deduplication; a damaged file stops the load and the save
│           │   │   └── mod.rs               # Vault module facade
│           ├── Cargo.toml       # Rust dependency manifest (rusqlite, tokio, tauri v2)
│           └── tauri.conf.json  # Tauri v2 window, security, and bundle configuration
│ 
├── docs/
│   └── review/                  # Code review registers: verified findings, evidence & fix order
│       └── 2026-09-14-findings.md  # 76 verified findings from the review of commit 050fe3f, with fix checkboxes
├── inbox/                       # Ingestion quarantine & staging directory
│   ├── .gitkeep                 # Tracked directory marker
│   └── processed/               # Quarantined & processed binary source documents (.epub, .pdf)
├── packages/
│   └── ingestion/               # Python CLI & deterministic parsing pipeline
│       ├── ingest/              # Ingestion library modules
│       │   ├── anchors.py               # Deterministic paragraph anchor (^p-xxx) injector
│       │   ├── assets.py                # Asset extraction, micro-asset filtering & page-level image suppression
│       │   ├── batch.py                 # Batch document intake utility (.epub & .pdf)
│       │   ├── cli.py                   # Command-line entrypoint (`book-ingest`)
│       │   ├── elementary.py            # Deterministic Flesch-Kincaid & reading time metrics
│       │   ├── endnotes.py              # Backmatter endnote relocation to inline footnotes
│       │   ├── epub_parser.py           # XHTML chapter extractor & typography normalizer
│       │   ├── layout_stitcher.py       # Narrative sentence healing, layout reconciliation & callout hoisting
│       │   ├── models.py                # Pydantic schema validation for metadata and cards
│       │   ├── pdf_parser.py            # Sequential chapter-by-chapter PDF parser & asset coordinator
│       │   ├── pdf_sanitizer.py         # PDF slug normalization, drop-cap healing, heading & author sanitization
│       │   ├── pipeline.py              # End-to-end ingestion pipeline coordinator
│       │   ├── salience.py              # Deterministic salience scorer & Cloze deck generator
│       │   ├── sample_generator.py      # Starter sample generator for development
│       │   ├── scenarios.py             # Contextual deductive scenario & MCQ engine with thematic distractor matching
│       │   └── vector_figures.py        # Vector diagram rasterization, boundary stops & full-width section bounds
│       ├── tests/               # Pytest verification suite for anchors, schemas, TOC, and pipeline
│       │   ├── test_analytical_audit.py # Vector 9 analytical logic & citation parity test suite
│       │   ├── test_anchors.py          # Deterministic paragraph anchor injection test suite
│       │   ├── test_endnotes.py         # Endnote relocation & inline footnote syntax test suite
│       │   ├── test_figure_cards.py     # Figure extraction, full-width dimensions & table suppression tests
│       │   ├── test_meta_schema.py      # Book metadata, hierarchical TOC & schema validation tests
│       │   ├── test_pdf.py              # PDF parsing, chapter splitting & text preservation tests
│       │   ├── test_pipeline.py         # End-to-end ingestion pipeline integration test suite
│       │   ├── test_practice_deck.py    # Zero-hallucination verbatim practice card validation tests
│       │   ├── test_salience.py         # Salience scoring & extractive cloze extraction tests
│       │   ├── test_syntopicon_audit.py # Vector 10 syntopical cross-vault referential parity test suite
│       │   └── test_toc.py              # Table of contents extraction & hierarchy tests
│       └── pyproject.toml       # Python package configuration and CLI entrypoints
├── scripts/
│   └── create_desktop_shortcut.ps1 # One-click Windows desktop shortcut generator
├── vault/                       # SOLE PERMANENT RECORD: User Markdown vault (Versioned / Syncable)
│   ├── books/<book-id>/         # Chapter Markdown (`ch-XX.md`), `_meta.json`, and extracted assets
│   ├── notes/<book-id>/         # Chapter notes (`ch-XX-notes.md`), highlights (`ch-XX-highlights.json`), study decks, and the study log (`reviews.jsonl`, `reading.jsonl`)
│   └── syntopicon/              # Level 4 Syntopicon topic registries & compiled reports
│       ├── topics/              # Cross-book syntopical topics (`<topic-id>.json`)
│       └── reports/             # Compiled dialectical dossiers (`<topic-id>-synthesis.md`)
└── %APPDATA%\book-engine\       # EPHEMERAL CACHE: OS AppData (Never in vault; rebuilt from the vault)
    └── app_cache/index.db       # SQLite database (FTS5 search index + a copy of the study progress)
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

### Vector Figure Extraction & Full-Width Section Bounding (`packages/ingestion/ingest/vector_figures.py`)
Multi-column textbook pages frequently include full-width conceptual matrices, multi-step process models, and leader callout boxes. To guarantee unclipped, high-resolution rendering:
- **Full-Width Section Bounding:** Vector diagram rasterization captures the full printable horizontal band: $[0, y_{\text{top}} - 8, \text{page.width}, y_{\text{bottom}} + 8]$ rendered at 200 DPI.
- **Stop-Block Protection:** Diagram boundaries stop cleanly before subsequent chapter sections, headings, or tables using strict word-boundary token matching (`\bchapter\b`, `\bpart\b`, `\btable\b`).
- **Aspect Ratio & Dimension Filtering:** Micro-decorations, standalone page header lines, and thin borders ($<50$ pt or aspect ratio $>6:1$) are pruned to prevent over-extraction.

### Zero-Redaction Reading Architecture & Table Suppression (`packages/ingestion/ingest/pdf_parser.py`)
- **Zero Redactions:** Destructive PDF text redactions are permanently abolished. Markdown text is generated directly from the pristine PyMuPDF document, guaranteeing 100% text completeness and preventing prefix or word amputations (`Importance`, `Underlying`, `They include`).
- **Synthetic Table Suppression:** When PyMuPDF vector line heuristics detect diagram lines and synthesize ASCII markdown tables (`||Starting point|Focus|...`), the parser detects embedded figure markers across table rows and cleanly replaces the entire synthetic table with the high-resolution figure asset reference while leaving surrounding body narrative (e.g., Steve Jobs quote) as clean Markdown prose.

---

## 3. Storage Separation & Synchronization

- **Vault (`vault/`):** Human-readable plain-text Markdown files and images. Can be edited externally (Obsidian, Neovim, VS Code).
- **Ephemeral Cache (`index.db`):** Stored strictly in the OS application data folder (`%APPDATA%\book-engine\`). Never checked into version control. It holds only a copy: everything in it is rebuilt from the vault.
- **The Reader Says Where the Vault Is:** The vault folder is looked for in this order (`apps/desktop/src-tauri/src/vault/locate.rs`): the folder the reader picked, saved in `%APPDATA%\book-engine\settings.json`; the `BOOK_ENGINE_VAULT` variable; a `vault` folder beside the program or beside its parent, for a copy carried on a stick; and a `vault` folder up to six levels above the working folder, which is the dev run from the repository. Only the last of these existed before, so an installed copy started in its install folder and found nothing, and every read and write failed with no way to put it right (LC-01). A folder counts as a vault only when it holds a `books` folder: `remember_vault` refuses anything else and says what a vault looks like, so the app never quietly points at an empty folder. `VaultGate.tsx` holds the app back until the folder is known and opens the picker (`choose_vault_folder`).
- **Your Study Is in the Vault:** Every card review and every piece of reading time is written as one line to `vault/notes/<book-id>/reviews.jsonl` and `vault/notes/<book-id>/reading.jsonl` (`apps/desktop/src-tauri/src/vault/study_log.rs`), before the cache is touched. A review the vault refuses is not saved at all. Card schedules, review history and reading time used to live only in `index.db`, which is not in the vault and is not backed up, so losing that file lost every bit of study progress (DS-01). At startup `db/backfill.rs` copies whatever a cache from before the change still holds and the vault does not, once; `db/restore.rs` then puts back whatever the cache is missing. Both write only what is missing, so a normal start changes nothing, and a deleted, damaged or brand new cache fills itself again.
- **Cache Shape:** `PRAGMA user_version` holds the shape of `index.db`, and `CACHE_SCHEMA_VERSION` (`db/schema.rs`) is the shape this build knows. A file stamped higher was made by a newer build and is not opened, because a newer shape can hold things this build would drop. The vault keeps the study progress either way.
- **Newest Load Wins:** A book or a chapter is read from the disk, so its answer comes back a moment later. The reader takes a ticket for every load (`createLoadGuard`, `src/lib/readerLoads.ts`), and an answer that is no longer the newest one changes nothing. Before this, a slow chapter one showed its text and its highlights under chapter two, and a slow book left the open book and the book on screen pointing at different books, so notes and highlights were saved under the wrong book (DS-07). Opening a chapter also empties the reader at once, so the words of the chapter you left are never shown under the chapter you opened.
- **One Pane per Chapter:** `App.tsx` gives the notes pane a key of book and chapter, so every chapter gets its own pane with its own text. A pane that kept its text across a chapter change could save the notes of one chapter into the file of another (DS-07). What the reader typed is held together with the file it belongs to (`src/lib/notesAutosave.ts`) and is saved into that file when the chapter closes, so the last words are never left waiting in a timer.
- **A Quote Is Saved at Once:** "Add note" on a selection puts the quote at the end of the chapter notes and saves them right away (`addQuoteToNotes`, `src/lib/notesQuote.ts`), because a quote is a click, not typing. It used to change the text on screen only, so it reached the vault after the next keystroke and was lost at the next chapter change without one (DS-08). A quote waits while the notes are read from the disk, on screen as well, so the notes that arrive cannot wipe it; notes that failed to load never take a quote, and the reader is told.
- **One Writer per File:** The chapter notes `ch-XX-notes.md` hold only what the reader writes, and the notes pane is their only writer. Nothing parses a highlight out of Markdown any more, so no character in a quote can break the saved list (DS-06). Highlights live in `ch-XX-highlights.json`, and `vault/highlights.rs` is their only writer. Before this, both parts saved the same Markdown file, so a keystroke in the notes pane erased a highlight that had just been added (DS-05). A chapter that still keeps its highlights in the old `<!-- highlights-json ... -->` comment is moved over the first time it is read: the highlights and the quote lines the app wrote leave the notes file, and the reader's own headings and text stay.
- **Safe Vault Write:** Every write into the vault goes through `write_file` (`apps/desktop/src-tauri/src/vault/safe_write.rs`): the bytes go to a temporary file in the same folder, are flushed to the disk, and are then renamed over the target. A rename is one step, so a crash or a power cut leaves the whole old file or the whole new file, never an empty or cut-off one. A rename that fails because another program holds the file, such as the OneDrive client, is tried a few times before the save reports an error, and the temporary file is removed. `serde_json` is built with `preserve_order`, so a rewritten `_meta.json` keeps the key order it had, and `save_inspectional_exit_assessment` writes back the line endings the file had.
- **Damaged Vault File:** A vault JSON file that cannot be parsed is never read as empty data, because the next save would write that empty data back. `read_json_file` (`apps/desktop/src-tauri/src/vault/json_store.rs`) removes a leading byte order mark, and a file it still cannot parse gives an error that names the file and is copied to `<file name>.corrupt-<time>`. `vocabulary.rs` and `analytical.rs` read through it, so both the load and the save fail and the file on disk is left exactly as it is.
- **No Hidden Fallback:** Inside the app, every frontend call to the backend goes through `callBackend` (`apps/desktop/src/lib/api/clientBase.ts`). A failed load or save rejects with the backend error and shows in the error bar (`BackendErrorBar.tsx`). Nothing falls back to sample data, and no vault data goes to browser storage. Data that did not load is not saved over: the notes pane stays locked, a new highlight is not saved, and analytical changes for that book are not saved.

### Highlight Stability (W3C Text Quote Selector)
Highlights store `exact`, `prefix`, and `suffix` context fields alongside paragraph anchors to survive external edits.

---

## 4. Zero-Hallucination Practice Architecture: As-Built Implementation (Phase 4)

### Local FSRS-5 Scheduling Engine (`apps/desktop/src-tauri/src/fsrs.rs`)
Review intervals and memory retention calculations are computed locally via the Free Spaced Repetition Scheduler (FSRS-5) algorithm without network dependencies:
- **Card States:** `New (0)`, `Learning (1)`, `Review (2)`, `Relearning (3)`.
- **4-Tier Rating Scale:** `Again (1)`, `Hard (2)`, `Good (3)`, `Easy (4)`.
- **Math Standard:** FSRS-5 with its 19 default weights. Initial stability $S_0(G) = w_{G-1}$, initial difficulty $D_0(G) = w_4 - e^{w_5 (G-1)} + 1$, and power-law retrievability $R(t, S) = (1 + \frac{19}{81} \cdot t/S)^{-0.5}$, so $R(S, S) = 0.9$. Difficulty updates use linear damping and mean reversion toward $D_0(4)$. Stability updates cover recall, forgetting (capped at $S / e^{w_{17} w_{18}}$), and same-day reviews ($S \cdot e^{w_{17}(G - 3 + w_{18})}$), and they use the difficulty from before the review. Target retention is $90\%$, so the interval is the rounded stability in days, from 1 to 36,500 days.
- **Scheduling Policy:** Elapsed time counts whole days since the last review. Again brings a card back after 10 minutes (Learning or Relearning); Hard, Good, and Easy schedule whole days (Review). The tests in `fsrs/tests.rs` pin reference numbers from the official py-fsrs 5.1.3 implementation.

### Ephemeral SQLite Schema (`%APPDATA%\book-engine\app_cache\index.db`)
Card state, stability, difficulty, and scheduling timestamps are held here so the app can ask questions of them quickly. The permanent record of every review is `vault/notes/<book-id>/reviews.jsonl`, and this table is rebuilt from it (`db/restore.rs`):
```sql
CREATE TABLE IF NOT EXISTS fsrs_cards (
    card_id TEXT PRIMARY KEY, -- question id: <book>-card-<hash> or <book>-sc-<hash> (db/card_identity.rs)
    book_id TEXT NOT NULL,
    chapter_file TEXT NOT NULL,
    anchor TEXT,
    item_type TEXT NOT NULL, -- 'cloze' | 'scramble' | 'scenario'
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

-- Cards whose question left the deck (reason 'not_in_deck') and older duplicate rows (reason 'duplicate'), with their progress.
CREATE TABLE IF NOT EXISTS fsrs_cards_archive (
    archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
    archived_at INTEGER NOT NULL,
    reason TEXT NOT NULL
    -- followed by every fsrs_cards column, card_id to payload
);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_archive_card ON fsrs_cards_archive (card_id);
```

### Background Deck Synchronization & Verbatim Guardrail (`db/deck_sync.rs`)
When a book mounts, `sync_practice_deck` reads `vault/notes/<book-id>/practice-deck.md`:
- Parses Cloze items (`{{c1::target}}` and `==target==`), scrambled clauses, and scenario cards (`db/fsrs_parser.rs`).
- **Programmatic Verbatim Validation:** Cross-checks that every `answer_key` exists as an exact character substring in the chapter text (`vault/books/<book-id>/<chapter_file>`). Non-verbatim or speculative cards are rejected.
- **One Card per Question:** `card_identity` hashes (FNV-1a, 64 bit) the item type, the normalized question, and the normalized answer (a scenario answer without its option letter). The deck position, chapter file, and anchor are not part of the id, so a deck generated again keeps the progress of every unchanged question, and a changed question starts as a new card.
- **Upsert:** a stored card takes the deck's text, chapter, anchor, and payload and keeps its schedule. A new question starts as a new card, due now.
- **Archive, Never Delete:** a stored card whose question is no longer in the deck moves to `fsrs_cards_archive` with its progress, and it comes back with that progress when the question returns. A deck without any valid card changes nothing.
- **Older Rows:** rows with position-based ids from older builds get their question id on the next sync. When two rows hold the same question, the row with more reviews (then the later review) stays, the other row is archived as `duplicate`, and `review_logs` rows follow the question id.

### Tauri v2 IPC Interface (`apps/desktop/src-tauri/`)
All deck synchronization and review calculations are executed on background threads (`tokio::task::spawn_blocking`) without blocking the UI:

| Command | Signature | Description |
| :--- | :--- | :--- |
| `sync_practice_deck` | `(book_id: String) -> Result<usize, String>` | Scans `vault/notes/<book_id>/practice-deck.md`, verifies every card verbatim against its chapter Markdown, and syncs `fsrs_cards` with one card per question, archiving cards that left the deck. Returns the number of distinct questions. |
| `get_due_cards` | `(book_id: Option<String>, card_type: Option<String>, limit: Option<usize>, hybrid_ratio: Option<f32>) -> Result<Vec<PracticeCardItem>, String>` | Returns up to `limit` cards (default 50): due reviews first (`reps > 0 AND due <= now`, most overdue first), then new cards (`reps = 0`, in sync order) in the places that are left. A card rated Again is due 10 minutes later and then comes before all new cards. |
| `get_chapter_due_cards` | `(book_id: String, chapter_file: String, card_type: Option<String>, limit: Option<usize>, hybrid_ratio: Option<f32>) -> Result<Vec<PracticeCardItem>, String>` | Like `get_due_cards`, but only cards from one chapter file of one book. The Chapter Gatekeeper tests these cards before the reader leaves that chapter. The book id is required, because every book names its chapters `ch-01.md`, `ch-02.md`, ... |
| `submit_review` | `(card_id: String, rating: u8) -> Result<CardSchedule, String>` | Evaluates an FSRS-5 rating (1=Again, 2=Hard, 3=Good, 4=Easy), computes new stability, difficulty, state, and next interval, and commits to SQLite. One `IMMEDIATE` transaction reads the card, saves the new schedule, and adds a `review_logs` row with the book id of the card: both rows are saved or neither is, and the error is returned. A card without a book id is not reviewed. A second review of the same card (a double click) waits, then schedules from the first review. |
| `get_deck_stats` | `(book_id: Option<String>) -> Result<DeckStats, String>` | Aggregates deck volume, due count, learning vs. review ratios, and retention metrics. |

### Practice Suite & Gatekeeper UI Components
- **TopNav Practice Button:** Displays live due badge count. Opens distraction-free `PracticeModal.tsx` with Cloze and Scramble tabs.
- **Deterministic Cloze Drill:** Real-time character/word input validation, "Show Answer" reveal, 4-tier FSRS rating buttons with estimated next intervals, and a `Jump to §p-xxx` anchor navigation button that scrolls the reader canvas directly to the source sentence.
- **Scrambled Argument Drill:** Clickable badge pills allowing users to reassemble sentence clauses into proper sequence with deterministic verbatim order verification.
- **Reader Settings Popover (`SettingsPopover.tsx`):** Provides toggles for `gatekeeperMode` and a stepper for `dailyTarget` (5–100 cards), persisting to `ReaderPreferences` in `localStorage`. Includes a manual "Sync Deck" action with live due counts.
- **Chapter Gatekeeper Workflow (`GatekeeperModal.tsx`, `hooks/useChapterGate.ts`, `lib/chapterGate.ts`):** a soft gate.
  - When Gatekeeper Mode is on, every move to a later chapter of the open book asks the gate first. The table of contents, the inspectional blueprint and dips, search hits, notes, analytical citations, and practice cards all open chapters through `openChapter` in `useBookSession.ts`. Moving back, staying in the chapter, opening another book, and moves at the syntopical level (which compares books) open the chapter at once (`gatedChapterFile`).
  - The gate tests up to `gatekeeperQuota` due cards of the chapter the reader leaves (`get_chapter_due_cards`), with the card type of the practice mode. When that chapter has no due cards, the chapter opens at once.
  - The gate is passed only when every card is right: rated Good or Easy, and for a scenario card, answered with the right option (`gatePassed`). Otherwise the window shows how many answers were right, and the reader stays in the chapter or continues anyway. "Skip Gatekeeper for now" is the explicit override, and the close button keeps the reader in the chapter.
- **Session Walk (`lib/practiceSession.ts`):** `PracticeModal` walks a session copy of the due cards, and `GatekeeperModal` walks a copy of the first `gatekeeperQuota` due cards of the chapter it tests. The copy follows the loaded cards until the first rating, then stays fixed, because each rating removes the card from the `usePracticeDeck` due list. Closing either window resets its session.

---

## 5. Desktop Reader Core: As-Built Implementation (Phase 2)

### Tauri v2 IPC Interface (`apps/desktop/src-tauri/`)
All disk I/O operations are offloaded from the Tauri main thread using `tokio::task::spawn_blocking` to preserve unblocked UI responsiveness:

| Command | Signature | Description |
| :--- | :--- | :--- |
| `get_vault_status` | `() -> Result<VaultStatus, String>` | Where the vault folder is (`path`), how it was found (`foundBy`), or the message to show when there is none. `VaultGate.tsx` asks this before the app starts. |
| `choose_vault_folder` | `() -> Result<Option<VaultStatus>, String>` | Opens a folder picker and remembers the choice. `None` means the reader closed it without choosing; a folder with no `books` inside is refused with a message. |
| `get_library_books` | `() -> Result<Vec<BookMetadata>, AppError>` | Scans `vault/books/*/` for `_meta.json`, returning dynamic library manifest with `id`, `title`, `author`, `chapter_count`, and `total_words`. |
| `list_books` | `() -> Result<Vec<BookSummary>, String>` | Scans `vault/books/` and parses available `_meta.json` records. |
| `load_book_meta` | `(book_id: String) -> Result<String, String>` | Reads `vault/books/<book_id>/_meta.json` as JSON string. |
| `load_chapter` | `(book_id: String, chapter_file: String) -> Result<String, String>` | Reads chapter Markdown text (`ch-XX.md`) from the vault. |
| `load_notes` | `(book_id: String, notes_file: String) -> Result<String, String>` | Reads `vault/notes/<book_id>/<notes_file>` (auto-scaffolds starter template if missing). |
| `save_notes` | `(book_id: String, notes_file: String, content: String) -> Result<(), String>` | Persists user reflection notes to `vault/notes/<book_id>/<notes_file>`. |
| `get_chapter_highlights` | `(book_id: String, chapter_file: String) -> Result<Vec<HighlightItem>, String>` | Reads `vault/notes/<book_id>/<chapter>-highlights.json`. A chapter that still keeps its highlights in the old notes comment is moved over once, keeping the reader's own text. |
| `save_chapter_highlights` | `(book_id: String, chapter_file: String, highlights: Vec<HighlightItem>) -> Result<(), String>` | Writes `vault/notes/<book_id>/<chapter>-highlights.json`. It never touches the chapter notes, and a damaged highlights file stops the save. |

### Frontend Component Hierarchy (`apps/desktop/src/`)
The desktop client is structured around a single-chapter virtualized TipTap canvas:

```
App.tsx (Global state: theme, viewMode, activeBook, activeChapter)
├── BackendErrorBar.tsx (Error bar at the bottom of the window: every failed load or save, with a count and Dismiss)
├── Sidebar.tsx (Translucent collapsible TOC, active chapter indicator, word & anchor counts)
├── TopNav.tsx (Progress bar, chapter title, theme toggles, viewing mode switches)
└── [ Main Content Area ]
    ├── Reader.tsx (TipTap editor: mounts ONLY one chapter at a time)
    │   ├── SelectionMenu.tsx (Floating UI pill: [Highlight], [Note], [Copy Link])
    │   └── FootnotePopover.tsx (Floating UI citation popover on [^n] click/hover)
    └── NotesPane.tsx (Dual-Pane side-by-side reflection notes editor with 800ms auto-save; locked until the notes file loads, "Not saved" when a save fails, one pane per chapter, a save on the way out, and a quote saved at once)
```

**Supporting Utilities:**
- `src/lib/api.ts`: Tauri IPC wrappers. Every call goes through `callBackend` (`src/lib/api/clientBase.ts`): inside the app, a failed command rejects with the backend error, and an empty answer stays empty. Only a dev build in a browser (`npm run dev`) answers, from the stand-in in `src/lib/api/dev/`. The stand-in loads through a dynamic import behind `import.meta.env.DEV`, so a production build does not contain it.
- `src/lib/backendErrors.ts`: The error bar store. `reportBackendError` adds a failed load or save (the same action with the same error again only raises its count, and the newest 5 stay), and `errorText` turns a Tauri rejection value (a string or an `AppError` object) into text for `BackendErrorBar.tsx`.
- `src/lib/markdown.ts`: Pre-processes chapter Markdown into TipTap HTML, separating footnote definitions and injecting interactive anchors (`data-anchor="p-xxx"`, the attribute form of `^p-xxx`) and footnote markers (`data-fn="n"`).
- `src/lib/anchors.ts`: Converts paragraph anchors between the saved form (`^p-xxx`) and the HTML attribute form (`p-xxx`) with `toSavedAnchor` and `toAnchorAttribute`.
- `src/lib/readerLoads.ts`: Loads a book (`loadBookOnto`) or a chapter (`loadChapterOnto`) onto the reader. Every load takes a ticket from `createLoadGuard`, and only the newest ticket may show its answer, report its failure, or name the chapter a new highlight belongs to. The reader is emptied the moment a chapter opens.
- `src/lib/notesAutosave.ts`: The chapter notes autosave. `change` holds the text together with the notes file it was typed in and saves it when the typing stops; `flush` saves what is waiting right now, which the notes pane does when the chapter closes and for a quote.
- `src/lib/notesQuote.ts`: `addQuoteToNotes` puts a quote from the selection menu at the end of the chapter notes and saves them at once. `quoteBlock` is the text it adds: a blank line, the quote with its paragraph anchor, and an empty `- Reflection:` line.
- `src/lib/readerLocation.ts`: Resolves a location (book id, chapter file, anchor) to the book and chapter to show with `resolveLocation`, loading the location's own book when another book is open. Every book names its chapters `ch-01.md`, `ch-02.md`, ..., so a search hit keeps its `book_id` (`searchResultLocation`).
- `src/lib/chapterGate.ts`: Chapter Gatekeeper rules. `gatedChapterFile` gives the chapter a move must pass (only a move to a later chapter, at every level except syntopical), and `gatePassed` passes a gate run only when every card was rated Good or Easy and no scenario answer was wrong.
- `src/lib/readerShortcuts.ts`: Gives every reader keyboard shortcut one owner, so one key press runs its action once. `appShortcut` is the App window listener (Ctrl+K or Cmd+K search, Alt+P pacer, ? or F1 Field Guide), and `elementaryCanvasShortcut` is the elementary canvas listener (`[` and `]` pacer speed, elementary level only). Alt+P, ? and F1 do nothing in inputs, textareas, and editable elements.
- `src/lib/searchQuery.ts`: `isSearchable` tells the Omni-Search palette whether a typed search has at least `MIN_SEARCH_CHARACTERS` (2) characters. The backend (`src-tauri/src/db/search_query.rs`) uses the same minimum and finds nothing for a shorter search.
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
Strictly isolated within OS Application Data (`%APPDATA%\book-engine\app_cache\index.db` on Windows, `~/.config/book-engine/app_cache/index.db` on Linux, `~/Library/Application Support/book-engine/app_cache/index.db` on macOS). The database is ephemeral and completely decoupled from `vault/`. If deleted, it is recreated on next launch: the search index is built again from the vault Markdown files, and the study progress is put back from `vault/notes/<book-id>/reviews.jsonl` and `reading.jsonl`.

Unit tests never open this database or the real vault: in test builds, `get_db_path()` and `find_vault_root()` resolve only inside a per-test temporary sandbox (`apps/desktop/src-tauri/src/test_support.rs`) and return an error when no sandbox is active.

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
| `search_vault` | `(query: String) -> Result<Vec<SearchResult>, String>` | Queries `search_index` using BM25 ranking and SQLite `snippet()` syntax with `<mark>` tags. `db/search_query.rs` turns the typed search into a valid FTS5 expression, and a search shorter than 2 characters returns no results. Returns up to 40 matches. |

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

**Persistence:**
Highlights are saved as a JSON list in `vault/notes/<book-id>/<chapter>-highlights.json`, written only by `get_chapter_highlights` and `save_chapter_highlights` (`apps/desktop/src-tauri/src/vault/highlights.rs`). A chapter with no highlights has no file.
```json
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
```

Older chapters kept the same list inside a `<!-- highlights-json ... -->` comment in the notes Markdown. `load_chapter_highlights` moves such a chapter over the first time it is read and leaves the reader's own text in place.

The list is read from the `[` that opens it to the `]` that closes it, counting brackets but not those inside a quoted string, and never to the first `-->`. A saved quote may itself hold `-->`, and stopping there cut the list in half, so every highlight of that chapter read as none and the next save wrote only the new one (DS-06). The same scan finds where the comment really ends, so the clean-up removes all of it. A comment whose list still cannot be read, for example after a hand edit that deletes a comma, is left alone and gives an error: nothing is moved, nothing is removed.

**Fuzzy Hydration & TreeWalker Injection Algorithm (`applyHighlightsToHtml`):**
When a chapter HTML payload is prepared for mounting into TipTap:
1. `getChapterHighlights`: Reads the `HighlightItem[]` list of the chapter from its highlights file.
2. `Paragraph Resolution` (`findHighlightParagraph`): For each highlight, converts the saved anchor (`^p-xxx`) to the attribute form with `toAnchorAttribute` and uses the paragraph with `data-anchor="p-xxx"` when it still contains the quote. If the anchor is absent or its paragraph no longer contains the quote, falls back to the first candidate `<p>` element that contains it.
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
- **Search Syntax (`src-tauri/src/db/search_query.rs`):** A search needs at least 2 characters: for a shorter search the palette shows a hint and sends nothing (`isSearchable` in `src/lib/searchQuery.ts`). Every word and every quoted phrase goes to FTS5 as a string, so words with inner punctuation (`don't`, `well-known`, `U.S.`) match the book text, and a word with hyphens (`e-mail`) also finds its spelling without them (`email`). A word also matches longer words (`labo` finds `labour`) when its last part has at least 2 letters or digits, or when it ends in `*`; a word that ends in other punctuation (`C++`) or in a 1-letter part (the `t` of `don't`) matches only itself. `"quotes"` search an exact phrase. `AND`, `OR`, and `NOT` in capitals are operators (`war NOT peace`); lowercase `and`, `or`, and `not` are words. Words with no operator between them must all match, and a `NOT` with no word before it finds nothing.
- **Snippet `<mark>` Rendering:** SQLite FTS5 snippets with `<mark>` highlight tags are sanitized and rendered directly in the result item preview.
- **Cross-Book Anchor Navigation:** Search covers all books, and every book names its chapters `ch-01.md`, `ch-02.md`, ..., so each result shows its book title and keeps its `book_id`. Selecting a result calls `navigateToCrossBookCitation` with `searchResultLocation(result)`; `resolveLocation` (`src/lib/readerLocation.ts`) loads the result's own book when another book is open. The reader then switches the active chapter (maintaining single-chapter DOM virtualization), waits for DOM mounting, and smoothly scrolls to the target paragraph anchor (`^p-xxx`) with a brief amber flash (`bg-amber-100/50`).

### High-Resolution Figure Lightbox & Split-View Jump (`apps/desktop/src/components/FigureLightboxModal.tsx`)
- **Interactive Figure Cards:** ProseMirror editor intercepts diagram clicks on reader images and mounts an accessible full-screen Lightbox modal.
- **Pan & Zoom Controls:** Provides smooth zoom-in, zoom-out, 1:1 reset, and keyboard navigation (`+`, `-`, `0`, `Escape`).
- **Original Page Split-View Integration:** Readers can click **"View in Split View"** directly inside the Lightbox modal to switch the application to dual-pane mode, displaying the pristine publisher PDF page side-by-side with the Markdown text canvas.

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
- Saved data (chapter Markdown, notes, citations, practice cards) keeps the `^p-001` form. Code converts between the two forms only with `src/lib/anchors.ts`: text selection saves `toSavedAnchor(data-anchor)`, and highlight placement, anchor navigation, the pacer, the focus ruler, and gutter badges find paragraphs with `toAnchorAttribute`.
- Displayed via CSS pseudo-element (`.reader-prose p[data-anchor]::before`) as a subtle, muted `§` glyph in the left margin (`left: -1.75rem`) that smoothly reveals on paragraph hover without polluting text selection or clipboard payloads.

---

## 8. Study Analytics Dashboard & Aggregated Notes Drawer: As-Built Implementation (Phase 5)

### Unified Notes & Highlights Drawer (`apps/desktop/src/components/NotesDrawer.tsx`)
Aggregates all chapter notes and W3C highlights across the active book:
- **Strict Read-Only Vault Access:** Reads `vault/notes/<book-id>/ch-*-notes.md` without modifying any vault files during scanning or aggregation.
- **Chronological & Anchor Sorting:** Uses `notesAggregator.ts` to parse embedded W3C highlights JSON comments and markdown reflection notes, ordering entries chronologically by Chapter spine sequence and then by Paragraph Anchor (`^p-xxx`).
- **Interactive Paragraph Navigation:** Clicking any highlight or note snippet in the drawer invokes `onNavigateToAnchor`, seamlessly switching the active chapter (if necessary) and smoothly scrolling the reader canvas directly to that paragraph anchor.
- **Publication-Ready Summary Export:** The "Export Summary" button compiles all highlights and personal reflections across the entire book into a single clean, formatted Markdown file: `vault/notes/<book-id>/summary-export.md`.

### Retention & Reading Analytics Dashboard (`apps/desktop/src/components/AnalyticsModal.tsx`)
A study analytics modal accessible from `TopNav.tsx` or `SettingsPopover.tsx`:
- **FSRS Retention Heatmap:** Renders a 52-week GitHub-style annual activity grid visualizing card reviews submitted per day, with intensity tiers, cell hover tooltips, and study streak statistics (current streak, longest streak, total yearly reviews).
- **Retention Statistics Cards:**
  - **Cards Due Today:** Number of reviews scheduled for the current day.
  - **Mastered Cards:** Cards that have graduated to mature stability ($\ge 21$ days).
  - **FSRS Retention Rate Percentage:** Calculated using the canonical power-law retrievability formula $R(t, S) = (1 + 19/81 \cdot t/S)^{-0.5}$ over reviewed cards.
- **Reading Velocity & Time:**
  - Active reading timer tracks focused reading session seconds.
  - Calculates average words-per-minute (WPM) across completed chapters ($\ge 90\%$ read).
  - Detailed chapter-by-chapter breakdown table (words, time spent, velocity in WPM, completion status).

### Ephemeral SQLite Schema Extensions (`apps/desktop/src-tauri/src/db.rs`)
Stored strictly in OS AppData (`%APPDATA%\book-engine\app_cache\index.db`):
```sql
CREATE TABLE IF NOT EXISTS review_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    reviewed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_logs_date ON review_logs (reviewed_at);

CREATE TABLE IF NOT EXISTS reading_sessions (
    book_id TEXT NOT NULL,
    chapter_file TEXT NOT NULL,
    seconds_spent INTEGER NOT NULL DEFAULT 0,
    words_read INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, chapter_file)
);
```

### Tauri v2 IPC Interface Additions (`apps/desktop/src-tauri/`)

| Command | Signature | Description |
| :--- | :--- | :--- |
| `get_all_book_notes` | `(book_id: String) -> Result<Vec<AggregatedNoteItem>, String>` | Scans `vault/notes/<book-id>/ch-*-notes.md`, parses W3C highlights & Markdown reflection items, extracts `^p-xxx` anchors, and returns entries sorted in reading order. |
| `export_book_summary` | `(book_id: String) -> Result<String, String>` | Compiles all chapter notes, reflections, and quotes into a unified Markdown summary file: `vault/notes/<book-id>/summary-export.md`. |
| `get_study_analytics` | `(book_id: Option<String>) -> Result<StudyAnalytics, String>` | Returns complete analytics: daily review activity, card counts grouped by state (New, Learning, Review, Relearning), retention rate %, mastered cards, cards due today, and total vault words / estimated reading time. |
| `load_all_book_notes` | `(book_id: String) -> Result<Vec<ChapterNoteFile>, String>` | Scans `vault/notes/<book_id>/` in strictly read-only mode, returning all raw chapter notes files. |
| `export_summary` | `(book_id: String, content: String) -> Result<String, String>` | Writes arbitrary compiled executive summary string directly to `vault/notes/<book_id>/summary-export.md`. |
| `get_review_heatmap` | `(book_id: Option<String>) -> Result<Vec<DayReviewActivity>, String>` | Queries `review_logs` table in `index.db` to return daily card review counts for the heatmap. |
| `get_retention_metrics` | `(book_id: Option<String>) -> Result<RetentionMetrics, String>` | Computes due today, mastered cards, and FSRS power-law retrievability $R(t, S)$ retention %. |
| `get_reading_velocity` | `(book_id: Option<String>) -> Result<ReadingVelocityStats, String>` | Aggregates reading time, words read, completed chapters, and WPM across chapters. |
| `record_reading_progress`| `(book_id: String, chapter_file: String, seconds_spent: u64, words_read: usize, completed: bool) -> Result<(), String>` | Commits active reading session time and completion status to `index.db`. |

### Retention Rate Formula Standard
Retention rate is computed as:
$$\text{Retention Rate} = \frac{\text{Total Reviews} - \text{Again Count}}{\text{Total Reviews}} \times 100\%$$
with fallback to the aggregate FSRS power-law retrievability $R(t, S) = (1 + 19/81 \cdot t/S)^{-0.5}$ when no reviews have been recorded yet in `review_logs`.

---

## 9. Production Packaging & Standalone Release: As-Built Implementation (Phase 6)

### Application Branding & Native Icon Suite (`apps/desktop/src-tauri/icons/`)
- **Monogram Motif:** Master SVG vector (`source-icon.svg`) featuring an editorial open-book monogram with warm golden-amber pages (`#f59e0b`, `#d97706`), dual-leaf spine crease, silk ribbon bookmark, and subtle dark slate squircle tile (`#18181b`).
- **Multi-Resolution Native Assets:**
  - `icon.ico`: Multi-layer Windows taskbar and titlebar icon (16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256).
  - `32x32.png`: Compact system tray and header icon.
  - `128x128.png` & `128x128@2x.png`: High-DPI application launcher icons.
  - `icon.png`: 512x512 master application branding asset.

### Production Bundle Configuration (`apps/desktop/src-tauri/tauri.conf.json`)
- **Product Identity:** `productName: "Book Engine"`, bundle identifier `com.bookengine.reader`.
- **Window Constraints:** Minimum width enforced at `900px`, minimum height at `600px`, default dimensions `1280x860px` with native window titlebar decorations.
- **Bundle Target:** Configured for Windows NSIS setup package generation:
  ```json
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
  ```
  `installMode: "currentUser"` eliminates elevation prompts and installs cleanly into the user's profile directory.

### Production Build Outputs & Release Artifacts
Compiled via `npm run tauri build`:
- **Portable Standalone Executable:**
  - Path: `apps/desktop/src-tauri/target/release/book-engine-desktop.exe`
  - Size: ~13.8 MB
  - Self-contained binary with embedded WebView2 bindings and optimized SQLite FTS5 engine.
- **Windows NSIS Installer Package:**
  - Path: `apps/desktop/src-tauri/target/release/bundle/nsis/Book Engine_0.1.0_x64-setup.exe`
  - Size: ~3.5 MB
  - Setup installer with desktop shortcut generation, start menu entry, and clean uninstaller.

---

## 10. Scenario-Based Analytical Drills & FSRS Integration (Phase 3 Track 3D)

### Architectural Overview
Extends the spaced repetition subsystem beyond lexical cloze recall to test Adlerian Level 3 deductive analytical comprehension (propositions, syllogisms, and validity of inferences).

```
vault/notes/<book-id>/practice-deck.md
  │
  ├── Cloze Cards (### card-xxx) ──────┐
  └── Scenario Cards (### Scenario: sc-xxx)
                                       │
                         [fsrs_parser.rs]
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
      Verbatim Cloze Substring                Verbatim Rationale Quote Match
      Validation against Chapter              against Cited Paragraph Anchor
                  │                                         │
                  └────────────────────┬────────────────────┘
                                       ▼
                       SQLite UPSERT (fsrs_cards)
                        card_type + JSON payload
                                       │
                         Unified FSRS-5 Scheduler
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
            ClozeDrill.tsx                        ScenarioCardView.tsx
          (Extractive Cloze)                  (Anti-bias Option Shuffling,
                                               Evaluation & Rationale Reveal)
```

### Invariants & Technical Specifications
1. **Markdown Format (`practice-deck.md`):**
   ```markdown
   ### Scenario: sc-sample-001
   <!-- citation: ch-01.md#^p-003 -->
   **Scenario:** Description of problem or synthetic premise.
   - [ ] (A) Plausible distractor.
   - [x] (B) Valid deductive conclusion.
   - [ ] (C) Alternative distractor.
   - [ ] (D) Plausible distractor.
   > **Rationale:** Verbatim quote from cited anchor explaining deductive link. (ch-01.md#^p-003)
   ```
2. **SQLite Schema & Migration (`db/schema.rs`):**
   - Idempotently adds `card_type TEXT DEFAULT 'cloze'` and `payload TEXT DEFAULT NULL` via `PRAGMA table_info(fsrs_cards)`, and creates `fsrs_cards_archive`.
   - `sync_practice_deck_blocking` (`db/deck_sync.rs`) stores each card under its question id (`card_identity`) and uses `INSERT ... ON CONFLICT(card_id) DO UPDATE SET ...` to preserve the review state, reps, and stability of unchanged questions. Cards that left the deck move to `fsrs_cards_archive` with their progress.
3. **Anti-Bias Shuffling (`ScenarioCardView.tsx`):**
   - Randomizes option presentation order on mount via Fisher-Yates shuffle while retaining immutable option keys (`A`, `B`, `C`, `D`) for deterministic evaluation.
   - Gates FSRS rating bar until user submits an answer; pre-suggests `Again` (rating 1) on incorrect evaluations.
4. **Audit Grounding (`audit-practice.py`):**
   - Verifies citation anchor exists in chapter text.
   - Verifies `> **Rationale:**` contains a verbatim quote matching the cited paragraph text.
   - Format validation: exactly 1 `[x]` and at least 2 `[ ]`.
5. **Autonomous Ingestion Generation (`ingest/scenarios.py`):**
   - Autonomous extraction during EPUB and PDF intake via `generate_chapter_scenario_cards(chapter_markdown, chapter_id, max_items=3)`.
   - Selects top-scoring proposition sentences from paragraphs as target correct conclusions.
   - Harvests plausible in-domain distractor propositions from non-target paragraphs across the chapter.
   - Zero-hallucination guarantee: every option (`A`, `B`, `C`, `D`) and the rationale quote are 100% extractive, exact character substrings from the source chapter.
   - Integrated into `pipeline.py` and `pdf_parser.py`, and formatted side-by-side with Cloze cards in `vault/notes/<book-id>/practice-deck.md`.
6. **Practice Modality Filtering & Dynamic Retrieval (`due_cards.rs`, `usePracticeDeck.ts`):**
   - Reader settings allow toggling between `verbatim` (Cloze/Scramble recall), `mcq_scenario` (Analytical Scenario MCQs), and `hybrid` (Balanced dual-modality).
   - In `mcq_scenario` mode, SQLite filters `AND card_type = 'scenario'`.
   - In `verbatim` mode, SQLite filters `AND card_type != 'scenario'`.
   - In `hybrid` mode, `hybrid_ratio` (default `0.5`, with selectable UI presets `50:50 Balanced`, `70:30 Recall`, `30:70 MCQ`) sets the cloze/scenario mix inside each queue: due reviews first, then new cards. When one type runs short, the other type fills its places, the two types are interleaved, and the result never exceeds the limit.
   - Respects user's configured `dailyTargetCards` setting (5–100) instead of hardcoding `LIMIT 50`.
7. **Chapter Gatekeeper Dual-Modality Support (`GatekeeperCardDrill.tsx`):**
   - Renders inline cloze input for verbatim items, and scenario stem with clickable A/B/C/D choices for scenario items.
   - Evaluates scenario choices with instant correctness feedback and extractive grounding quote reveal before rating. A wrong choice keeps the gate from passing, whatever the rating (`lib/chapterGate.ts`).
   - Respects user's configured `gatekeeperQuota` setting (1–10) rather than hardcoded 3 cards.
8. **TopNav & Settings Badge Synchrony:**
   - Practice badge count in TopNav and the "Sync Deck" action in Practice settings dynamically reflect the due card count for the currently active study modality.

---

## 11. Level 4 Syntopical Reading: Syntopicon Registry & Cross-Book Issue Matrix (Phase 4 Track 4A)

### Architectural Overview
Mortimer Adler's Level 4 Syntopical Reading investigates an ultimate subject spanning multiple distinct books simultaneously. The Syntopicon provides:
1. **Rule 2 ("Bringing the Authors to Terms"):** A neutral semantic bridge mapping idiosyncratic author phrasing and vocabulary back to common synthesized terms.
2. **Rule 3 ("Framing the Questions"):** Universal, non-author-specific questions ordered logically.
3. **Rule 4 ("Defining the Issues"):** Multi-author controversy matrix capturing opposing stances, nuances, and cross-book paragraph citations.

```
vault/syntopicon/topics/<topic-id>.json
  │
  ├── Neutral Terms (Rule 2) ──────────────────────────┐
  │     ├── term: "Granular Specialization"             │
  │     └── mappings:                                  │
  │           ├── [wealth-of-nations] "Division of Labour"  ──> ch-04.md#^p-001
  │           └── [sample] "Decoupled Invariants"           ──> ch-01.md#^p-001
  │                                                     │
  ├── Questions (Rule 3) ──────────────────────────────┤
  │     └── "How does decomposition alter resilience?" │
  │                                                     │
  └── Controversies (Rule 4) ──────────────────────────┘
        ├── questionId: "q-partition-coordination"
        ├── title: "Productive Opulence vs Partition Trade-offs"
        └── perspectives:
              ├── [wealth-of-nations] Stance & Quote ──> ch-04.md#^p-001
              └── [sample] Stance & Quote            ──> ch-01.md#^p-003
```

### Invariants & Technical Specifications
1. **Cross-Vault Non-Destructive Storage:**
   - All topics are persisted purely to `vault/syntopicon/topics/<topic-id>.json`.
   - Never mutates book source Markdown or single-book analytical notes.
   - Rust backend auto-scaffolds `vault/syntopicon/topics/` on startup.
2. **Multi-Book Invariant:**
   - Every topic must link citations spanning $\ge 2$ distinct valid books in `vault/books/`. Vector 10 asserts this.
3. **Cascading Referential Integrity:**
   - Every `questionId` in controversies strictly resolves to an existing framed question within the topic.
   - Deleting a question cascade-prunes any controversies addressing that question.
4. **Cross-Book Dynamic Navigation:**
   - Clicking a cross-book citation (`bookId#chapterFile#anchor`) dynamically re-hydrates the active book, loads the target chapter, and smoothly scrolls to the target anchor.
   - Gatekeeper challenge is automatically bypassed in Level 4 comparative mode.
5. **Vector 10 Diagnostic Audit:**
   - Cryptographically verifies all topic files, JSON schema validity, multi-book citations, chapter anchor presence, and question-controversy parity.

---

## 12. Level 4 Syntopical Reading: Dialectical Synthesis & Dossier Compiler (Phase 4 Track 4B)

### Architectural Overview
Syntopical reading culminates in Mortimer Adler's Syntopical Rule 5 ("Analyzing the Discussion"). While Rules 2–4 catalog the landscape of definitions, framed questions, and controversial stances, Rule 5 analyzes the debate with dialectical detachment:
1. **Ordering the Discussion:** Clarifying the major cleavages of opinion and fundamental presuppositions that lead authors to opposing positions.
2. **Dialectical Resolution:** Distilling the central truth of the inquiry objectively, acknowledging which aspects are settled and which remain unresolved.
3. **Dossier Compilation:** Generating publication-grade Markdown reports with frontmatter metadata and formatted citation links ready for external review and archival.

```
SyntopiconPane (SynthesisTab.tsx)
  │
  ├── 800ms Debounced Auto-Save ("Saved" / "Saving..." / "Not saved")
  │     └── vault/syntopicon/topics/<topic-id>.json
  │           (synthesisNotes & dialecticalResolution)
  │
  └── [Export Dialectical Dossier]
        │
        ├── Save-Before-Export Invariant: Flushes in-memory notes to disk
        ▼
  Tauri IPC: export_syntopic_report(topicId)
        │
        ▼
  syntopicon_compiler::compile_dialectical_dossier
        │
        ▼
  vault/syntopicon/reports/<topic-id>-synthesis.md
        │
        ├── Frontmatter (topic_id, title, generated_at, books_involved, metrics)
        ├── Section 1: Neutral Terminology Translation Bridge (Rule 2)
        ├── Section 2: Syntopical Issues & Dialectical Clash (Rules 3 & 4)
        ├── Section 3: Dialectical Discussion: Ordering of the Debate (Rule 5)
        └── Section 4: Dialectical Resolution: Distillation of Truth (Rule 5)
```

### Invariants & Technical Specifications
1. **Adlerian Dialectical Detachment (Rule 5):**
   - The synthesis editor requires readers to differentiate between the *ordering of the discussion* (competing assumptions) and the *dialectical resolution* (objective truth distillation).
2. **Save-Before-Export Invariant:**
   - `useSyntopiconSession::exportReport()` flushes current in-memory edits to `vault/syntopicon/topics/<topic-id>.json` before executing the backend compiler IPC, ensuring disk parity between JSON topic data and exported Markdown.
3. **Publication-Grade Markdown Dossiers:**
   - Generated under `vault/syntopicon/reports/<topic-id>-synthesis.md`.
   - Includes standard frontmatter metadata, quotes with book and anchor citations (`— [book:ch.md#^p-xxx](...)`), and formatted dialectical commentary.
4. **Vector 10 Parity Extension:**
   - Diagnostic Vector 10 in `.agent/skills/audit-system.py` validates all exported reports under `vault/syntopicon/reports/`.
   - Confirms that every dossier references an existing topic and that all Markdown anchor links (`^p-xxx`) resolve to verbatim chapter text in `vault/books/`.

---

## 13. Ingestion Engine Polish & TopNav Layout Remediation

### Generic Diagram Text Masking & Vector Figure Extraction
1. **In-Memory Text-Only Redaction:**
   - Vector drawings, diagram bounds, and discrete image bounding boxes unioned with adjacent captions are masked using PyMuPDF redaction: `page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)`.
   - This ensures internal diagram labels and `<!-- Start of picture text -->` blocks never leak into body Markdown while preserving underlying raster artwork.
2. **Vector Diagram Rasterization:**
   - Composite vector diagrams (such as comparison matrices and concept quadrants) are bounded with 18pt padding clamped to `page.rect` and rendered to 200 DPI PNG assets (`assets/fig-XX-Y.png`).
   - Leaked table fragments, standalone duplicate captions, or body paragraph references are cleanly replaced with Markdown image tags.
3. **Universal Caption Deduplication:**
   - Idempotent regex pass in `pdf_sanitizer.py` suppresses duplicate standalone caption paragraphs appearing immediately adjacent to figures whose artwork already includes the title.

### TopNav Layout & Flex Hierarchy
1. **Anti-Starvation Hierarchy:**
   - The central chapter title container is assigned `min-w-[200px] flex-1 max-w-md lg:max-w-xl` with `truncate` applied to the inner title span.
   - Neighboring utility buttons in the right cluster use `shrink-0`, preventing flexbox starvation from collapsing chapter titles to `Chapter 1. M...` on standard desktop resolutions.

---

## 14. Level 1 Elementary Reading: Pacer Velocity & Focus Ruler Mechanics

### Focus Ruler Contrast & Active Spotlighting
1. **Deeper Contrast Range & Presets:**
   - Dimming percentage expands from $20\%$ up to $98\%$ with an opacity floor of $0.02$ ($\text{opacity} = \max(0.02, \frac{100 - \text{dimmingPercent}}{100})$).
   - Four instant presets: `Soft (45%)`, `Balanced (70%)`, `High (88%)`, and `Deep Focus (96%)`, accompanied by a fine-tuning stepper ($\pm 2\%$).
2. **Active Paragraph Spotlighting:**
   - When enabled, the focused paragraph receives a $3\text{px}$ solid amber left margin rail (`border-left: 3px solid var(--theme-accent)`), subtle ambient background tint (`rgba(245, 158, 11, 0.035)`), and smooth $220\text{ms}$ transitions.
3. **Pacer Priority Focus Lock:**
   - When the Pacer is actively running, the Focus Ruler locks onto the pacer's active paragraph and ignores mouse hover jitter, ensuring uninterrupted reading flow.

### Geometry-Aware Chunk Underline Pacer (`Range.getClientRects()`)
1. **Line Deconstruction & Baseline Guide:**
   - Using browser DOM `Range.getClientRects()`, the active paragraph is decomposed into rendered line boxes.
   - A subtle baseline guide illuminates the active reading line.
2. **Discrete Line-by-Line Clock & Saccadic Return-Sweep (`useLinePacer.ts`):**
   - Each rendered line operates on an isolated, discrete line-clock ($t_{\text{line}} = 0$) rather than a rushed paragraph-wide timer.
   - **Instantaneous Vertical Drop:** Moving from line $k$ to line $k+1$ drops coordinates in $0\text{ms}$ with zero lagging CSS position transitions, eliminating diagonal sliding across the screen.
   - **Saccadic Pause ($60\text{ms}$):** Progress remains locked at $0.0$ at the start of every new line for $60\text{ms}$, allowing the reader's eye to complete the natural return sweep without skipping the first word.
   - **Individual Line Velocity:** Line duration is determined strictly by its proportional word count and target WPM ($T_{\text{line}} = \max(350, \frac{\text{words}_{\text{line}}}{\text{wpm}} \times 60000 + 60\text{ms})$).
3. **Fixation Chunk Underline:**
   - Word tokens are grouped into fixation jumps ($1$, $2$, or $3$ words per chunk).
   - High-visibility glowing amber underline bar and translucent word highlight glide across the line at the exact configured line WPM speed.
   - Automatically wraps across lines and triggers paragraph advancement upon completing the final line.
4. **Tactile Drag Scrubbing & Direct Seek (`usePacerDrag.ts`):**
   - **Pointer Dragging:** Grab either the amber bar or the rounded tactile grip pill (`pacerShowGripHandle`, default true) with `cursor-grab`/`cursor-grabbing` and pointer capture.
   - **Intra-Line Scrub:** Horizontal cursor movement maps directly to progress along the line.
   - **Vertical Line Snapping:** Vertical cursor movement resolves to the nearest line box.
   - **Click-to-Scrub Baseline:** Clicking along the active line baseline guide immediately relocates the highlight (`pacerClickToScrub`, default true).
   - **Configurable Arrow Stepping:** Optional keyboard navigation with `ArrowUp`/`ArrowDown` for lines and `ArrowLeft`/`ArrowRight` for words (`pacerKeyboardScrubbing`, default false).
   - **Smooth Resumption:** On pointer release, the line timer synchronizes with the drop progress and resumes gliding seamlessly.

### Unified Pacer Launch & State Coordination
1. **TopNav Persistent Launch Bar (`ElementaryPacingControls.tsx`):**
   - Renders a high-visibility **Play Pacer** / **Pause** button directly within the header controls when in Level 1 Elementary mode or when pacing is actively running.
   - Dynamic visual feedback: amber pulse indicator (`animate-pulse`), `Play` vs `Pause` Lucide icons, and tooltip with shortcut reminder.
2. **Settings Card Action Button (`PacerControls.tsx`):**
   - Dedicated full-width **Start Pacer (Alt + P)** / **Pause Pacer** button inside the Reader Settings Elementary tab.
   - Allows immediate test-driving of WPM, mode, and chunk-size adjustments without leaving the configuration card.
3. **Universal Keyboard Shortcut (`Alt + P`):**
   - Registered once, by the App window listener (`App.tsx`); ignores keystrokes originating inside editable inputs and textareas. `src/lib/readerShortcuts.ts` gives every shortcut one listener, so one press toggles the pacer once. The elementary canvas listener (`useElementaryMechanics.ts`) handles only `[` and `]`.
   - Instantly toggles pacing state from any viewport context.
4. **Automatic Reading Level Promotion:**
   - Triggering the pacer while viewing Inspectional, Analytical, or Syntopical modes automatically transitions `activeLevel` to `"elementary"` so the visual pacer and canvas mechanics engage instantly.
5. **Lifted Single-Source State (`App.tsx`):**
   - Root application controller maintains `isPacingRunning` and `handleTogglePacer`, synchronizing `TopNav`, `SettingsPopover`, and `Reader` -> `ElementaryCanvas` -> `useElementaryMechanics`.

---

## 15. Master Dynamic Health Audit Architecture (12 Verification Vectors)

The system health orchestrator in `.agent/skills/audit-system.py` dynamically validates workspace health across 12 distinct vectors before any phase is declared complete:

1. **Vector 1 (Dynamic Ledger & Vault Parity):** Verifies all books in `vault/books/` and binaries in `inbox/processed/` are cataloged in `vault/_ledger.json` with matching SHA-256 digests.
2. **Vector 2 (Anchor & Asset Integrity):** Validates persistent paragraph anchors (`^p-NNN`), unreferenced asset cleanup, and image markdown reference existence.
3. **Vector 3 (Zero-Hallucination & Dual-Modality Guardrail):** Confirms that every answer key, distractor, and rationale quote is an exact character substring in the cited chapter; enforces that library practice items feature both Cloze recall and deductive Scenario MCQ cards.
4. **Vector 4 (Backend Safety):** `cargo check` and `cargo test` in `apps/desktop/src-tauri` with zero errors and zero failing unit tests. Unit tests run inside a temporary sandbox vault and database (`src/test_support.rs`), never the real ones.
5. **Vector 5 (Frontend Safety):** TypeScript strict typecheck in `apps/desktop` with zero errors.
6. **Vector 6 (FTS5 Search Latency Benchmark):** SQLite FTS5 query latency average strictly $< 15.0\text{ms}$.
7. **Vector 7 (Desktop Runtime Launch Smoke Test):** Launches compiled native release binary headlessly and confirms window stability for 5.0 seconds.
8. **Vector 8 (Inspectional Parity - Level 2):** Audits `_meta.json` structural blueprints, pivotal chapters, non-overlapping head/tail dip sampling pairs, preview snippet hygiene, and Adlerian exit assessments.
9. **Vector 9 (Analytical Parity - Level 3):** Audits `vault/notes/*/analytical.json` for verified specialized terms, argument premise-to-conclusion graphs, Stage III evaluative critiques (Adler Rules 9–12), and author inquiry solutions.
10. **Vector 10 (Syntopical Parity - Level 4):** Audits `vault/syntopicon/` neutral terminology translations, universal questions, cross-book author perspectives, and multi-book citation anchor grounding.
11. **Vector 11 (Elementary Parity - Level 1):** Audits `_meta.json` readability metrics (`flesch_kincaid_grade`, `avg_sentence_length_words`, `estimated_reading_minutes`) within physiological bounds and confirms chapter-to-spine word count consistency.
12. **Vector 12 (Modularity & Vault Ephemeral Isolation):** Enforces Directive 1.1 (confirms zero SQLite databases or ephemeral caches leaked inside `vault/`) and Directive 4 (verifies that all source files in `apps/desktop/src/` and `packages/ingestion/ingest/` adhere to the $\le 300$-line modular ceiling).



