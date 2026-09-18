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
    ├── practice-deck.md      <-- Pre-generated study items
    ├── inspectional.json     <-- Your exit assessment (an import never writes it)
    └── bookmark.json         <-- Where you stopped reading: chapter & paragraph
  preferences.json            <-- Reader settings: theme, pacer speed, Gatekeeper, daily target
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
│       ├── audit-anchors.py         # Verifies paragraph anchor & footnote definition integrity; an import runs the same check before a book goes into the vault (IN-05)
│       ├── audit-practice.py        # Audits zero-hallucination verbatim extractive study cards; every quiz option is chapter text and the right one comes right after the passage (LE-06); every cloze answer is a term that is text of the chapter, and its prompt shows the exact source with no marks and no second answer (LE-07)
│       ├── audit-system.py          # Universal dynamic health orchestrator (12 vectors: Ledger, Anchors, Cards, Rust, TS, FTS5, GUI smoke test, Inspectional, Analytical, Syntopical, Elementary, Modularity & Isolation)
│       ├── benchmark-fts.py         # Benchmarks SQLite FTS5 query latency (<15ms target)
│       ├── process-inbox.py         # Automated fail-safe batch book intake pipeline & ledger manager; a book the vault already has stops unless --force; a file whose book id a book from another file has stops even with --force, and --book-id gives it its own id (IN-03); a book that fails the anchor and footnote check is `Failed`, stays out of the vault, and its file stays where it is (IN-05)
│       └── test-index-rebuild.py    # Verifies self-healing FTS5 index reconstruction from vault
├── AGENTS.md                    # Canonical agent directives, operational guardrails & technology standards
├── CLAUDE.md                    # Claude agent pointer referencing canonical AGENTS.md
├── GEMINI.md                    # Gemini agent pointer referencing canonical AGENTS.md
├── apps/
│   └── desktop/                 # Tauri v2 native desktop application & React frontend
│       ├── src/                 # React 18+ client application
│       │   ├── components/      # UI components (Reader, Sidebar, TopNav, Modals, Popovers)
│       │   │   ├── analytics/       # Modular analytics subcomponents
│       │   │   │   ├── HeatmapGrid.tsx      # GitHub-style annual FSRS study activity heatmap: rows from Monday to Sunday, days of your time zone (AN-02)
│       │   │   │   └── VelocityTable.tsx    # Chapter reading time & completion table (no word count or WPM, AN-01; chapter & book titles, AN-03)
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
│       │   │   │   ├── ScenarioCardView.tsx # Quiz card drill: which sentence comes right after the passage, with shuffled options (LE-06)
│       │   │   │   └── ScrambleDrill.tsx    # Drag/click scrambled clause reconstruction drill
│       │   │   ├── reader/          # Modular TipTap custom extensions & reader hooks
│       │   │   │   ├── ReaderHighlights.ts  # Draws the saved highlights over the chapter text, so they show over marks, blocks & Bionic reading (RD-02)
│       │   │   │   ├── TableExtensions.ts   # Table, row, header cell & cell nodes; a cell keeps the alignment of its column (RD-03)
│       │   │   │   ├── TipTapExtensions.ts  # BlockAnchors on every anchored block, the superscript mark & the FootnoteRef node
│       │   │   │   ├── readerEditorOptions.ts # The options the reader gives TipTap, built once so a render sets none again (RD-06)
│       │   │   │   ├── readerExtensions.ts  # The reader's nodes & marks: every chapter document is made of these (RD-03)
│       │   │   │   └── useReaderSelection.ts # Text selection, highlights from the words of the chapter document, anchor detection & lexicon de-confliction
│       │   │   ├── settings/        # Modular reader settings tabs
│       │   │   │   ├── ElementaryTab.tsx       # Level 1 Elementary Reading shell & settings tab
│       │   │   │   ├── FocusRulerControls.tsx  # Focus ruler contrast presets, fine stepper & spotlight toggle
│       │   │   │   ├── GeneralTab.tsx          # Reading palette, font family, font size & line height
│       │   │   │   ├── InspectionalTab.tsx     # Skim timer, exit card, sampling depth & single-key paging
│       │   │   │   ├── PacerControls.tsx       # Pacer velocity, line sweep vs chunk underline, focus lock & direct launch button
│       │   │   │   └── PracticeTab.tsx         # Chapter Gatekeeper, recall quota, daily target & deck sync
│       │   │   ├── sidebar/         # Modular sidebar subcomponents
│       │   │   │   └── TOCItemRow.tsx       # Hierarchical TOC tree item row; an entry opens its chapter file & paragraph, and an entry that no chapter holds is dimmed (CQ-01)
│       │   │   ├── syntopicon/      # Modular Level 4 Syntopical Reading & Syntopicon components
│       │   │   │   ├── ControversyModal.tsx # Rule 4 multi-author controversy and issue definition modal
│       │   │   │   ├── IssueMatrixTab.tsx   # Rules 3 & 4 framed question feed & controversy matrix tab
│       │   │   │   ├── NeutralTermModal.tsx # Rule 2 neutral semantic bridge & author term mapping modal
│       │   │   │   ├── SynthesisTab.tsx     # Rule 5 dialectical synthesis editor & Markdown dossier compiler tab
│       │   │   │   ├── SyntopiconPane.tsx   # Level IV Syntopicon registry, topic manager & tab shell
│       │   │   │   └── SyntopicTermsTab.tsx # Rule 2 neutral terminology directory & citation mapper tab
│       │   │   ├── AnalyticsModal.tsx   # FSRS retention heatmap & reading time dashboard modal
│       │   │   ├── AppModals.tsx        # Modular modal dialog coordinator & container
│       │   │   ├── BackendErrorBar.tsx  # Error bar: every failed backend load or save, with a count and Dismiss
│       │   │   ├── BookSelector.tsx     # Dynamic vault library switcher popover; "Rescan library" finds books imported while the app is open
│       │   │   ├── FigureLightboxModal.tsx # High-resolution diagram pan/zoom lightbox with split page link
│       │   │   ├── FootnotePopover.tsx  # Floating UI citation preview popover
│       │   │   ├── GatekeeperModal.tsx  # Chapter Gatekeeper dynamic-quota recall challenge modal
│       │   │   ├── LevelCompanionPane.tsx # Modular Level III & IV companion pane coordinator
│       │   │   ├── LevelGuideModal.tsx  # Contextual HUD, level cheatsheets & keyboard shortcuts modal
│       │   │   ├── NotesDrawer.tsx      # Unified slide-over notes & W3C highlights drawer with summary export
│       │   │   ├── NotesPane.tsx        # Dual-pane Markdown reflection notes editor (locked until the notes file loads; one pane per chapter)
│       │   │   ├── OmniSearchModal.tsx  # Ctrl+K global full-text search palette; each result shows as text with its hits marked (SEC-01)
│       │   │   ├── PracticeModal.tsx    # Extractive practice suite (Cloze, Scenario MCQ & Scramble drills)
│       │   │   ├── PreferencesGate.tsx  # Holds the app back until the reader settings are read from vault/preferences.json
│       │   │   ├── Reader.tsx           # Virtualized TipTap chapter canvas with margin anchors; saves where you stopped once the scrolling stops; a chapter opens at its top; drawn again only for its own new props (RD-06)
│       │   │   ├── SelectionMenu.tsx    # Floating UI selection toolbar (Highlight, Note, Link)
│       │   │   ├── SettingsPopover.tsx  # Reader preferences & Gatekeeper settings popover
│       │   │   ├── Sidebar.tsx          # Hierarchical TOC & linear chapter navigation drawer; a book whose contents open no chapter file shows its chapter list (CQ-01)
│       │   │   └── TopNav.tsx           # Top navigation chrome, progress bar, view modes & themes
│       │   ├── hooks/           # Modular application custom hooks
│       │   │   ├── useAnalyticalModals.ts    # Level 3 modal open/close & staged target coordinator
│       │   │   ├── useAnalyticalSession.ts   # Analytical reading store, cascading integrity & persistence hook
│       │   │   ├── useBookSession.ts         # Book loading, reading progress, session timing & chapter jumping (every in-book chapter change goes through openChapter; only the newest load lands; a book opens where the reader stopped); "Rescan library" reads the library again and updates search; search is updated when the app opens; reading time counts on one timer that a scroll never starts again
│       │   │   ├── useChapterGate.ts         # Chapter Gatekeeper (soft gate): tests the due cards of the chapter the reader leaves
│       │   │   ├── useInspectionalSession.ts # Inspectional countdown timer, sub-view, exit prompt & the exit assessment of the open book
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
│       │   │   │   │   ├── fallbackReaderState.ts # Reader settings, bookmarks & exit assessments in browser storage
│       │   │   │   │   ├── fallbackSyntopicon.ts # Sample syntopicon topic & localStorage topic registry; refuses a taken topic file, as the backend does
│       │   │   │   │   └── mockData.ts          # Default mock book catalogs & sample chapters
│       │   │   │   ├── analyticalApi.ts     # Analytical reading store load/save IPC
│       │   │   │   ├── analyticsApi.ts      # Study analytics & reading time IPC client
│       │   │   │   ├── bookmarkApi.ts       # Where you stopped reading IPC: `bookmark.json` per book, and the newest bookmark of all books
│       │   │   │   ├── clientBase.ts        # Tauri detection & callBackend: inside the app a failed command rejects
│       │   │   │   ├── highlightsApi.ts     # Chapter highlights IPC: the only writer of `<chapter>-highlights.json`
│       │   │   │   ├── lexiconApi.ts        # Sanitized offline dictionary lookup & vocabulary vault persistence IPC
│       │   │   │   ├── notesApi.ts          # Cross-chapter note aggregation & summary export IPC
│       │   │   │   ├── practiceApi.ts       # FSRS practice card synchronization & review IPC
│       │   │   │   ├── preferencesApi.ts    # Reader settings IPC: `vault/preferences.json`
│       │   │   │   └── syntopiconApi.ts     # Level 4 Syntopicon topic registry & persistence IPC client
│       │   │   ├── types/           # Modular contract definitions
│       │   │   │   ├── analytical.ts        # Level 3 analytical terms, citations & argument graph interfaces
│       │   │   │   └── syntopicon.ts        # Level 4 syntopical neutral terms, questions & controversy models
│       │   │   ├── analyticsText.ts     # Analytics numbers as text: a dash for a number the app does not have, so a real 0 shows as 0
│       │   │   ├── analyticsText.test.ts # Analytics text tests: 0% shows as 0%, no retention rate shows a dash, finished chapters over the real total
│       │   │   ├── anchors.ts           # Paragraph anchor forms: saved ^p-xxx vs. HTML data-anchor p-xxx
│       │   │   ├── api.ts               # Unified API client facade: a failed backend call reaches the caller
│       │   │   ├── apiFailures.test.ts  # API tests: inside the app, every failed backend call rejects; empty answers stay empty
│       │   │   ├── backendErrors.ts     # Error bar store: failed loads and saves, repeats counted, newest 5 kept
│       │   │   ├── backendErrors.test.ts # Error bar tests: a repeated failure raises its count; Tauri rejection values become text
│       │   │   ├── bionic.ts            # Bionic reading on a chapter document: the first letters of each word bold, not in code or superscripts
│       │   │   ├── bionic.test.ts       # Bionic tests: lists, tables and quotes get fixations; code, superscripts & footnote markers stay
│       │   │   ├── chapterGate.ts       # Pure Chapter Gatekeeper rules: which chapter moves are gated, which gate runs pass
│       │   │   ├── chapterGate.test.ts  # Gate tests: later chapters only, every level but syntopical, wrong answers never pass
│       │   │   ├── citations.ts        # Where a passage is: the anchor to cite for a place in a chapter document, how a citation shows its place & the vocabulary entry of a word (RD-04)
│       │   │   ├── citations.test.ts   # Citation tests: a heading cites the text under it, every block cites its own anchor, a chapter with no anchor cites none, and no saving file writes ^p-001
│       │   │   ├── elementaryPacer.ts      # Pure pacer timing, chunking, and contrast opacity functions
│       │   │   ├── elementaryPacer.test.ts # Unit tests for pacer timing, chunking, and contrast math
│       │   │   ├── exitAssessment.ts    # The exit assessment of the open book: read from the reader's notes, shown at once when saved, never saved over one that could not be read
│       │   │   ├── exitAssessment.test.ts # Exit assessment tests: a save shows with no reload, an unreadable assessment is not saved over, a late answer changes nothing
│       │   │   ├── highlights.ts        # W3C Text Quote Selector: a selection saves its words, a saved highlight is found again with white space not counted (RD-02), & old-comment parser (finds the JSON list, not the first `-->`)
│       │   │   ├── highlights.test.ts   # Highlight tests: a highlight shows on its own words over bold text, footnote markers, blocks & Bionic reading, on the copy that was selected, and in the block of its anchor
│       │   │   ├── libraryRescan.ts     # "Rescan library": reads the library again, then updates search; the note names the new books and counts the files that search could not read
│       │   │   ├── libraryRescan.test.ts # Rescan tests: a book imported while the app is open shows in the list, and search is updated
│       │   │   ├── levelGuideData.ts    # Mortimer Adler levels static cheatsheet & hotkeys registry
│       │   │   ├── markdown.ts          # Chapter Markdown as a document of reader nodes: the blocks of the import, their anchors & the footnote texts (RD-03)
│       │   │   ├── markdown.test.ts     # Reader tests: lists, tables, superscripts, quotes & code show as such, each block keeps its anchor, no book text becomes HTML
│       │   │   ├── markdownInline.ts    # Inline tokens as reader nodes: tags as marks, footnote markers, white space as a browser shows it (RD-03)
│       │   │   ├── markdownNodes.ts     # The markdown-it parser & the block tokens of one block as reader nodes: lists, tables, quotes, code (RD-03)
│       │   │   ├── markdownTables.ts    # No lost table words: the text after the last row of a PDF table, and cells beyond the header (RD-03)
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
│       │   │   ├── preferences.ts       # Reader settings: defaults, migration, load from the vault (one copy from browser storage) & an ordered saver
│       │   │   ├── preferences.test.ts  # Settings tests: the vault keeps them, the theme is one of them, a late save never undoes a newer one
│       │   │   ├── readerEditor.test.ts # Editor tests: TipTap is 3.30.4 or later, a `__proto__` key draws no attribute, the reader loads only its own nodes, marks & plugins (SEC-05), and one options object leaves the chapter state alone (RD-06)
│       │   │   ├── readerLoads.ts       # Book & chapter loading: only the newest load may change the reader
│       │   │   ├── readerLoads.test.ts  # Load tests: a slow chapter that answers late changes nothing
│       │   │   ├── readerLocation.ts    # Book + chapter file + anchor locations: search hits open their own book
│       │   │   ├── readerLocation.test.ts # Location tests: a hit in another book's ch-01.md opens that book, not the open one
│       │   │   ├── readerProgress.ts    # How far down a chapter the reader is: each whole percent is reported once, not each scroll event (RD-06)
│       │   │   ├── readerProgress.test.ts # Progress tests: 201 scroll events make 101 reports, and another chapter reports its own percent
│       │   │   ├── readerShortcuts.ts   # Keyboard shortcut owners: App listener (Ctrl+K, Alt+P, ? / F1) or elementary canvas ([ and ])
│       │   │   ├── readerShortcuts.test.ts # Shortcut tests: one Alt+P press toggles the pacer once at every reading level
│       │   │   ├── readerText.ts        # The text of a chapter document as the reader shows it, with the document position of each character (RD-02)
│       │   │   ├── readingPlace.ts      # Where you stopped: the chapter a book opens at, the book the app opens with, and when a place is saved
│       │   │   ├── readingPlace.test.ts # Place tests: a book opens where you stopped, and closing and opening it never creeps up or down
│       │   │   ├── readingTime.ts       # Reading time: the focused seconds a chapter is on screen, and the Completed mark from its own scroll position
│       │   │   ├── readingTime.test.ts  # Reading time tests: a scroll never starts the count again, and a chapter is completed only by its own scroll
│       │   │   ├── reviewDays.ts        # Review days: puts the 15-minute blocks of reviews on days of the window's time zone, and gives the heatmap weeks, the streaks & the count of the past 365 days
│       │   │   ├── reviewDays.test.ts   # Review day tests: a review after midnight counts on that day, the rows go from Monday to Sunday, and a clock change skips no day
│       │   │   ├── searchIndex.ts       # Search update when the app opens and on Rescan: the files the index could not read share one line in the error bar; renamed book folders share another line
│       │   │   ├── searchIndex.test.ts  # Search update tests: a file the index could not read shows in the error bar with its name and the reason, and a renamed book folder shows with the name to give it back
│       │   │   ├── searchQuery.ts       # Search box minimum length (2 characters), the same as the backend
│       │   │   ├── searchQuery.test.ts  # Search length tests: 1 character does not search, spaces at the ends do not count
│       │   │   ├── searchSnippet.ts     # Search result snippets as React text with a <mark> around each hit, so book text never becomes HTML (SEC-01)
│       │   │   ├── searchSnippet.test.ts # Snippet tests: a tag in a result shows as text, each hit is marked and nothing else, a hit with no end marks the rest
│       │   │   ├── tableOfContents.ts   # Contents entries: the chapter file & paragraph that each entry opens, never a chapter found by its title (CQ-01)
│       │   │   ├── tableOfContents.test.ts # Contents tests: entries with the same title open their own chapters, an entry inside a chapter opens its paragraph, a PDF book opens the same chapters
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
│           │   │   ├── analytics.rs         # Retention metrics, study analytics & review heatmap (reviews in 15-minute blocks, AN-02)
│           │   │   ├── analytics_numbers_tests.rs # Analytics number tests: no made-up retention rate, a new card is not due, titles & real chapter totals in the reading table
│           │   │   ├── analytics_tests.rs   # Heatmap tests: the cache counts the reviews of each 15-minute block and leaves the day to the window
│           │   │   ├── backfill.rs          # One-time copy of an older cache into the vault study log; reading time only for a book whose log has none, so an old chapter name never goes back into the log (IN-04)
│           │   │   ├── backfill_tests.rs    # Copy tests: the cache reaches the vault once, and never twice; a chapter that a new import renamed is not copied back under its old name (IN-04)
│           │   │   ├── card_identity.rs     # Stable practice card ids from the question text (FNV-1a), not the deck position
│           │   │   ├── deck_sync.rs         # Practice deck sync: one card per question, archive for cards that left the deck or whose book left the vault, old-id migration
│           │   │   ├── deck_sync_tests.rs   # Deck sync tests: removed, changed, reordered, returning & duplicate cards, and a card whose chapter file is missing
│           │   │   ├── due_cards.rs         # Practice session card picker: due reviews first, then new cards (cloze/scenario mix), for the whole book or one chapter (Chapter Gatekeeper)
│           │   │   ├── fsrs_parser.rs       # Practice card markdown extraction & verbatim validator (a card whose chapter cannot be read is left out); a quiz card is checked against the paragraph of its anchor, also in a chapter with Windows line endings (IN-06)
│           │   │   ├── fsrs_parser_tests.rs # Card check tests: a quiz card that quotes another paragraph is left out, with any line ending (IN-06)
│           │   │   ├── fsrs_store.rs        # FSRS deck statistics & review submission (card update and review log row in one transaction)
│           │   │   ├── fsrs_store_tests.rs  # Review saving tests: failed log row, card without a book id, double click
│           │   │   ├── indexer.rs           # Vault indexing, each book on its own (a file it cannot read is named; deleted books & removed chapters leave search) & FTS5 full-text search; a book is known by its folder name, and a renamed book folder is named; the rows hold the words of each paragraph, never its HTML (SEC-01); a chapter is read with `\n` line endings, so search finds the paragraphs that the reader shows (IN-06)
│           │   │   ├── indexer_tests.rs     # Index tests: a broken book or chapter stops nothing, and deleted books & removed chapters leave search; search and the library know a book by its folder name; search finds each paragraph of a chapter with any line ending (IN-06)
│           │   │   ├── models.rs            # SQLite row models and analytics transfer structs
│           │   │   ├── reading_velocity.rs  # Chapter reading time & completed chapters, with no word count or speed (AN-01); chapter & book titles and the chapter total (AN-03)
│           │   │   ├── reading_velocity_tests.rs # Reading time tests: the analytics show time & completed chapters, and no word count
│           │   │   ├── removed_books.rs     # A book that left the vault: its cards move to the archive, its review history & reading time leave the cache
│           │   │   ├── removed_books_tests.rs # Removed book tests: a deleted book leaves All Books analytics & practice, and gets its progress back when it returns
│           │   │   ├── restore.rs           # Puts the study progress back into the cache from the vault study log; the reading time of a book follows its log, also to chapters that a new import renamed, unless a line is damaged (IN-04); a book that left the vault gets nothing back
│           │   │   ├── restore_tests.rs     # Restore tests: throwing the cache away loses no study progress, and a book that left the vault gets nothing back; reading time follows renamed chapters, and a damaged line takes no time away (IN-04)
│           │   │   ├── schema.rs            # SQLite database initialization & migrations
│           │   │   ├── search_query.rs      # Typed search to FTS5 expression: quoted words & phrases, hyphen spellings, AND/OR/NOT operators, 2-character minimum
│           │   │   ├── search_results_tests.rs # Search result tests: a tag in a chapter file never reaches a result, book text shows as written, tag names are not found, old rows are written again
│           │   │   ├── search_tests.rs      # Search tests on a real FTS5 index: operators, inner punctuation, phrases, short searches, a book imported after the first index
│           │   │   ├── search_text.rs       # The text that search keeps of a paragraph (no HTML tags, character references as characters) & the characters that mark a hit (SEC-01)
│           │   │   ├── seed_lexicon.rs      # Curated seed dictionary entries & initial SQLite database seeding
│           │   │   └── mod.rs               # Ephemeral SQLite database module root & test suite
│           │   ├── fsrs/                # FSRS engine test module
│           │   │   └── tests.rs             # FSRS-5 reference tests with numbers from the official py-fsrs 5.1.3
│           │   ├── fsrs.rs              # Local FSRS-5 spaced repetition scheduling engine
│           │   ├── lib.rs               # Application builder, plugin setup, and invoke router; only one copy of the app runs (single-instance plugin, registered first); the app loads only the dialog & single-instance plugins (SEC-04)
│           │   ├── main.rs              # Tauri binary executable entrypoint
│           │   ├── security_config_tests.rs # Security tests: only the scripts of the app run, pictures come only from the app & the book picture folders, the asset protocol opens no file on its own (SEC-02); `Cargo.toml` names only the plugins that the app needs (SEC-04)
│           │   ├── test_support.rs      # Test-only sandbox: temporary vault & cache database per unit test, also for its test threads (Sandbox::spawn); the vault search finds nothing outside it; folder links for tests on Windows (`junction`)
│           │   ├── vault/               # Modular vault file I/O & notes aggregation
│           │   │   ├── analytical.rs        # Level 3 analytical store loader, saver & unit tests; a damaged file stops the load and the save
│           │   │   ├── book_pictures.rs     # The picture folder of each book (`books/<book>/assets`), the only files the window may load through the asset protocol; links are left out (SEC-02)
│           │   │   ├── book_pictures_tests.rs # Picture folder tests: only the `assets` folder of each book counts, and a book folder or picture folder that is a link is left out
│           │   │   ├── bookmark.rs          # Where you stopped reading: `vault/notes/<book-id>/bookmark.json`; the newest bookmark names the book to open
│           │   │   ├── bookmark_tests.rs    # Bookmark tests: the newest moment wins, a damaged bookmark is never saved over
│           │   │   ├── escape_tests.rs      # Tests that no name the page sends reads or writes a file outside the vault: `..` parts, absolute paths & linked folders, for every command that takes a name (SEC-03)
│           │   │   ├── highlights.rs        # Chapter highlights file: load, save, and the one-time move out of the old notes comment (quotes may hold `-->`)
│           │   │   ├── highlights_tests.rs  # Highlight tests: a notes save cannot erase a highlight, and the move keeps the reader's text
│           │   │   ├── inspectional.rs      # Your exit assessment in `vault/notes/<book-id>/inspectional.json`, never in the `_meta.json` an import writes again
│           │   │   ├── inspectional_tests.rs # Exit assessment tests: an import keeps it, `_meta.json` is never written, a damaged file is never saved over
│           │   │   ├── json_store.rs        # Safe JSON read for vault files: byte order mark removed, a damaged file errors and is copied to <name>.corrupt-<time>
│           │   │   ├── locate.rs            # Finds the vault folder, and remembers the one the reader picked
│           │   │   ├── locate_tests.rs      # Find tests: a folder with no books inside is refused, nothing is remembered, and a test never finds the real vault
│           │   │   ├── models.rs            # Vault metadata, analytical and note structures
│           │   │   ├── notes.rs             # Chapter reflection notes loader, saver & summary export
│           │   │   ├── paths.rs             # The only way from a name the page sends to a vault path: rules for book ids, chapter files, notes files & topic ids, and a path that leads out of the vault through a link is refused (SEC-03)
│           │   │   ├── paths_tests.rs       # Name rule tests: every name the importer & the app make passes, a name that could leave its folder is refused, and a notes folder that is no book cannot stop the jobs that read every book
│           │   │   ├── preferences.rs       # Reader settings in `vault/preferences.json`, kept key for key; a damaged file stops the load and the save
│           │   │   ├── preferences_tests.rs # Settings tests: a setting this build does not know is kept, a damaged file is never saved over
│           │   │   ├── reader.rs            # Book discovery & chapter I/O; `_meta.json` is only read, because the importer makes it (the vault folder comes from locate.rs); a book's id is its folder name; chapters and notes are read with `\n` line endings (IN-06)
│           │   │   ├── reader_tests.rs      # Vault write tests: no half-written notes file while a save runs; a renamed book folder opens under its folder name; a chapter and its notes with Windows line endings are read with `\n` line endings (IN-06)
│           │   │   ├── safe_write.rs        # The one vault write: temporary file in the same folder, flushed, then renamed over the target, so a save is never half done
│           │   │   ├── study_log.rs         # The permanent record of your study: reviews & reading time, one line each; a notes folder whose name is no book id, or that is a link, is no book (SEC-03)
│           │   │   ├── syntopicon.rs        # Level 4 Syntopicon topic file I/O & report exporter; a new topic never replaces a topic file that is there
│           │   │   ├── syntopicon_compiler.rs # Level 4 Dialectical dossier compiler producing Markdown reports
│           │   │   ├── syntopicon_models.rs # Level 4 Syntopicon neutral terms & controversy structs
│           │   │   ├── syntopicon_tests.rs  # Topic tests: a title whose file is taken is refused and that topic stays byte for byte, two creates at once make one topic
│           │   │   ├── text_file.rs         # Chapters & notes are read with `\n` line endings only: `\r\n` and a lone `\r` become `\n` (IN-06)
│           │   │   ├── vocabulary.rs        # Vault vocabulary persistence with case-insensitive deduplication; a damaged file stops the load and the save
│           │   │   └── mod.rs               # Vault module facade
│           ├── Cargo.toml       # Rust dependency manifest (rusqlite, tokio, tauri v2; only the dialog & single-instance plugins, SEC-04)
│           └── tauri.conf.json  # Tauri v2 window, security, and bundle configuration; content security policy & an asset protocol that opens no file on its own (SEC-02)
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
│       │   ├── anchors.py               # Deterministic paragraph anchor (^p-xxx) injector; a chapter with 2 or 3 paragraphs gets head and tail samples that share no paragraph (IN-01)
│       │   ├── assets.py                # Asset extraction, micro-asset filtering & page-level image suppression
│       │   ├── batch.py                 # Batch document intake utility (.epub & .pdf)
│       │   ├── book_build.py            # An import builds a book in `vault/.import/<book-id>/`, checks it there, and puts it in the vault with its deck and the reader's moved files, all together or not at all (IN-05)
│       │   ├── book_check.py            # The check of a book before it goes into the vault: every paragraph has its anchor, every footnote link has its note (IN-05), and no character is broken (CQ-02)
│       │   ├── book_id.py               # The rule for a book id, which names the folders of a book: an import with another id stops before it writes anything (SEC-03); the id of a file name: letters with marks become plain letters, and a name in another script gets a code (IN-03)
│       │   ├── book_source.py           # The file each book came from (`source` in `_meta.json`): an import finds the book of a file by its bytes or else its name (IN-03)
│       │   ├── cli.py                   # Command-line entrypoint (`book-ingest`); a book the vault already has is replaced only with --force; a --book-id that breaks the rule stops the import (SEC-03); --force alone never replaces a book from another file, and the stop gives the two ways on (IN-03)
│       │   ├── chapter_shape.py         # A page of a book that holds nothing but a title is no chapter: its headings join the chapter it introduces, which then carries its own name instead of the name of the division (CQ-04)
│       │   ├── cloze.py                 # Cloze (fill-in) cards: a marked term of a plain sentence, no small-word, number or label answers, prompts without marks or a second answer, and one card for a repeated term in a chapter without a marked term (LE-07)
│       │   ├── elementary.py            # Deterministic Flesch-Kincaid & reading time metrics
│       │   ├── endnotes.py              # Backmatter endnote relocation to inline footnotes; a note is one footnote line (IN-06); only a link to a note becomes a footnote, and any other link keeps its words (IN-02)
│       │   ├── epub_parser.py           # XHTML chapter extractor & typography normalizer; book text that looks like HTML is written as text (SEC-01); a heading is one line, and the block where each element id starts is noted (CQ-01); every text a browser shows is written in any layout, with preformatted text as the book has it and a <br> as a line break, and no Project Gutenberg boilerplate (IN-02); a division and a chapter are known by the rules of `chapter_shape.py` (CQ-04)
│       │   ├── glyph_repair.py          # A font that names its maths characters wrongly is given a correct map before any text is read, so an "=" does not come out as a "1/4" (CQ-02)
│       │   ├── layout_stitcher.py       # Narrative sentence healing, layout reconciliation & callout hoisting; the two halves of a sentence that a page break, a photo credit or a figure label cut in two are joined again, and joining repeats until nothing more joins (CQ-03)
│       │   ├── line_endings.py          # One line ending: the text of an EPUB book is read with `\n` line endings, and every file that the import writes has `\n` line endings, also on Windows (IN-06)
│       │   ├── markdown_text.py         # Book text in chapter Markdown: a < or & that could be read as HTML is written as &lt; or &amp;, and read back (SEC-01)
│       │   ├── models.py                # Pydantic schema validation for metadata and cards; `_meta.json` records the file of the book (`source`, IN-03); no time of the import, so two imports of the same file write the same bytes (IN-05)
│       │   ├── pdf_outline.py           # The parts of a PDF book from its outline: every part from the cover to the index, and its kind (front matter, chapter, body, appendix, back matter) (IN-01)
│       │   ├── pdf_parser.py            # Sequential part-by-part PDF parser & asset coordinator; only chapters, body parts and appendices make practice cards (IN-01); the book is built in its build folder, and an import of some parts starts from a copy of the book (IN-05); the character maps of the fonts are repaired before any text is read (CQ-02)
│       │   ├── pdf_sanitizer.py         # PDF slug normalization, drop-cap healing, heading & author sanitization; the slug of a name in another script gets a code (IN-03); the page's own marks come off the text and a small roman page number goes (`text_repair.py`, CQ-03)
│       │   ├── pipeline.py              # End-to-end ingestion pipeline coordinator; the book is built in its build folder, and goes into the vault only when it is whole and checked (IN-05); a page that holds no text joins the chapter after it, and no chapter is left with nothing to read (CQ-04)
│       │   ├── places.py                # A new import finds each old chapter and paragraph in the new text, and moves what the reader's files point to: the bookmark, reading time, notes, highlights and citations (IN-04); the moves go into the vault together with the new book (IN-05)
│       │   ├── reimport.py              # Stops an import of a book the vault already has before it writes anything, and names the reader's own files; picks the book id of a file, and stops a file whose book id a book from another file has (IN-03)
│       │   ├── salience.py              # Deterministic salience scorer & practice deck writer; re-exports the cloze and quiz card generators
│       │   ├── sample_generator.py      # Starter sample generator for development
│       │   ├── scenarios.py             # Quiz cards that ask which sentence comes right after a passage: wrong options from other paragraphs of the chapter, no near-copies, the right option spread over A to D (LE-06)
│       │   ├── text_repair.py           # A page's own layout marks come off the text, and a word a hyphen cut in two is made whole; a lost first letter goes back only when the chapter's own words prove which letter it was (CQ-03)
│       │   ├── toc_links.py             # Links the EPUB contents to the import: each entry gets the chapter file that holds it & the paragraph where it starts (CQ-01); an entry that opens nothing at all goes, and an entry that only groups others stays (CQ-04)
│       │   ├── vault_changes.py         # Puts a new book folder and changed vault files in place all together, or puts each change back; tries again while Windows holds a file, and removes folders that Windows marks read-only (IN-05)
│       │   └── vector_figures.py        # Vector diagram rasterization, boundary stops & full-width section bounds
│       ├── tests/               # Pytest verification suite for anchors, schemas, TOC, and pipeline
│       │   ├── test_analytical_audit.py # Vector 9 analytical logic & citation parity test suite
│       │   ├── test_anchors.py          # Deterministic paragraph anchor injection test suite; the samples of a short chapter share no paragraph (IN-01)
│       │   ├── test_book_build.py       # Build folder tests: what a killed import left does not stop the next import, also in read-only folders, a book folder that Windows marks read-only is replaced, a book left aside stops the next import, and the check names each problem (IN-05)
│       │   ├── test_book_id.py          # Import tests: an EPUB, a PDF or the command line with a book id that could lead out of the vault writes nothing (SEC-03)
│       │   ├── test_book_id_names.py    # Book id name tests: names in other scripts get ids of their own, also long names, letters with marks become plain letters, plain names keep their ids, and the sample book stays (IN-03)
│       │   ├── test_book_id_rule.py     # Book id rule tests: every id the importer makes passes, an id that could leave its folder is refused
│       │   ├── test_book_source.py      # Same book id tests: a book from another file is never replaced, even with --force; the command line & the inbox give the two ways on; a file finds its own book by its bytes or its name (IN-03)
│       │   ├── test_chapter_shape.py    # Chapter shape tests: a title page joins the chapter after it and loses no word, a page of a picture stays a chapter, a chapter that starts a book carries its own name, and an entry that opens nothing goes (CQ-04)
│       │   ├── test_cloze_cards.py      # Cloze card tests: no small-word, number or label answer, no marks or second answer in the prompt, no card from a table or HTML, one card for a repeated term, and the audit refuses the old cards (LE-07)
│       │   ├── test_dependencies.py     # Lock tests: each dependency, and each package that one needs, has one exact version in requirements.lock, and the installed versions are those versions (IN-05)
│       │   ├── test_endnotes.py         # Endnote relocation & inline footnote syntax test suite
│       │   ├── test_epub_contents.py    # EPUB contents tests: full chapter titles, and each entry names the chapter file & paragraph where it starts, as in The Wealth of Nations (CQ-01); the title page of a division joins the chapter after it and both entries open it (CQ-04)
│       │   ├── test_epub_text.py        # EPUB text tests: every kind of block in any layout, preformatted text as the book has it, no words run together, and only a link to a note becomes a footnote (IN-02)
│       │   ├── test_figure_cards.py     # Figure extraction, full-width dimensions & table suppression tests
│       │   ├── test_glyph_repair.py     # Character map tests: the maths font of the Dalton book gets an "=", a "+" and a multiplication sign, a right font is left alone, and a broken character stops an import (CQ-02)
│       │   ├── test_import_changes.py   # Import tests: a failed EPUB or PDF import changes nothing, a new import leaves no old chapter or picture, a book that fails the check stays out of the vault, and two imports of a file write the same bytes (IN-05)
│       │   ├── test_import_moves.py     # New import tests: when chapters and paragraphs get other numbers, the bookmark, reading time, notes, highlights and citations stay on their text, in an EPUB and a PDF book (IN-04)
│       │   ├── test_line_endings.py     # Line ending tests: an EPUB book with Windows or old Mac line endings imports as the same book, a note is one footnote line, and every file an import writes has `\n` line endings (IN-06)
│       │   ├── test_markdown_text.py    # Book text tests: a tag the book shows as text is written as text in every kind of block, and reads back as the book has it
│       │   ├── test_meta_schema.py      # Book metadata, hierarchical TOC & schema validation tests
│       │   ├── test_next_sentence_quiz.py # Quiz card tests: the card asks what comes right after its passage, the right option spreads over A to D, no near-copy or next-paragraph wrong option, and the audit refuses the old cards (LE-06)
│       │   ├── test_pdf.py              # PDF parsing, chapter splitting & text preservation tests
│       │   ├── test_pdf_book_parts.py   # PDF import tests: the preface, the part pages, the appendices and the index are imported, the last chapter keeps its sections, the pages no part covers are named, only chapters and appendices make cards, and the audits pass on the imported book (IN-01)
│       │   ├── test_pdf_outline.py      # Outline part tests: the Kotler and Dalton outline shapes cover every page and keep the chapter pages, and each part gets its kind (IN-01)
│       │   ├── test_pipeline.py         # End-to-end ingestion pipeline integration test suite
│       │   ├── test_places.py           # Place tests: a joined or a cut paragraph, a chapter in another place, text that is gone, and a file in the way that cannot be read (IN-04)
│       │   ├── test_practice_deck.py    # Zero-hallucination verbatim practice card validation tests
│       │   ├── test_reimport.py         # Import stop tests: nothing changes, --force keeps the reader's files, the inbox keeps a stopped copy
│       │   ├── test_salience.py         # Salience scoring & extractive cloze extraction tests
│       │   ├── test_syntopicon_audit.py # Vector 10 syntopical cross-vault referential parity test suite
│       │   ├── test_text_repair.py      # Whole sentence tests: the two halves of a cut sentence join, a photo credit or a figure label never becomes part of one, and a page's own highlight, empty heading and roman page number go (CQ-03)
│       │   ├── test_toc.py              # Table of contents extraction & hierarchy tests
│       │   ├── test_toc_links.py        # Contents link tests: the block & paragraph of each element, encoded and NCX-relative links, no guessed document (CQ-01)
│       │   └── test_vault_changes.py    # Vault change tests: every change goes in, a change that fails puts each change back, a file that Windows holds for a moment still goes in, and a read-only old book folder is removed (IN-05)
│       ├── pyproject.toml       # Python package configuration and CLI entrypoints
│       └── requirements.lock    # The exact version of every package that the import needs (IN-05)
├── scripts/
│   └── create_desktop_shortcut.ps1 # One-click Windows desktop shortcut generator; an open app comes to the front, and no second copy starts
├── vault/                       # SOLE PERMANENT RECORD: User Markdown vault (Versioned / Syncable)
│   ├── .import/                 # Where an import builds a book before it goes into `books/`; there only while an import runs (IN-05)
│   ├── books/<book-id>/         # Chapter Markdown (`ch-XX.md`), `_meta.json`, and extracted assets
│   ├── notes/<book-id>/         # Chapter notes (`ch-XX-notes.md`), highlights (`ch-XX-highlights.json`), study decks, the study log (`reviews.jsonl`, `reading.jsonl`), your exit assessment (`inspectional.json`), and where you stopped reading (`bookmark.json`)
│   ├── preferences.json         # Reader settings: theme, pacer speed, Gatekeeper, daily target
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

Only a link to a note becomes a footnote (IN-02). Every element with an id counted as a note, so a link such as "See Section Two" became a footnote that held the whole section, and it lost its words. Now a link names a note when its target can be a note, that is no heading or part of the book such as a section, with no heading inside, and when the link says so (`epub:type="noteref"`, `role="doc-noteref"`), the target says so (`footnote`, `endnote`, `doc-footnote`, or a list of notes around it), or the link looks like the mark of a note: a superscript, or a number or a sign such as `*`. Any other link keeps its words, and a note link with words, such as "see note 4", keeps them before the marker. A note of the chapter that says that it is a note, such as `<aside epub:type="footnote">`, shows only as a footnote.

### Book Text That Looks Like HTML (`packages/ingestion/ingest/markdown_text.py`)
The app reads the HTML that a chapter file holds: the reader shows it, and search leaves it out. The EPUB import wrote the text of a book as it is, so a book that shows a tag as an example (`&lt;img src=x onerror=...&gt;` in its XHTML) got a live `<img>` tag in its chapter file, and the reader lost those words. Now `escape_markdown_text` writes a `<` of the book text that could start a tag as `&lt;`, and a `&` that could start a character reference such as `&lt;` as `&amp;`, in every paragraph, heading, list, table, quote and image text (SEC-01). Every other character stays, so `AT&T` and `2 < 3` stay as they are. The chapter title and the previews in `_meta.json` hold the text itself (`unescape_markdown_text`). A footnote keeps its text as it is, because the reader shows a footnote as text. A practice card is made from the chapter file, so a card from such a sentence shows `&lt;`, as a card from a PDF chapter shows `<sup>`. The PDF import writes the text as it is, with the tags it adds.

### Every Text of an EPUB Book (`packages/ingestion/ingest/epub_parser.py`)
The converter wrote only some kinds of blocks, and only in some layouts: a `<pre>`, a `<figure>`, an `<aside>` and a `<dl>` vanished, text before a paragraph in a box was lost, a `<br>` ran words together ("Poem line onePoem line two"), and a chapter title in a `<header>` was lost (IN-02). Now `html_to_markdown_blocks` writes every text that a browser shows:
- **Blocks:** a container, such as `<div>`, `<aside>`, `<figure>` or `<header>`, gives the blocks inside it, and text between two blocks is a paragraph. A term of a definition list is a paragraph in bold, a table caption is a paragraph, and an inner list is indented below its item.
- **One Line:** a paragraph is one line, because a browser shows a line break of the book file as a space. A `<br>` stays a `<br>` tag, which the reader shows as a line break (a space in a heading). Words at the edge of a block or of a bold mark stay apart, and a comment of the book file is no text.
- **Preformatted Text:** a `<pre>` block keeps the lines and the spaces of the book, and the reader shows it as a code block. A blank line ends a block of a chapter file, so a blank line inside it is `&#10;`. `*`, a backtick, `[` and a `#` at the start of a line are character references, so the reader finds no Markdown in it. The reader shows the characters of these references, with no empty line above and below the code block (RD-03).
- **Left Out:** the navigation of the book, and the header and the license that Project Gutenberg adds to its books (class `pg-boilerplate`), as the owner chose.
- **The Wealth of Nations:** a new import gives the same chapters, titles, contents and text. A number table that the old import cut into pieces at its blank lines is one paragraph now, so later anchor numbers in chapters 14, 34, 36 and 37 go down, and one card of chapter 7 is a whole sentence now.

### Paragraph Anchor Tagging
Every top-level paragraph in chapter Markdown files receives a deterministic anchor:
`Market segmentation is the bedrock of targeted positioning. ^p-042`
Anchors follow the format `^p-[0-9]{3,}` and are preserved across re-indexes. A new import can give a paragraph another number, and the reader's files follow its text (see below).

### Your Files Follow a New Import (`packages/ingestion/ingest/places.py`)
A chapter file is numbered by its place in the book, and a paragraph anchor by its place in its chapter. A new import of a changed book, or of the same book after a fix of the import, can give them other numbers: a new import of the Dalton PDF keeps the front matter as parts of their own (IN-01), so `ch-07.md` becomes `ch-11.md`. The bookmark, notes, highlights, citations and reading time of the reader kept the old numbers, so they pointed at other text (IN-04). The numbers stay as they are, so notes still sort by paragraph and every import of a file gives the same files, and a replacing import moves what the reader's files point to, as the owner chose:
- **Finding the Text:** before it writes anything, the import reads the chapters of the book that the vault has (`read_book_text`). When it has built the new chapters, it pairs the old and the new paragraphs in book order by their letters and digits, so a space or a mark that a fix changed does not count (`NewPlaces`). A changed paragraph pairs with a new paragraph that has much the same words, or that holds its words or is held in them: a paragraph that the new import joins with the next one, or cuts in two. A paragraph in another part of the book is found by its words. A chapter goes to the new chapter that holds most of its paragraphs, or that has its title.
- **Text That Is Gone:** a place whose text the new import does not have goes to the nearest paragraph before it in its chapter, or else after it, and the import names it. A chapter whose text is all gone goes with the chapter before it.
- **What Moves:** `bookmark.json` (the chapter file and the paragraph), `reading.jsonl` (the chapter file of each line; every other field and the line endings stay), `<chapter>-notes.md` and `<chapter>-highlights.json` (the file name, and each `^p-` anchor in them; a highlight goes to the file of the chapter that has its paragraph now), `analytical.json`, and the citations of the book in `vault/syntopicon/topics/*.json`. `vocabulary.json` names no chapter, so it stays, and a report is made again when it is exported. An anchor in notes whose paragraph is in another chapter now stays as it is, and the import names it.
- **No Text Is Lost:** every new file text goes to a temporary file first, then all of them go in place together with the new book, and only then is a moved file removed (`reader_moves`, `ingest/vault_changes.py`, IN-05). A file at a new name that no chapter of the old book names keeps its own text first, and when such a file cannot be read, no notes or highlights move. A new import of the same text changes no file of the reader.
- **The Cache Follows the Log:** the app keeps a copy of the reading time in `index.db`, by chapter file. At the start, `db/backfill.rs` copies reading time only for a book whose log has none, so an old chapter name never goes back into the log. `db/restore.rs` then gives each chapter in the cache the sum of its lines, and takes out a chapter that no line names. When a line of the reading log is damaged, or the cache counts more seconds than the log, the cache keeps its rows and only gets the chapters that it has no row for. Card progress needs no move: a card is known by its question (LE-05), and the next deck sync gives it its new chapter and paragraph.
- **Close the App First:** the app writes the bookmark and the reading time while you read, with the chapter files that it loaded, so close the app before you import a book again.

### An Import Changes the Vault All Together or Not at All (`packages/ingestion/ingest/book_build.py`)
An import wrote each file of a book into the vault as soon as it had made it. An import that failed in chapter 2 left a new `ch-01.md` next to the old `_meta.json` and practice deck, a new import with fewer chapters left the old `ch-03.md` and its pictures, and `process-inbox.py` reported "Success" for a book that failed the anchor audit, and moved its file to `inbox/processed/` (IN-05). Now:
- **Build Folder:** an import builds the chapters, the pictures and `_meta.json` of a book in `vault/.import/<book-id>/`, where the app does not look for books (`BookBuild`). A new import writes the whole book folder again, so no chapter file or picture of an older import stays. An import of some parts (`--chapter`) starts from a copy of the book folder, and it leaves out a part that the book does not have now.
- **Check:** every paragraph of a chapter file must end with its anchor, every footnote link must have its note, and no character may be broken (`ingest/book_check.py`, CQ-02). A book that fails stops the import with each problem, and the vault keeps the book that it had. `audit-anchors.py` uses the same check. `process-inbox.py` reports such a book as `Failed`, writes no ledger line, and leaves its file where it is.
- **All Together:** `VaultChanges` (`ingest/vault_changes.py`) first writes each new text to a temporary file next to its file: the practice deck, and the reader's files that follow their text (IN-04). Then it moves the old book folder aside to `vault/.import/<book-id>.replaced`, the new book folder into its place, and each temporary file into the place of its file. When a step fails, it puts back each change, and the error stops the import. Only when every change is in does it remove the old book folder, and each file whose text went to another file. Windows can hold a file for a moment, for example while OneDrive or a virus scanner reads it, so each move tries again for up to 5 seconds. OneDrive marks the folders of the vault read-only: Windows moves such a folder, but does not remove it, so the import takes the mark away before it removes a folder (`remove_folder`).
- **After a Stop:** a stopped import removes its build folder, and the next import removes a build folder that a killed import left. When a power cut comes between the two folder moves, the old book is in `vault/.import/<book-id>.replaced`: the next import stops, changes nothing, and says to move that folder back.
- **Same Bytes:** `_meta.json` holds no time of the import, so two imports of the same file write the same bytes. `packages/ingestion/requirements.lock` gives the exact version of every package that the import needs, and of every package that those packages need, because a new version of pymupdf4llm or pymupdf-layout can change the Markdown of a book. `tests/test_dependencies.py` fails when an installed version is not the version of the lock.

### Hierarchical Spine Contract (_meta.json)
The manifest models multi-level books (Parts -> Chapters -> Sections) with word counts, paths, and anchors. The importer makes this file and writes it again on every import, so it holds nothing the reader writes, and the app only reads it (DS-09). It records the file that the book came from (`source`: the file name and the SHA-256 of its bytes), so a new import can tell a new copy of the book from another book (IN-03). It holds no time of the import, so two imports of the same file write the same bytes (IN-05).

### Contents Open Files, Not Titles (`packages/ingestion/ingest/toc_links.py`)
The contents of an EPUB book link to source documents and element ids, such as `part-2.xhtml#chapter-7`, which the vault does not have. The sidebar found the chapter of an entry by its title, and the import cut each chapter title at a line break in its heading. Every book of The Wealth of Nations starts again at "CHAPTER I.", so 21 of the 42 entries in the sidebar opened a chapter of Book I, and 2 opened nothing (CQ-01).
- **Import:** each entry gets the chapter file that holds its document (`href`, such as `ch-16.md`) and the paragraph where it starts (`anchor`, such as `^p-012`). The converter notes the block where each element id starts. An entry at the top of a chapter gets no anchor. An entry whose document made no chapter, such as an endnote file, gets no file.
- **Titles:** a heading is one line, so a chapter title keeps the words after a line break ("CHAPTER I. OF THE DIVISION OF LABOUR."), and the reader shows the heading as a heading, not as text with `##` marks.
- **Sidebar:** an entry opens its file and its paragraph (`contentsTarget`, `apps/desktop/src/lib/tableOfContents.ts`). Titles are never compared. A part with no file opens its first sub-entry, and an entry that no chapter holds is dimmed and opens nothing. The contents of a book imported before this fix name source files, so the sidebar shows the chapter list of that book until it is imported again.

### Every Part of a PDF Book (`packages/ingestion/ingest/pdf_outline.py`)
The PDF import used to keep only the pages from the first "Chapter N" entry of the PDF outline to the last one. A preface, an appendix, a glossary, a reference list and an index were never imported, a part with no chapter number such as "Conclusion" was lost, and a last chapter with sections in the outline was cut at its first section (IN-01: Kotler lost 155 of 769 pages, Dalton 40 of 370). Now `outline_parts` makes a part of every outline entry at the level of the chapters, and of every entry above that level that holds no chapter, with the sections inside it. An entry that holds chapters, such as "Part 1" or the book title, is not a part itself, but its pages before its first inner entry are. A part runs until the next part starts. The pages before the first part are not imported, and the import prints them (`Not imported: pages 1-2.`). Outline entries that start on the same page share one part, because a page cannot be split. The parts are `ch-01.md`, `ch-02.md` and so on in page order, as in an EPUB book, because the app opens only chapter files with these names (SEC-03).
- **Chapter Level:** the outline level that holds the most chapter titles: "Chapter 3", "Chapter IV" or "Chapter One", or else titles that start with a number, such as "3. Pricing". When no title looks like a chapter, the chapters are one level below the entries named "Part", "Book" or "Volume" with a number, or else on the first level with more than one entry.
- **Kinds:** a part with a chapter title is a chapter. The parts before the first chapter are front matter, and the parts after the last chapter are back matter. A part between two chapters, such as the title page of "Part 2" or an interlude, is body, and so is the title page of "Part 1". A part whose title starts with "Appendix" is an appendix. When no title looks like a chapter, every part is a chapter.
- **Cards:** only chapters, body parts and appendices make practice cards and count for the reading metrics, as the owner chose. In the real PDFs, the other parts made mostly weak cards, from copyright text, reference lists, author pages and index lines.
- **Blueprint:** the pivotal chapters are the first and the last chapter, not the cover or the index. `has_preface` and `preface_path` point at a front matter part named "Preface". The notes template goes with the first chapter. A part with 2 or 3 paragraphs, such as a cover, gets head and tail samples that share no paragraph (`extract_inspectional_sampling`), as the inspectional check of `audit-system.py` requires; before, only a chapter that short could fail it, and no real chapter was.
- **No Outline:** a PDF with no usable outline is still cut into parts of 35 pages.

### Vector Figure Extraction & Full-Width Section Bounding (`packages/ingestion/ingest/vector_figures.py`)
Multi-column textbook pages frequently include full-width conceptual matrices, multi-step process models, and leader callout boxes. To guarantee unclipped, high-resolution rendering:
- **Full-Width Section Bounding:** Vector diagram rasterization captures the full printable horizontal band: $[0, y_{\text{top}} - 8, \text{page.width}, y_{\text{bottom}} + 8]$ rendered at 200 DPI.
- **Stop-Block Protection:** Diagram boundaries stop cleanly before subsequent chapter sections, headings, or tables using strict word-boundary token matching (`\bchapter\b`, `\bpart\b`, `\btable\b`).
- **Aspect Ratio & Dimension Filtering:** Micro-decorations, standalone page header lines, and thin borders ($<50$ pt or aspect ratio $>6:1$) are pruned to prevent over-extraction.

### A Formula Says What the Book Says (CQ-02)
- **Why a formula came out wrong:** a typesetter sets a formula in a symbol font. The font holds an "=", a "+" and a "x", but its `ToUnicode` map, which names each character for a reader, can name them wrongly or leave them out. The Advent 3B2 font `AdvP4C4E74`, which the Dalton book uses, says its "=" is a "1/4" and its "+" is a "thorn", and it gives its "x" no name at all. PyMuPDF then read "1/4" for "=" and a replacement character for "x", so 28 characters in four chapters and two cards said something the book never said.
- **The maps are repaired first:** `repair_glyph_maps` (`ingest/glyph_repair.py`) writes a correct `ToUnicode` map into the open document before any text is read (`ingest/pdf_parser.py`). The file on disk is never touched, and a font that already names its characters correctly is left alone. The whole 370-page book takes 107 ms.
- **What each glyph really is:** the table is read from the font itself. Its `/CharSet` names the glyphs `/C0 /C2 /C3 /onequarter /thorn /y`, its `/Encoding /Differences` says which code names which glyph, and each glyph was cut out of the page as a picture and looked at. `onequarter` is an "=", `thorn` is a "+", `C0`, `C2` and `C3` are a multiplication sign, and `y` is a dagger.
- **The glyph name has the last word:** one part of a font can put the same glyph at another code, so the code table is the start and the `/Differences` array overrides it.
- **A broken character stops an import:** a chapter that holds a replacement character fails the book check and names the blocks it sits in (`ingest/book_check.py`), so the vault keeps the book it had. `audit-anchors.py` and `audit-system.py` use the same rule. A "1/4" or a "thorn" is not broken by itself, because a book may hold one for its own reasons.
- **Superscripts:** a price like 96 29/32 shows as a superscript in the reader, which RD-03 added (`components/reader/TipTapExtensions.ts`).

### A Chapter Has Something to Read (CQ-04)
- **A page of nothing but a title is no chapter:** an EPUB can give a division of a book ("BOOK I.") a document of its own that holds only the title. The Wealth of Nations had such a page as `ch-03`: a reader opened it and found nothing to read, and it made no practice card, because it held no sentence. `holds_no_text` (`ingest/chapter_shape.py`) knows such a page, and its headings go to the top of the chapter they introduce, so not one word of the book is lost.
- **Everything that is not a heading is text:** a page of a picture, of a table or of a list gets a paragraph anchor, so a reader can open it and highlight it, and it stays a chapter of its own. Only a page whose whole content is a title has nothing to read.
- **The name of a chapter says what a reader reads:** `chapter_name` takes the first heading, except when that heading names a division of the book and the heading right after it names a chapter. The Wealth of Nations puts "BOOK III." and "BOOK V." in one document with their first chapter, so the list of chapters called those chapters "BOOK III." and "BOOK V." and never showed "CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE" at all. The division stays the line above it in the contents.
- **A division with words of its own keeps its name:** "BOOK II." carries an introduction and "BOOK IV." two paragraphs of Adam Smith, so those are what a reader opens, and their names stay. Only a title with a chapter title right after it gives up its name.
- **One rule for a division and for a chapter:** `DIVISION_TITLE` and `CHAPTER_TITLE` live in `ingest/chapter_shape.py`, and `ingest/epub_parser.py` reads the contents of a book with the same two, so a division and a chapter mean the same thing everywhere.
- **An entry of the contents that opens nothing goes:** an entry gets no chapter file when its document made none, such as an endnote file whose notes moved into the chapters, or the license of Project Gutenberg that the import leaves out (IN-02). A reader tapped such an entry and nothing happened. `without_entries_that_lead_nowhere` (`ingest/toc_links.py`) drops it, and keeps an entry that only groups the entries below it, because its children still open.
- **A long paragraph of a book is the book's:** the longest paragraph of The Wealth of Nations is 2,760 words, and it is one paragraph in the EPUB, with no line break inside it. Adam Smith wrote it that way. Cutting it at sentence ends would put breaks in the book that the book does not have, and would move every paragraph anchor after it, so nothing cuts it. The same holds for the four chapters of 37,000 to 52,000 words: the contents open each part inside them (CQ-01).

### A Sentence Stays Whole (CQ-03)
- **Why a sentence came in two halves:** a page is not a stream of words. A page break, a picture, a photo credit or the title of a story box can land in the middle of a sentence, and a text reader then writes the two halves as two paragraphs. A reader cannot highlight, quote or study half a sentence, and a practice card cannot cite one.
- **A paragraph is finished only when it ends a sentence:** `finishes_a_sentence` (`ingest/layout_stitcher.py`) uses the same rule as the practice cards (`SENTENCE_END` in `ingest/scenarios.py`). A colon, a semicolon or a closing bracket does not finish one, and a bold marker or a footnote number at the very end is taken off before the rule looks.
- **Joining repeats until nothing more joins:** one sentence can be cut into three or more parts, so the round runs again, up to `MAX_ROUNDS`.
- **A photo credit inside a paragraph is lifted out:** a credit line that landed at the end of a paragraph made the whole paragraph read as a caption, so the cut was never seen. The credit moves out only when that lets the sentence join again, and it is kept.
- **A figure label is not a half sentence:** `is_figure_label` knows the shouted label of a figure or a table, so a sentence is never joined on to one, and a sentence that a label cut in two is joined across it. A sentence that merely begins "Figure 4.65 contains..." is prose, because a label shouts its name in capitals.
- **The rest of a sentence goes on in lower case:** a capital letter starts something new, so "For comparison, ..." is a new sentence, not the rest of the last one.
- **A word ending is never the start of a sentence:** a scrap such as "ers could sit for hours" is the tail of "customers" from a line the layout put elsewhere. `WORD_ENDINGS` holds those scraps, and such a join is refused, because a wrong join would put words in the book that the book never wrote. A hyphen at the end of the first half is proof of its own, and the word is closed up.
- **A page's own marks come off:** `repair_page_text` (`ingest/text_repair.py`) takes off the book's own `<mark>` highlight, so no chapter arrives already highlighted, drops a heading with no words, closes a word that a hyphen and a space cut in two, and puts back a lost first letter. A hanging hyphen stays, because "heat- and moisture-resistant" is how the book means to write it.
- **A lost first letter is never guessed:** exactly one capital letter must turn the stem into a word the chapter uses more than once, and the chapter must use that word more often than the bare stem. Anything less is a guess, so nothing changes.
- **A small roman page number goes:** the front matter counts its pages "vi", "xiv", and such a line landed in the middle of a sentence. Only the numbers 1 to 89 count, because "mix" is the roman number 1009 and also a word a marketing book uses on every other page.

### Zero-Redaction Reading Architecture & Table Suppression (`packages/ingestion/ingest/pdf_parser.py`)
- **Zero Redactions:** Destructive PDF text redactions are permanently abolished. Markdown text is generated directly from the pristine PyMuPDF document, guaranteeing 100% text completeness and preventing prefix or word amputations (`Importance`, `Underlying`, `They include`).
- **Synthetic Table Suppression:** When PyMuPDF vector line heuristics detect diagram lines and synthesize ASCII markdown tables (`||Starting point|Focus|...`), the parser detects embedded figure markers across table rows and cleanly replaces the entire synthetic table with the high-resolution figure asset reference while leaving surrounding body narrative (e.g., Steve Jobs quote) as clean Markdown prose.

---

## 3. Storage Separation & Synchronization

- **Vault (`vault/`):** Human-readable plain-text Markdown files and images. Can be edited externally (Obsidian, Neovim, VS Code).
- **Ephemeral Cache (`index.db`):** Stored strictly in the OS application data folder (`%APPDATA%\book-engine\`). Never checked into version control. It holds only a copy: everything in it is rebuilt from the vault.
- **The Reader Says Where the Vault Is:** The vault folder is looked for in this order (`apps/desktop/src-tauri/src/vault/locate.rs`): the folder the reader picked, saved in `%APPDATA%\book-engine\settings.json`; the `BOOK_ENGINE_VAULT` variable; a `vault` folder beside the program or beside its parent, for a copy carried on a stick; and a `vault` folder up to six levels above the working folder, which is the dev run from the repository. Only the last of these existed before, so an installed copy started in its install folder and found nothing, and every read and write failed with no way to put it right (LC-01). A folder counts as a vault only when it holds a `books` folder: `remember_vault` refuses anything else and says what a vault looks like, so the app never quietly points at an empty folder. `VaultGate.tsx` holds the app back until the folder is known and opens the picker (`choose_vault_folder`).
- **Your Study Is in the Vault:** Every card review and every piece of reading time is written as one line to `vault/notes/<book-id>/reviews.jsonl` and `vault/notes/<book-id>/reading.jsonl` (`apps/desktop/src-tauri/src/vault/study_log.rs`), before the cache is touched. A review the vault refuses is not saved at all. Card schedules, review history and reading time used to live only in `index.db`, which is not in the vault and is not backed up, so losing that file lost every bit of study progress (DS-01). At startup `db/backfill.rs` copies whatever a cache from before the change still holds and the vault does not, once (reading time only for a book whose log has none); `db/restore.rs` then puts back whatever the cache is missing, and gives each chapter the reading time of its log lines, also after a new import renamed its chapter file (IN-04). A normal start changes nothing, and a deleted, damaged or brand new cache fills itself again. A book that is no longer in `vault/books/` gets nothing back, and the index run takes its rows out of the cache; they come back with the book (LC-02).
- **Your Place and Your Settings Are in the Vault:** Each book keeps where the reader stopped, the chapter and the paragraph in the middle of the screen, in `vault/notes/<book-id>/bookmark.json` (`apps/desktop/src-tauri/src/vault/bookmark.rs`), and the reader settings, the theme included, live in `vault/preferences.json` (`vault/preferences.rs`). Both used to live only in the browser storage of the app window, so a release build, a new PC or a reinstall opened chapter 1 with the default settings, and the theme was never kept at all (DS-11). A book opens at its bookmark (`openingPlace`, `src/lib/readingPlace.ts`), the app opens the book of the newest bookmark, and the reader saves its place a second after the scrolling stops, only for the chapter whose words are on screen. The app starts once the settings are read (`PreferencesGate.tsx`). Settings that browser storage still holds from an older version are copied into the vault once, and settings or a bookmark that cannot be read are never saved over.
- **Your Answers Are Not in the Files an Import Makes:** The exit assessment of a book lives in `vault/notes/<book-id>/inspectional.json` (`apps/desktop/src-tauri/src/vault/inspectional.rs`). It used to be saved inside `_meta.json`, which the importer makes, so importing the book again wrote `exit_assessment: null` over it, and a save for a book with no blueprint in `_meta.json` wrote an empty blueprint that hid the one the app builds (DS-09). The app now only reads `_meta.json`; an assessment that an older build saved there is copied next to the notes the first time it is read. The open book's assessment shows as soon as it is saved (`src/lib/exitAssessment.ts`), and one that could not be read is never saved over. An import stops before it writes anything when the vault already has the book, that is `books/<book-id>/_meta.json` or files of the reader in `notes/<book-id>/` (`packages/ingestion/ingest/reimport.py`), and it names those files. `--force` on `ingest.cli` and on `process-inbox.py` replaces the book: the reader's files stay, but a paragraph they point to can then be a different paragraph. `process-inbox.py` reports a stopped book as `Stopped` and leaves its file in `inbox/`.
- **One Book per Book Id (IN-03):** A book id comes from the file name. It kept only the letters a-z and the digits, so an EPUB named "Война и мир" or "战争与和平" got the id `sample` and a PDF got `unnamed-book`, and names that differ only by a year or a tag, such as "Principles of Marketing 2020.pdf" and "Principles of Marketing 2023.pdf", got the same id. The import of the second file said that the vault already has the book, and `--force` then replaced the other book: its chapters, its title and its practice deck. Now letters with marks become plain letters ("Économie" gives `economie`), a name in another script gets a code of 8 characters from the name (`book-74b780f4`), and a plain name keeps its id (`ingest/book_id.py`). Every import records its file in `_meta.json` (`source`), and `ingest/book_source.py` finds the book that a file made, by its bytes or else by its file name, so a renamed copy and an annotated copy with the same name are the same book. A file whose book id belongs to a book from another file stops, even with `--force`, and the stop names that file and the two ways on: `--book-id <id>-<code>` to import a different book, or `--book-id <id> --force` to replace that book with a new copy of it (`ingest.cli` and `process-inbox.py`). A book that an import before this fix made has no `source`, so a new import stops and replaces it as before, and the stop says that the vault does not record its file.
- **One Line Ending (IN-06):** Every file that the import writes has `\n` line endings. Python on Windows wrote each `\n` as `\r\n`, so every chapter, `_meta.json`, practice deck, notes template and `_ledger.json` had Windows line endings. An EPUB book made on Windows can have `\r\n` inside its paragraphs, and those became `\r\r\n`: the chapter read back with pieces of paragraphs that had no anchor. The app finds paragraphs and footnotes at `\n`, so the card check took a whole chapter as the paragraph of a quiz card, the reader lost footnotes, and the notes preview showed the notes as one heading. Now the import reads the text of an EPUB book with `\n` line endings only, and writes every vault file with `\n` line endings, also on Windows (`ingest/line_endings.py`). A note with a line break is one footnote line, because the reader reads a footnote as one line. The app reads chapters and notes with `\n` line endings only (`vault/text_file.rs`): the reader, the notes pane, the card check and search. So a file with Windows line endings from an older import or from a text editor works too. `\r\n` and a lone `\r` become `\n`, as Python reads a text file. A book that an older import made from an EPUB book with Windows line endings keeps its broken paragraphs until it is imported again.
- **Cache Shape:** `PRAGMA user_version` holds the shape of `index.db`, and `CACHE_SCHEMA_VERSION` (`db/schema.rs`) is the shape this build knows. A file stamped higher was made by a newer build and is not opened, because a newer shape can hold things this build would drop. The vault keeps the study progress either way.
- **Newest Load Wins:** A book or a chapter is read from the disk, so its answer comes back a moment later. The reader takes a ticket for every load (`createLoadGuard`, `src/lib/readerLoads.ts`), and an answer that is no longer the newest one changes nothing. Before this, a slow chapter one showed its text and its highlights under chapter two, and a slow book left the open book and the book on screen pointing at different books, so notes and highlights were saved under the wrong book (DS-07). Opening a chapter also empties the reader at once, so the words of the chapter you left are never shown under the chapter you opened.
- **One Pane per Chapter:** `App.tsx` gives the notes pane a key of book and chapter, so every chapter gets its own pane with its own text. A pane that kept its text across a chapter change could save the notes of one chapter into the file of another (DS-07). What the reader typed is held together with the file it belongs to (`src/lib/notesAutosave.ts`) and is saved into that file when the chapter closes, so the last words are never left waiting in a timer.
- **A Quote Is Saved at Once:** "Add note" on a selection puts the quote at the end of the chapter notes and saves them right away (`addQuoteToNotes`, `src/lib/notesQuote.ts`), because a quote is a click, not typing. It used to change the text on screen only, so it reached the vault after the next keystroke and was lost at the next chapter change without one (DS-08). A quote waits while the notes are read from the disk, on screen as well, so the notes that arrive cannot wipe it; notes that failed to load never take a quote, and the reader is told.
- **One Writer per File:** The chapter notes `ch-XX-notes.md` hold only what the reader writes, and the notes pane is their only writer. Nothing parses a highlight out of Markdown any more, so no character in a quote can break the saved list (DS-06). Highlights live in `ch-XX-highlights.json`, and `vault/highlights.rs` is their only writer. Before this, both parts saved the same Markdown file, so a keystroke in the notes pane erased a highlight that had just been added (DS-05). A chapter that still keeps its highlights in the old `<!-- highlights-json ... -->` comment is moved over the first time it is read: the highlights and the quote lines the app wrote leave the notes file, and the reader's own headings and text stay.
- **Safe Vault Write:** Every write into the vault goes through `write_file` (`apps/desktop/src-tauri/src/vault/safe_write.rs`): the bytes go to a temporary file in the same folder, are flushed to the disk, and are then renamed over the target. A rename is one step, so a crash or a power cut leaves the whole old file or the whole new file, never an empty or cut-off one. A rename that fails because another program holds the file, such as the OneDrive client, is tried a few times before the save reports an error, and the temporary file is removed. `serde_json` is built with `preserve_order`, so a JSON object that the app reads and writes back, such as the settings, keeps its key order.
- **Names From the Page Stay in the Vault (SEC-03):** The commands made vault paths from the book id, the chapter file, the notes file and the topic id that the page sends, as they came. `Path::join` with an absolute path gives that path, and `..` climbs out of a folder, so code in the page could read and write any file on the computer, and `book-ingest --book-id ../../x` wrote a book outside the vault. Now `apps/desktop/src-tauri/src/vault/paths.rs` makes every such path, and it refuses a name that does not follow its rule:
  - A book id or a topic id has 1 to 255 characters from `a-z`, `0-9`, `-` and `_`, and does not start with `-`.
  - A chapter file is `ch-`, 2 or more digits and `.md`, such as `ch-01.md`.
  - A notes file is `ch-`, 2 or more digits and `-notes.md`, such as `ch-01-notes.md`.

  The id inside a topic file names its report, so it is checked too. A path must also still be in the vault when the links on the way to it are followed, so a book folder or a notes folder that is a link to another place is not used. Every name that the importer and the app make follows the rules; a book folder that was renamed by hand to another name does not open. The jobs that read every book (the copy of an older cache, the restore at startup and the newest bookmark) leave out a notes folder whose name is no book id or that is a link, so one such folder cannot stop them. The importer checks a book id with the same rule before it writes anything (`packages/ingestion/ingest/book_id.py`). `vault/escape_tests.rs` gives every command that takes a name `..` parts, absolute paths and linked folders, and checks that no file outside the vault is read or written.
- **Damaged Vault File:** A vault JSON file that cannot be parsed is never read as empty data, because the next save would write that empty data back. `read_json_file` (`apps/desktop/src-tauri/src/vault/json_store.rs`) removes a leading byte order mark, and a file it still cannot parse gives an error that names the file and is copied to `<file name>.corrupt-<time>`. `vocabulary.rs` and `analytical.rs` read through it, so both the load and the save fail and the file on disk is left exactly as it is.
- **One Copy of the App:** Only one copy of the app runs (`one_copy_only` in `apps/desktop/src-tauri/src/lib.rs`: the single-instance plugin, registered before every other plugin). A second start tells the open copy, which brings its window to the front, and the second copy ends before it opens a window or reads the vault or the cache. Before this, two copies could run at once. Analytical and syntopicon saves write the whole object that a copy holds in memory, so the copy that saved last wrote over the work of the other (DS-13). The desktop shortcut starts the program of the open app again, which brings it to the front, instead of stopping its dev server. Two starts less than about 2 ms apart can both run, because the first has not made its message window yet.
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
- **Programmatic Verbatim Validation:** Cross-checks that every `answer_key` exists as an exact character substring in the chapter text (`vault/books/<book-id>/<chapter_file>`). Non-verbatim or speculative cards are rejected. A card whose chapter file is missing or cannot be read is rejected too, because its answer cannot be checked; it used to be kept without the check (LC-02).
- **One Card per Question:** `card_identity` hashes (FNV-1a, 64 bit) the item type, the normalized question, and the normalized answer (a scenario answer without its option letter). The deck position, chapter file, and anchor are not part of the id, so a deck generated again keeps the progress of every unchanged question, and a changed question starts as a new card.
- **Upsert:** a stored card takes the deck's text, chapter, anchor, and payload and keeps its schedule. A new question starts as a new card, due now.
- **Archive, Never Delete:** a stored card whose question is no longer in the deck moves to `fsrs_cards_archive` with its progress, and it comes back with that progress when the question returns. A deck without any valid card changes nothing. The cards of a book that left the vault are archived as `book_not_in_vault` (`db/removed_books.rs`), and they come back with their progress when the book returns and its deck syncs (LC-02).
- **Older Rows:** rows with position-based ids from older builds get their question id on the next sync. When two rows hold the same question, the row with more reviews (then the later review) stays, the other row is archived as `duplicate`, and `review_logs` rows follow the question id.

### Cloze Card Generation (`packages/ingestion/ingest/cloze.py`)
The importer makes up to 8 cloze (fill-in) cards per chapter with `generate_chapter_practice_cards` (LE-07). The old rules also left out small words ("It is by", from "by means of"), bare numbers and labels ("9-1"), and terms that the rest of the sentence still showed. They made cards from tables and HTML, showed Markdown and footnote marks, and made no card for most chapters of a book without bold terms.
- **Sentences:** a card comes from a sentence of plain text: a paragraph, a list item, or a quote line. Tables, code, HTML blocks, images, and footnote texts give none, and neither does a sentence with an HTML tag, a link, a brace, a broken character, no small letter (a heading), or no sentence end. `exact_sentences` splits as `split_sentences` does, but keeps every sentence exactly as the chapter has it.
- **Answers:** a marked term, searched in this order: bold, "X is defined as / refers to / means / denotes / is characterized by / is considered", a quoted term, and "the purpose / principle / concept / role of X is". A leading "the", "a", or "an" stays outside the blank. The answer has 3 to 50 characters, holds a letter and no marks, does not end with a digit (a label such as "Table 13.2"), and neither starts nor ends with a small word (`STOPWORDS`).
- **Prompt:** the sentence as the reader shows it: no Markdown marks `*` `_` `` ` ``, no footnote marks `[^n]`, the book's `<` and `&`, and single spaces. It has one blank, and the answer shows nowhere else in it.
- **Every Chapter:** a chapter that has such sentences but no marked term gets one card for its most repeated term of 2 or 3 words, with no small word and no common word (`COMMON_WORDS`, for example number words and "chapter"). One word alone is too plain to be a key term. The card comes from the sentence with the best salience score that holds the term once.
- **Byte for Byte:** the answer is text of the chapter after Windows line endings become `\n`. The exact source is too, where a line break inside a paragraph counts as a space, as the reader shows it. The generator checks both before it uses a card, and the app checks the answer again when it syncs the deck.
- **Audit:** `audit-practice.py` checks every cloze card with the same rules: one blank that holds the answer key, an answer that is a term and text of the chapter, an exact source that is text of the chapter, and a prompt that shows the exact source with no marks and no second answer. A test keeps the rules of the audit and the importer the same.

### Tauri v2 IPC Interface (`apps/desktop/src-tauri/`)
All deck synchronization and review calculations are executed on background threads (`tokio::task::spawn_blocking`) without blocking the UI:

| Command | Signature | Description |
| :--- | :--- | :--- |
| `sync_practice_deck` | `(book_id: String) -> Result<usize, String>` | Scans `vault/notes/<book_id>/practice-deck.md`, verifies every card verbatim against its chapter Markdown (a card whose chapter cannot be read is left out), and syncs `fsrs_cards` with one card per question, archiving cards that left the deck. Returns the number of distinct questions. |
| `get_due_cards` | `(book_id: Option<String>, card_type: Option<String>, limit: Option<usize>, hybrid_ratio: Option<f32>) -> Result<Vec<PracticeCardItem>, String>` | Returns up to `limit` cards (default 50): due reviews first (`reps > 0 AND due <= now`, most overdue first), then new cards (`reps = 0`, in sync order) in the places that are left. A card rated Again is due 10 minutes later and then comes before all new cards. |
| `get_chapter_due_cards` | `(book_id: String, chapter_file: String, card_type: Option<String>, limit: Option<usize>, hybrid_ratio: Option<f32>) -> Result<Vec<PracticeCardItem>, String>` | Like `get_due_cards`, but only cards from one chapter file of one book. The Chapter Gatekeeper tests these cards before the reader leaves that chapter. The book id is required, because every book names its chapters `ch-01.md`, `ch-02.md`, ... |
| `submit_review` | `(card_id: String, rating: u8) -> Result<CardSchedule, String>` | Evaluates an FSRS-5 rating (1=Again, 2=Hard, 3=Good, 4=Easy), computes new stability, difficulty, state, and next interval, and commits to SQLite. One `IMMEDIATE` transaction reads the card, saves the new schedule, and adds a `review_logs` row with the book id of the card: both rows are saved or neither is, and the error is returned. A card without a book id is not reviewed. A second review of the same card (a double click) waits, then schedules from the first review. |
| `get_deck_stats` | `(book_id: Option<String>) -> Result<DeckStats, String>` | Aggregates deck volume, due count, learning vs. review ratios, and retention metrics. |

### Practice Suite & Gatekeeper UI Components
- **TopNav Practice Button:** Displays live due badge count. Opens distraction-free `PracticeModal.tsx` with Cloze and Scramble tabs.
- **Deterministic Cloze Drill:** Real-time character/word input validation, "Show Answer" reveal, 4-tier FSRS rating buttons with estimated next intervals, and a `Jump to §p-xxx` anchor navigation button that scrolls the reader canvas directly to the source sentence.
- **Scrambled Argument Drill:** Clickable badge pills allowing users to reassemble sentence clauses into proper sequence with deterministic verbatim order verification.
- **Reader Settings Popover (`SettingsPopover.tsx`):** Provides toggles for `gatekeeperMode` and a stepper for `dailyTarget` (5–100 cards), persisting `ReaderPreferences` to `vault/preferences.json`. Includes a manual "Sync Deck" action with live due counts.
- **Chapter Gatekeeper Workflow (`GatekeeperModal.tsx`, `hooks/useChapterGate.ts`, `lib/chapterGate.ts`):** a soft gate.
  - When Gatekeeper Mode is on, every move to a later chapter of the open book asks the gate first. The table of contents, the inspectional blueprint and dips, search hits, notes, analytical citations, and practice cards all open chapters through `openChapter` in `useBookSession.ts`. Moving back, staying in the chapter, opening another book, and moves at the syntopical level (which compares books) open the chapter at once (`gatedChapterFile`).
  - The gate tests up to `gatekeeperQuota` due cards of the chapter the reader leaves (`get_chapter_due_cards`), with the card type of the practice mode. When that chapter has no due cards, the chapter opens at once.
  - The gate is passed only when every card is right: rated Good or Easy, and for a scenario card, answered with the right option (`gatePassed`). Otherwise the window shows how many answers were right, and the reader stays in the chapter or continues anyway. "Skip Gatekeeper for now" is the explicit override, and the close button keeps the reader in the chapter.
- **Session Walk (`lib/practiceSession.ts`):** `PracticeModal` walks a session copy of the due cards, and `GatekeeperModal` walks a copy of the first `gatekeeperQuota` due cards of the chapter it tests. The copy follows the loaded cards until the first rating, then stays fixed, because each rating removes the card from the `usePracticeDeck` due list. Closing either window resets its session.

---

## 5. Desktop Reader Core: As-Built Implementation (Phase 2)

### Tauri v2 IPC Interface (`apps/desktop/src-tauri/`)
All disk I/O operations are offloaded from the Tauri main thread using `tokio::task::spawn_blocking` to preserve unblocked UI responsiveness. A book id, chapter file, notes file or topic id that a command gets must follow the rules of `vault/paths.rs` before it is part of a path (SEC-03):

| Command | Signature | Description |
| :--- | :--- | :--- |
| `get_vault_status` | `() -> Result<VaultStatus, String>` | Where the vault folder is (`path`), how it was found (`foundBy`), or the message to show when there is none. `VaultGate.tsx` asks this before the app starts. |
| `choose_vault_folder` | `() -> Result<Option<VaultStatus>, String>` | Opens a folder picker and remembers the choice. `None` means the reader closed it without choosing; a folder with no `books` inside is refused with a message. |
| `get_library_books` | `() -> Result<Vec<BookMetadata>, AppError>` | Scans `vault/books/*/` for `_meta.json`, returning dynamic library manifest with `id` (the name of the book folder, LC-02), `title`, `author`, `chapter_count`, and `total_words`. |
| `list_books` | `() -> Result<Vec<BookSummary>, String>` | Scans `vault/books/` and parses available `_meta.json` records. |
| `load_book_meta` | `(book_id: String) -> Result<String, String>` | Reads `vault/books/<book_id>/_meta.json` as JSON string. |
| `load_chapter` | `(book_id: String, chapter_file: String) -> Result<String, String>` | Reads chapter Markdown text (`ch-XX.md`) from the vault. It also lets the window load the pictures in the `assets` folder of each book, because the asset protocol opens no file on its own (`vault/book_pictures.rs`, SEC-02). |
| `load_notes` | `(book_id: String, notes_file: String) -> Result<String, String>` | Reads `vault/notes/<book_id>/<notes_file>` (auto-scaffolds starter template if missing). The notes file is the notes of a chapter, such as `ch-01-notes.md` (SEC-03). |
| `save_notes` | `(book_id: String, notes_file: String, content: String) -> Result<(), String>` | Persists user reflection notes to `vault/notes/<book_id>/<notes_file>`. The notes file is the notes of a chapter, such as `ch-01-notes.md` (SEC-03). |
| `get_chapter_highlights` | `(book_id: String, chapter_file: String) -> Result<Vec<HighlightItem>, String>` | Reads `vault/notes/<book_id>/<chapter>-highlights.json`. A chapter that still keeps its highlights in the old notes comment is moved over once, keeping the reader's own text. |
| `save_chapter_highlights` | `(book_id: String, chapter_file: String, highlights: Vec<HighlightItem>) -> Result<(), String>` | Writes `vault/notes/<book_id>/<chapter>-highlights.json`. It never touches the chapter notes, and a damaged highlights file stops the save. |
| `get_bookmark` | `(book_id: String) -> Result<Option<Bookmark>, String>` | Reads `vault/notes/<book_id>/bookmark.json`: the chapter file, the paragraph in the middle of the screen (`^p-xxx`), and when it was saved. `None` for a book the reader has not read; a damaged file is an error and is copied. |
| `save_bookmark` | `(book_id: String, chapter_file: String, anchor: Option<String>) -> Result<(), String>` | Writes where the reader is in a book. A damaged bookmark file stops the save. |
| `get_last_bookmark` | `() -> Result<Option<BookBookmark>, String>` | The newest bookmark of all books, with its `bookId`, which names the book the app opens with. A bookmark that cannot be read is passed over. |
| `get_preferences` | `() -> Result<Option<Map<String, Value>>, String>` | Reads the reader settings from `vault/preferences.json`. `None` when none are saved yet; a file that is damaged or holds no JSON object is an error and is copied. |
| `save_preferences` | `(preferences: Map<String, Value>) -> Result<(), String>` | Writes the reader settings key for key, keeping settings this build does not know. A damaged settings file stops the save. |
| `get_inspectional_exit_assessment` | `(book_id: String) -> Result<Option<ExitAssessmentPayload>, String>` | Reads the reader's exit assessment from `vault/notes/<book_id>/inspectional.json`. `None` when there is none; a damaged file is an error and is copied. An assessment that an older build saved in `_meta.json` is copied there once. |
| `create_syntopic_topic` | `(title: String, description: String) -> Result<SyntopicTopic, String>` | Creates an empty topic in `vault/syntopicon/topics/<topic-id>.json`, with the id made from the title. A title whose file is already there, readable or not, is refused with a message that names the file and the topic in it, so a new topic never replaces one (DS-12). A title with no letter or digit gets the first free `topic-<n>` file. |
| `save_syntopic_topic` | `(topic: SyntopicTopic) -> Result<(), String>` | Writes a topic into its own file, `vault/syntopicon/topics/<topic.id>.json`. The app uses it for the open topic; a new topic goes through `create_syntopic_topic`. |
| `save_inspectional_exit_assessment` | `(book_id: String, assessment: ExitAssessmentPayload) -> Result<(), String>` | Writes the exit assessment into `vault/notes/<book_id>/inspectional.json`, keeping keys this build does not know. It never writes `_meta.json`, and a damaged file stops the save. |

### Frontend Component Hierarchy (`apps/desktop/src/`)
The desktop client is structured around a single-chapter virtualized TipTap canvas:

```
App.tsx (Global state: reader settings with the theme, viewMode, activeBook, activeChapter)
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
- `src/lib/markdown.ts`: Parses chapter Markdown into a document of the reader's nodes with markdown-it (`src/lib/markdownNodes.ts`, `markdownInline.ts` and `markdownTables.ts`), block by block. It separates the footnote texts, gives the first node of each block the anchor of the block (`data-anchor="p-xxx"`, the attribute form of `^p-xxx`), and makes each footnote marker a footnote node (`data-fn="n"`) (RD-03).
- `src/lib/anchors.ts`: Converts paragraph anchors between the saved form (`^p-xxx`) and the HTML attribute form (`p-xxx`) with `toSavedAnchor` and `toAnchorAttribute`.
- `src/lib/citations.ts`: Where a passage of a book is, for everything the reader saves with a place. `citationAnchorAt(doc, pos)` gives the anchor to cite for a place in a chapter document, `citationPlace` shows a citation as `ch-04.md #^p-012` (or the chapter alone when it has no anchor), and `savedWord` builds the vocabulary entry of a word with the chapter and the anchor where it was read. The app never writes an anchor of its own (RD-04).
- `src/lib/readerText.ts`: `readerText` gives the text of a chapter document as the reader shows it, with the document position of each character: a new block and a line break start a new line, and a footnote marker is its number in brackets (`footnoteLabel`, which `FootnoteRef` also shows). A highlight saves its words from this text, and `highlightRanges` finds them in it again (RD-02).
- `src/lib/readerLoads.ts`: Loads a book at the place where the reader stopped (`loadBookOnto`) or a chapter (`loadChapterOnto`) onto the reader. Every load takes a ticket from `createLoadGuard`, and only the newest ticket may show its answer, report its failure, or name the chapter a new highlight belongs to. The reader is emptied the moment a chapter opens.
- `src/lib/readingPlace.ts`: Where the reader stopped. `openingPlace` gives the chapter and paragraph a book opens at (its first chapter when the saved chapter is gone), `startingBookId` the book the app opens with (the newest bookmark, then the book an older version kept in browser storage, then the first book), `paragraphAtMiddle` the paragraph a place is saved at, `createPlaceWatcher` reports the place a second after the scrolling stops, for the chapter whose words are on screen, and `createBookmarkKeeper` never saves over a bookmark that could not be read. A jump into a chapter that has just opened lands at once; a jump inside the open chapter scrolls there.
- `src/lib/readingTime.ts`: Reading time. `createReadingTimer` counts the seconds the words of a chapter are on screen while the window has focus, in ticks of 1 second (a longer gap, as when the PC sleeps, counts 5 seconds at most). It saves the time in pieces of 15 seconds, and the rest when the next chapter shows. A scroll only tells it how far down the chapter on screen you are: 90% completes the chapter, and a scroll reported for the chapter you left does not count (AN-01).
- `src/lib/reviewDays.ts`: Review days. The cache sends the reviews in 15-minute blocks of time. `reviewsPerDay` puts each block on the day it starts in the time zone of the window, `heatmapWeeks` gives the heatmap columns from Monday to Sunday with today in the last column, `reviewStreaks` gives the current and the longest streak, and `reviewsInLastDays` gives the count next to the heatmap title. They count days on the calendar, not in steps of 24 hours, so a day when the clocks change is one day (AN-02).
- `src/lib/analyticsText.ts`: The numbers of the analytics window as text. `retentionText`, `countText`, `completedChaptersText` and `readingTimeText` show a dash for a number the app does not have, and never a default, so a real 0 shows as 0. `chapterName` and `bookName` name a reading row by its titles, and by its file or folder name only when there is no title (AN-03).
- `src/lib/preferences.ts`: The reader settings. `loadPreferences` reads them from the vault and copies the settings browser storage still holds into the vault once; `createPreferencesSaver` saves 400 ms after the last change, one save at a time with the newest settings last; `themeOf` and `withTheme` keep the reading theme among the saved settings.
- `src/lib/notesAutosave.ts`: The chapter notes autosave. `change` holds the text together with the notes file it was typed in and saves it when the typing stops; `flush` saves what is waiting right now, which the notes pane does when the chapter closes and for a quote.
- `src/lib/notesQuote.ts`: `addQuoteToNotes` puts a quote from the selection menu at the end of the chapter notes and saves them at once. `quoteBlock` is the text it adds: a blank line, the quote with its paragraph anchor, and an empty `- Reflection:` line.
- `src/lib/readerLocation.ts`: Resolves a location (book id, chapter file, anchor) to the book and chapter to show with `resolveLocation`, loading the location's own book when another book is open. Every book names its chapters `ch-01.md`, `ch-02.md`, ..., so a search hit keeps its `book_id` (`searchResultLocation`).
- `src/lib/chapterGate.ts`: Chapter Gatekeeper rules. `gatedChapterFile` gives the chapter a move must pass (only a move to a later chapter, at every level except syntopical), and `gatePassed` passes a gate run only when every card was rated Good or Easy and no scenario answer was wrong.
- `src/lib/readerShortcuts.ts`: Gives every reader keyboard shortcut one owner, so one key press runs its action once. `appShortcut` is the App window listener (Ctrl+K or Cmd+K search, Alt+P pacer, ? or F1 Field Guide), and `elementaryCanvasShortcut` is the elementary canvas listener (`[` and `]` pacer speed, elementary level only). Alt+P, ? and F1 do nothing in inputs, textareas, and editable elements.
- `src/lib/searchQuery.ts`: `isSearchable` tells the Omni-Search palette whether a typed search has at least `MIN_SEARCH_CHARACTERS` (2) characters. The backend (`src-tauri/src/db/search_query.rs`) uses the same minimum and finds nothing for a shorter search.
- `src/lib/searchSnippet.ts`: A search result snippet is plain text with the private-use characters U+E000 and U+E001 (`HIT_START`, `HIT_END`) around each hit. `snippetParts` splits it into text and hits, and `snippetNodes` gives the search window React text with a `<mark>` around each hit, so book text never becomes HTML there (SEC-01). `src-tauri/src/db/search_text.rs` uses the same characters, and a Rust test checks that the two files agree.
- `src/lib/tableOfContents.ts`: `contentsTarget` gives the chapter and the paragraph that an entry of the contents opens: the chapter file and the anchor that the import wrote into the entry, or for a part with no file the place of its first sub-entry (CQ-01). Titles are never compared, because chapters can share a title. `contentsOpenChapters` is false for a book imported before CQ-01, whose contents name source files, and the sidebar then shows the chapter list.
- `src/lib/bionic.ts`: Bionic reading on a chapter document: the first 40–50% of the letters of each word are bold, as a fixation point for the eye. Code, superscripts and footnote markers stay as they are.
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

Unit tests never open this database or the real vault: in test builds, `get_db_path()` and `find_vault_root()` resolve only inside a per-test temporary sandbox (`apps/desktop/src-tauri/src/test_support.rs`) and return an error when no sandbox is active. The vault search (`locate_vault()`) takes only a folder inside that sandbox, so a test run from the repository never finds the real vault above its working folder (DS-10).

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
| `index_vault` | `() -> Result<IndexSummary, String>` | Reads the chapters in the spine of every `vault/books/*/_meta.json`, splits them into paragraphs, and indexes a chapter into SQLite FTS5 when its text changed (a content hash) or it has no rows yet. Each row holds the words of its paragraph as plain text: HTML tags and comments are left out, and character references become their characters (`db/search_text.rs`, SEC-01). The hash also holds the form of the rows, so a chapter indexed before SEC-01 is read again once. So a chapter with no paragraphs, such as a part title, is read again on every run. Each book is written in a transaction of its own, and the rows of books and chapters that left the vault are removed. A book is known by its folder name, and the study rows of a book that left the vault leave the cache too (`db/removed_books.rs`, LC-02). Returns the chapters and paragraphs indexed, the files it could not read (`problems`, each with the file and the reason), the renamed book folders (`renamed_books`, each with the folder and its old name), and the time taken. The window runs it when the app opens and when the reader clicks "Rescan library" in the book list (`updateSearch`, `src/lib/searchIndex.ts`; DS-13, SI-02). |
| `search_vault` | `(query: String) -> Result<Vec<SearchResult>, String>` | Queries `search_index` using BM25 ranking. Each `snippet()` is plain text with the private-use characters U+E000 and U+E001 around each hit and holds no HTML; the window shows it as text (`src/lib/searchSnippet.ts`, SEC-01). `db/search_query.rs` turns the typed search into a valid FTS5 expression, and a search shorter than 2 characters returns no results. Returns up to 30 matches. |

**One Broken Book Stops Nothing (SI-02):** `index_vault_blocking` (`db/indexer.rs`) reads and writes each book on its own. A `_meta.json` or a chapter that cannot be used (not valid JSON, no `spine`, a chapter with no `id` or `file_path`, text that is not UTF-8, a locked file) is left out and named in `IndexSummary.problems`, and its book or chapter keeps the rows that search read last, because a file in OneDrive can be locked or offline for a moment. Before this, the whole run was one transaction that stopped at the first file it could not read. The edits in every other book stayed out of search, and the error went only to the console, without the name of the file. The rows of a book folder that is gone or has no `_meta.json`, of a chapter that `_meta.json` no longer lists, and of a listed chapter whose file is missing are removed, so a deleted book no longer shows in search. When an entry of the books folder cannot be read, the run removes no book. Only one run goes at a time, so a run that read the vault before an import cannot remove the rows that a newer run wrote for the new book. The files that a run could not read share one line in the error bar.

**A Book Is Its Folder (LC-02):** The app knows a book by the name of its folder in `vault/books/`, the name that every file read uses: `books/<id>/` for the book and `notes/<id>/` for the notes and study progress of the reader (`book_id_of`, `vault/reader.rs`). The library used to take the `book_id` in `_meta.json` while the index took the folder name. So after a folder was renamed, the library listed a book that no chapter load could find, and search hits named a book that the library did not list. A renamed folder now opens as a new book. The notes and study progress under its old name stay in the vault and do not show, so the index run names the folder in the error bar, with the name to give it back (`renamed_books`): a folder whose `_meta.json` names a book that has a notes folder and no book folder. A book whose folder is gone or has no `_meta.json` has left the vault, and the index run takes its study rows out of the cache (`db/removed_books.rs`): its cards move to `fsrs_cards_archive` as `book_not_in_vault`, and its review history and reading time leave the cache. So "All Books" analytics and practice no longer count it. Before this, no study row was ever removed. The vault is not changed. When the book returns, its cards come back with their progress when its deck syncs, and the next start puts back its review history and reading time; until the book returns, a start puts nothing back for it. The study rows stay when the books folder itself is missing, or when an entry of it cannot be read.

**Reading Time, Not Reading Speed (AN-01):** The app sees how long the words of a chapter are on screen and how far down it you scrolled. It cannot see how many words you read. It used to save the word count of the whole chapter with every piece of reading time, so a chapter that was open for 20 seconds showed 21,357 words a minute. The analytics now show the reading time and the completed chapters, with no word count and no reading speed. An older line of `reading.jsonl` still holds a `wordsRead`, which is not read back, and the `words_read` column of the cache is no longer used. The old timer counted in steps of 5 seconds and started again at every scroll, so with a scroll every 3 seconds it kept 5 of 48 seconds. One timer now counts every focused second while the words of a chapter are on screen (`src/lib/readingTime.ts`). A chapter also kept the scroll position of the chapter before it, so it could open near its end and get the "Completed" mark of the chapter you left. A chapter now opens at its top, and only a scroll of the chapter on screen can complete it.

**Review Days in Your Time Zone (AN-02):** The cache counted the reviews of each UTC day, and the heatmap named its days with `toISOString`, which gives the UTC day of a local midnight. In British Summer Time (UTC+1), today's reviews did not show, each cell showed the count of the day before, and the rows were not the weekdays of their labels. On the days the clocks change, one day showed twice and one day was missing. The cache cannot know the time zone of the window. So it now counts the reviews in each 15-minute block of time (`get_review_heatmap`, `StudyAnalytics.review_blocks`), and the window puts every block on a day of its own time zone (`src/lib/reviewDays.ts`). Every time zone is a whole number of 15-minute blocks from UTC, so a midnight never falls inside a block. The heatmap rows go from Monday to Sunday and its last column ends today. The streak counts the same days, and the count next to the heatmap title counts the reviews of the past 365 days, not every review ever made.

**Only Numbers the App Has (AN-03):** The analytics window showed made-up numbers. A retention rate of 0% showed as "90.0%", because the window took 0 as no number, and with no reviewed card the cache itself sent a default of 90%. "Due Today" counted every card that was never reviewed, so it showed 51 of the 51 cards of a deck with 1 review. The reading table named each chapter by its file name, because the cache sent no titles, so "All Books" showed two rows called `ch-01.md`, and it divided the finished chapters by the chapters of the open book. Now `retention_rate` is `null` when no card was reviewed, and the window shows a dash for it (`src/lib/analyticsText.ts`). "Reviews Due" counts the reviewed cards whose due time has passed, which are the reviews practice gives first (`db/due_cards.rs`), and the new cards show apart under it. Each reading row names its book and its chapter with the titles in `_meta.json`, and `total_chapters` counts the chapters of the book, or of every book in the vault for "All Books". The vault word card still estimates the reading time of the vault at 225 words a minute, marked with `~`.

**Search Results Are Text (SEC-01):** The search window put each result into the page as HTML, and the index held each paragraph as the chapter file has it. A book whose text held a tag such as `<img src=x onerror=...>` could run a script in the window when you searched a word near it. The tags that the PDF import writes showed as broken text: "sup" and "br" found the tag names, and a result that ended inside a tag lost its last words, like the text after "Water<Less". Now the index keeps the words only (`db/search_text.rs`). A tag or a comment is left out, and between two words it becomes a space, so `96<sup>29</sup>` is still found by "96" and by "29". A `<` that starts no tag, as in "Water<Less", stays, and a character reference such as `&lt;` becomes its character. A snippet marks each hit with the private-use characters U+E000 and U+E001, and the window shows it as text with a `<mark>` only around each hit (`src/lib/searchSnippet.ts`). The rows hold their form in the chapter hash, so the index reads every chapter again once. The EPUB import writes book text that looks like HTML as text (see "Book Text That Looks Like HTML").

**Search Result Contract (`SearchResult`):**
```rust
pub struct SearchResult {
    pub book_id: String,
    pub chapter_file: String,
    pub anchor: String,
    pub snippet: String, // plain text, U+E000 and U+E001 around each hit (SEC-01)
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
  color?: string;      // Color token (yellow, amber, emerald, blue, purple; any other shows yellow)
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

**Highlights Show on Their Own Words (RD-02):**
A highlight was a mark in the chapter document, on the first text node that held all of its words. A highlight over bold or italic text, a footnote marker, a line break or two blocks found no such text node, so it was saved but never showed. With Bionic reading on, every word is two text nodes, so no highlight showed. Words that a paragraph holds more than once always showed on their first copy, and the mark kept no color and no id. And no text in the reader could be selected at all: the app turns text selection off everywhere, and a refactor (5fd97d7) had removed the `select-text` class that turned it on again for the chapter, so no highlight, note or word lookup could start from a selection. The document positions below are used only while a selection is saved and while the highlights are drawn. They are never saved.

**Saving a Selection (`createHighlight`):**
1. `useReaderSelection` finds the document positions of the selected text with `posAtDOM`. A selection that starts above the chapter or ends below it keeps only its part in the chapter.
2. `createHighlight` reads the text of the chapter document as the reader shows it (`readerText`, `src/lib/readerText.ts`): a new block and a line break start a new line, a footnote marker is its number in brackets, such as `[1]`, and a picture has no text.
3. `exact` is the selected text with no white space at its ends. `prefix` and `suffix` are up to 32 characters before and after it, also from the blocks around it. They come from the place of the selection, so a selection of words that the chapter holds more than once saves the text around its own copy. The old version saved the text around the first copy in the paragraph.

**Drawing the Highlights (`highlightRanges`, `components/reader/ReaderHighlights.ts`):**
- **Over the Text:** the `ReaderHighlights` plugin draws each highlight as a ProseMirror decoration: a `<mark class="reader-highlight">` with `data-hl-id` and `data-color`, over the text, the marks and the footnote markers of its words. The chapter document does not change, so Bionic reading and highlights do not affect each other, and a highlight also shows in code.
- **Finding the Words:** `highlightRanges` looks for the words in the text of the chapter with no white space, so a line break, a new block, and the white space that an older version saved do not count. A highlight goes in the block of its anchor when that block holds its words, otherwise anywhere in the chapter (RD-01). When the words are there more than once, it goes on the copy whose text before and after it matches the most of `prefix` and `suffix`, then on the first of the best copies. A highlight whose words are no longer in the chapter shows nowhere.
- **No New Parse:** `Reader.tsx` gives the list to the plugin (`showHighlights`) and sets the chapter only when its text or Bionic reading changes. A new highlight shows at once, and the plugin draws the highlights again for each new document.
- **Colors:** yellow, amber, emerald, blue and purple (`index.css`). Any other color shows in yellow, and the text keeps the color of the theme.
- **The Same Words With the Same Text Around Them:** two such copies in one block, or where there is no anchor, cannot be told apart, so the highlight shows on the first. On 72 real chapters, 10,798 of 10,800 random selections came back on the same characters, with Bionic reading off and on; the other 2 were such copies in a heading.

### What One Scroll Costs (RD-06)
- **One report for each whole percent:** the page sends a scroll event for every few pixels it moves, and each report of the progress changes a state of the app, which draws the app again. `createProgressTicker` (`src/lib/readerProgress.ts`) keeps the percent it reported last, so 201 scroll events down a chapter make 101 reports, one for each whole percent. Another chapter reports its own percent again, even the same number.
- **One options object for the editor:** TipTap looks at the options after every render of the reader and compares each one by identity (`EditorInstanceManager.compareOptions`, `@tiptap/react`). The reader used to build `editorProps` inside its render, so TipTap set the options again and the editor gave ProseMirror the whole chapter state again. `readerEditorOptions` (`components/reader/readerEditorOptions.ts`) builds them once, from a click handler that `useCallback` makes once, and `Reader.tsx` holds them in a `useMemo`.
- **The footnotes of the chapter are a ref:** only a click in the chapter reads them, so a new chapter needs no render for them, and the click handler stays the same one.
- **The reader is memoized:** `React.memo` draws the reader again only for new props of its own. Every handler that the app gives it is made once (`useCallback` in `App.tsx` and `hooks/useBookSession.ts`), because one handler built during a render would undo the memo.
- **Measured (dev build, the sample chapter, 201 scroll events):** the reader was drawn 101 times and is now drawn once, a second after the scroll, when the place settles; TipTap set the options 101 times and now never; ProseMirror took the chapter state again 101 times and now never. The progress on screen is the same: 100 changes, ending at 100%. The scroll took 1,342 ms and now takes 1,114 ms.
- **Still parsed once:** a chapter switch and a Bionic toggle parse the chapter and give the editor a new document. That parse takes 12-31 ms for the chapters of the vault, whose biggest chapter holds 51,086 words in 255 blocks and whose deepest holds 800 blocks and 2,665 nodes. A new highlight parses nothing (RD-02).

### Omni-Search Command Palette (`apps/desktop/src/components/OmniSearchModal.tsx`)
- **Keyboard-Driven Interaction:** Global listener toggles modal via `Ctrl + K` (Windows/Linux) or `Cmd + K` (macOS), with Arrow keys for selection, `Enter` to navigate, and `Escape` to dismiss.
- **Debounced Sub-Millisecond Search:** Queries are debounced by 150ms and dispatched asynchronously via `search_vault`.
- **Search Syntax (`src-tauri/src/db/search_query.rs`):** A search needs at least 2 characters: for a shorter search the palette shows a hint and sends nothing (`isSearchable` in `src/lib/searchQuery.ts`). Every word and every quoted phrase goes to FTS5 as a string, so words with inner punctuation (`don't`, `well-known`, `U.S.`) match the book text, and a word with hyphens (`e-mail`) also finds its spelling without them (`email`). A word also matches longer words (`labo` finds `labour`) when its last part has at least 2 letters or digits, or when it ends in `*`; a word that ends in other punctuation (`C++`) or in a 1-letter part (the `t` of `don't`) matches only itself. `"quotes"` search an exact phrase. `AND`, `OR`, and `NOT` in capitals are operators (`war NOT peace`); lowercase `and`, `or`, and `not` are words. Words with no operator between them must all match, and a `NOT` with no word before it finds nothing.
- **Snippets as Text (SEC-01):** A result snippet is plain text with U+E000 and U+E001 around each hit. `snippetNodes` (`src/lib/searchSnippet.ts`) shows it as React text with a `<mark>` around each hit, so a tag in a book shows as text and never runs. The index keeps the words of each paragraph without its HTML (`src-tauri/src/db/search_text.rs`), so the names of tags such as `sup` and `br` are not found.
- **Cross-Book Anchor Navigation:** Search covers all books, and every book names its chapters `ch-01.md`, `ch-02.md`, ..., so each result shows its book title and keeps its `book_id`. Selecting a result calls `navigateToCrossBookCitation` with `searchResultLocation(result)`; `resolveLocation` (`src/lib/readerLocation.ts`) loads the result's own book when another book is open. The reader then switches the active chapter (maintaining single-chapter DOM virtualization), waits for DOM mounting, and smoothly scrolls to the target paragraph anchor (`^p-xxx`) with a brief amber flash (`bg-amber-100/50`).

### High-Resolution Figure Lightbox & Split-View Jump (`apps/desktop/src/components/FigureLightboxModal.tsx`)
- **Interactive Figure Cards:** ProseMirror editor intercepts diagram clicks on reader images and mounts an accessible full-screen Lightbox modal.
- **Pan & Zoom Controls:** Provides smooth zoom-in, zoom-out, 1:1 reset, and keyboard navigation (`+`, `-`, `0`, `Escape`).
- **Original Page Split-View Integration:** Readers can click **"View in Split View"** directly inside the Lightbox modal to switch the application to dual-pane mode, displaying the pristine publisher PDF page side-by-side with the Markdown text canvas.

### Verification & Performance Benchmark Standard
- **Anchor Integrity:** Verified via `python .agent/skills/audit-anchors.py`. An import runs the same check before a book goes into the vault (IN-05).
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
- **Rescan library:** The button under the book list reads the library again, shows it, and then updates search (`rescanLibrary`, `src/lib/libraryRescan.ts`). A book imported while the app is open used to stay out of the list and out of search until the next start (DS-13). The list does not wait for search. The note under the button names the new books, says that search is updated, and counts the files that search could not read, which the error bar names (SI-02). It does not count chapters, because the index reads a chapter with no paragraphs again on every run. A failed read or index shows in the error bar, and the other half still runs.
- At startup the app opens the book of the newest `vault/notes/<book-id>/bookmark.json` (DS-11). The browser storage key `book_engine_active_book_id` is only read, for a reader who has no bookmark yet.
- Switching books cleanly dismounts the current chapter, loads the new manifest, reloads the hierarchical Table of Contents, and opens the chapter and paragraph where the reader stopped in that book (chapter 1 for a book not read yet).

### The Reader Shows What the Chapter File Holds (`apps/desktop/src/lib/markdown.ts`)
The reader made HTML from chapter Markdown with regular expressions. It had no rule for lists and tables, and TipTap knew no superscript, so a list, a numbered list and a table showed as one run-on paragraph, and the price `96<sup>29</sup>/32` showed as "9629/32". Only a paragraph kept its anchor, so a quote lost its anchor. `2 * 3 * 4` became italic, and `_word_` kept its marks (RD-03). Now:
- **Parser:** markdown-it (CommonMark, with the tables and the strikethrough of GitHub) reads each block of a chapter: the text between two blank lines, as the import, the book check and search read it. `parseChapterMarkdown` gives a document of the reader's nodes (`readerExtensions`, `components/reader/readerExtensions.ts`), never HTML.
- **Blocks:** a list, a numbered list (from its first number), a table (with its header row, the alignment of each column and its `<br>` line breaks), a quote, a heading, a picture, and the `<pre>` text of an EPUB book show as such. The first node of a block keeps the anchor of the block (`BlockAnchors`), so a note, a jump and a highlight find a list, a table and a quote.
- **Tags (`markdownInline.ts`):** a tag that the reader has a mark for becomes that mark: `<sup>` a superscript, `<mark>` a highlight, and `<b>`, `<strong>`, `<i>`, `<em>`, `<s>`, `<del>` and `<code>` as in a browser. `<br>` is a line break. A tag with no closing tag in its block does nothing. Any other tag is left out, and the words around it stay, but the text of `<script>` and `<style>` does not show. No text of a book becomes HTML.
- **No Lost Words (`markdownTables.ts`):** a table leaves out each cell that a row has beyond the cells of its header row. The PDF import can end the last row of a table with the sentence that follows the table in the book, so that text shows as a paragraph below the table, and any other extra cell joins the last cell of its row.
- **White Space:** a line break or a run of spaces in a paragraph is one space, and a paragraph starts and ends with no space, as before. Highlights and cards find the same text.
- **Bionic Reading and Highlights:** `applyBionicReading` (`src/lib/bionic.ts`) changes the document, as its HTML version changed the HTML. The saved highlights are drawn over the document, so they show with Bionic reading on (see "Highlights Show on Their Own Words", RD-02).
- **Headings:** a heading of a chapter file has no anchor, because the owner chose to change only the reader. A heading that has an anchor in its chapter file keeps it.

### Polished TipTap Paragraph Anchors
- Raw paragraph anchors (`^p-001`, `§p-001`) are stripped from the text of each block when chapter Markdown becomes a document.
- Parsed into headless custom node attributes (`<p data-anchor="p-001">`) by the `BlockAnchors` extension, on every block that a chapter file can anchor: a paragraph, a heading, a quote, a list, a numbered list, a code block, a line and a table (RD-03).
- **The anchor that a citation names (RD-04):** a term, an argument, a critique, an inquiry, a topic citation and a vocabulary word keep the anchor of the block that holds the passage, from the chapter document (`citationAnchorAt`, `src/lib/citations.ts`). Two blocks have no anchor of their own: a heading, which takes the anchor of the first block under it, because a heading opens the text under it; and the second and later node of one block of the file, which takes the anchor of the block before it. When a chapter holds no anchor at all, the reader saves no citation and the error bar says why. A modal that opens from a button of the workbench, with no selection, names the paragraph on screen. The app writes no anchor of its own: it used to write `^p-001`, the first block of the chapter, wherever it did not know one.
- Saved data (chapter Markdown, notes, citations, practice cards) keeps the `^p-001` form. Code converts between the two forms only with `src/lib/anchors.ts`: text selection saves `toSavedAnchor(data-anchor)`, and highlight placement, anchor navigation, the pacer, the focus ruler, and gutter badges find paragraphs with `toAnchorAttribute`.
- Displayed via CSS pseudo-element (`.reader-prose [data-anchor]::before`) as a subtle, muted `§` glyph in the left margin (`left: -1.75rem`) that smoothly reveals on paragraph hover without polluting text selection or clipboard payloads.

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
- **FSRS Retention Heatmap:** Renders a 52-week GitHub-style annual activity grid visualizing card reviews submitted per day, with intensity tiers, cell hover tooltips, and study streak statistics (current streak, longest streak, total yearly reviews). A day is a day of the window's time zone, the rows go from Monday to Sunday, and the last column ends today (`src/lib/reviewDays.ts`, AN-02).
- **Retention Statistics Cards:**
  - **Reviews Due:** Reviewed cards whose due time has passed: the reviews practice gives first (`reps > 0 AND due <= now`). The new cards show apart under the number, with the daily target (AN-03).
  - **Mastered Cards:** Cards that have graduated to mature stability ($\ge 21$ days).
  - **Retention Rate:** The share of the reviews not rated Again. With no review history, the average of the canonical power-law retrievability formula $R(t, S) = (1 + 19/81 \cdot t/S)^{-0.5}$ over reviewed cards. A dash when no card was reviewed (AN-03).
- **Reading Time & Progress:**
  - The reading timer counts the seconds the words of a chapter are on screen while the window has focus (`src/lib/readingTime.ts`). A scroll never starts the count again.
  - A chapter is completed once you scroll $\ge 90\%$ down it while its words are on screen. A chapter opens at its top, so it never takes the scroll position of the chapter before.
  - Chapter-by-chapter table (time spent, completion status). There is no word count and no WPM: the app cannot see how many words you read (AN-01). Each row shows the chapter title from the book's spine, and "All Books" also shows the book title. "Completed Chapters" counts against the chapters of the book, or of every book in the vault for "All Books" (AN-03).

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
    words_read INTEGER NOT NULL DEFAULT 0, -- not used since AN-01
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
| `get_study_analytics` | `(book_id: Option<String>) -> Result<StudyAnalytics, String>` | Returns complete analytics: the reviews in 15-minute blocks of time (`review_blocks`, which the window puts on days of its time zone, AN-02), card counts grouped by state (New, Learning, Review, Relearning), retention rate % (`null` when no card was reviewed), mastered cards, the reviews due now (`reviews_due`) and the new cards apart (`new_cards`), and total vault words / estimated reading time (AN-03). |
| `load_all_book_notes` | `(book_id: String) -> Result<Vec<ChapterNoteFile>, String>` | Scans `vault/notes/<book_id>/` in strictly read-only mode, returning all raw chapter notes files. |
| `export_summary` | `(book_id: String, content: String) -> Result<String, String>` | Writes arbitrary compiled executive summary string directly to `vault/notes/<book_id>/summary-export.md`. |
| `get_review_heatmap` | `(book_id: Option<String>) -> Result<Vec<ReviewBlock>, String>` | Queries the `review_logs` table in `index.db` and returns the number of reviews in each 15-minute block of time (`started_at`, `count`). The window puts each block on a day of its own time zone (AN-02). |
| `get_retention_metrics` | `(book_id: Option<String>) -> Result<RetentionMetrics, String>` | Computes due today, mastered cards, and FSRS power-law retrievability $R(t, S)$ retention % (`null` when no card was reviewed, AN-03). |
| `get_reading_velocity` | `(book_id: Option<String>) -> Result<ReadingVelocityStats, String>` | Aggregates reading time and completed chapters across chapters. There is no word count and no WPM: the app cannot see how many words you read (AN-01). Each row names its book and chapter with the titles in `_meta.json` (`book_title`, `chapter_title`), in book and reading order, and `total_chapters` counts the chapters of the book or of every book in the vault (AN-03). |
| `record_reading_progress`| `(book_id: String, chapter_file: String, seconds_spent: u64, completed: bool) -> Result<(), String>` | Writes a piece of reading time and whether the chapter is completed to the vault study log, then to `index.db`. No word count (AN-01). |

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
- **Content Security Policy & Asset Scope (SEC-02):** The app window had no content security policy (`"csp": null`), and the asset protocol could open every file on the computer (`"scope": ["**"]`). So a tag that a book put into the page could run a script, and that script could read any file. Now `app.security.csp` holds these rules:
  - `default-src 'self'` and `script-src 'self'`: only the script files of the app run. An inline script, an event attribute such as `onerror`, a `data:` script and code in a string (`setTimeout("...")`) are blocked.
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` and `font-src 'self' https://fonts.gstatic.com`: the stylesheet of the app, the style element that TipTap adds to the page, and the two fonts from Google Fonts that `index.html` loads.
  - `img-src 'self' asset: http://asset.localhost`: pictures come from the app and from the asset protocol, never from the internet or a `data:` address.
  - `connect-src 'self' ipc: http://ipc.localhost`: the calls to the app backend.
  - `object-src 'none'`, `base-uri 'none'` and `form-action 'none'`.

  `assetProtocol.scope` is empty, so on its own the asset protocol opens no file. `load_chapter` lets it open the picture folder of each book in the vault, `books/<book>/assets` (`src-tauri/src/vault/book_pictures.rs`). A book folder or a picture folder that is a link is left out, because Tauri follows the link when it allows a folder. Tauri applies the policy only in the built app: `tauri dev` loads the page from the Vite server, which sends no policy. `index.html` must not hold a `<style>` element, because Tauri would give it a nonce, and a browser ignores `'unsafe-inline'` next to a nonce. `src-tauri/src/security_config_tests.rs` checks the policy, the empty scope and `index.html`.
- **Only the Plugins the App Needs (SEC-04):** The app loaded the shell plugin, and nothing used it. The plugin gave page code five commands that start programs, write to them, stop them and open links (`execute`, `spawn`, `stdin_write`, `kill` and `open`), and only a missing permission in `capabilities/default.json` kept page code from them. It also put a script into every page that sends a click on a link with `target="_blank"` to its `open` command, and the page has no such link. The app now loads two plugins: dialog, for the folder picker that `choose_vault_folder` opens (LC-01), and single-instance (DS-13). `src-tauri/src/security_config_tests.rs` fails when `Cargo.toml` names any other plugin, so a new plugin goes into its list with the job that it does.
- **The Editor Library Without the `__proto__` Hole (SEC-05):** `npm audit` reported 27 moderate warnings, all from one TipTap advisory (GHSA-cp6q-959q-f8rh): `mergeAttributes` turned a `__proto__` key of its input into the prototype of the merged attributes, and ProseMirror then set the keys of that object as attributes of the element, such as `onerror`. The app now uses TipTap 3.31.3, and `npm audit` finds nothing. TipTap 2.27.3, which the app used before, already holds the same guard, and the reader was never open to the hole: the reader's nodes and marks keep only the attributes they know, so a chapter file cannot put a `__proto__` key into `mergeAttributes`. The app also names `@tiptap/core` itself, because its nodes, marks and plugins come from that package. The starter kit of TipTap 3 holds four parts that the reader turns off (`readerExtensions.ts`), so the reader shows exactly what a chapter file holds: a link and an underline (a chapter file has neither, RD-03), the list keys, and the trailing node, which would add an empty paragraph to a chapter that ends with a table or a list. `src/lib/readerEditor.test.ts` fails when the app asks for or installs a TipTap older than 3.30.4, when the attack of the advisory sets an attribute, when the reader gets another node, mark or writing part, or when a plugin changes a chapter document.

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
Extends the spaced repetition subsystem beyond cloze recall with quiz cards that follow the author's argument. A quiz card quotes a passage and asks which sentence comes right after it in the book.

**What Comes Next (LE-06):** The quiz cards used to ask for "the analytically valid conclusion". But every wrong option was a true sentence of the same chapter, so a reader who picked a true sentence was marked wrong. The right option was also never D, and a wrong option could say the same thing as the right one. Now a card asks a question with exactly one right answer: the sentence that comes right after the passage. The wrong options are sentences of the same chapter, so they are about the same subject, but they do not come there.

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
   ### Scenario: sc-ch-01-001
   - **Chapter:** ch-01
   - **Anchor:** ^p-003
   **Scenario:** Which sentence comes right after this passage in the book?
   "Every sentence of paragraph ^p-003 but the last."
   - [ ] (A) A sentence of another paragraph of the chapter.
   - [ ] (B) A sentence of another paragraph of the chapter.
   - [ ] (C) A sentence of another paragraph of the chapter.
   - [x] (D) The last sentence of paragraph ^p-003.
   > **Rationale:** Right after this passage, the book says: "The last sentence of paragraph ^p-003."
   ```
2. **SQLite Schema & Migration (`db/schema.rs`):**
   - Idempotently adds `card_type TEXT DEFAULT 'cloze'` and `payload TEXT DEFAULT NULL` via `PRAGMA table_info(fsrs_cards)`, and creates `fsrs_cards_archive`.
   - `sync_practice_deck_blocking` (`db/deck_sync.rs`) stores each card under its question id (`card_identity`) and uses `INSERT ... ON CONFLICT(card_id) DO UPDATE SET ...` to preserve the review state, reps, and stability of unchanged questions. Cards that left the deck move to `fsrs_cards_archive` with their progress.
3. **Anti-Bias Shuffling (`ScenarioCardView.tsx`):**
   - Randomizes option presentation order on mount via Fisher-Yates shuffle while retaining immutable option keys (`A`, `B`, `C`, `D`) for deterministic evaluation.
   - The Chapter Gatekeeper shows the options in the order of the deck. The deck spreads the place of the right option over A to D with a hash of the card id and the right sentence, so every import puts it in the same place (LE-06).
   - Gates FSRS rating bar until user submits an answer; pre-suggests `Again` (rating 1) on incorrect evaluations.
4. **Audit Grounding (`audit-practice.py`):**
   - Verifies citation anchor exists in chapter text.
   - Verifies `> **Rationale:**` contains a verbatim quote matching the cited paragraph text.
   - Format validation: exactly 1 `[x]` and at least 2 `[ ]`.
   - The question is "Which sentence comes right after this passage in the book?", and a quoted passage follows it (LE-06).
   - Every option is text of the cited chapter, compared without the Markdown marks `*` `` ` `` `_` `#` and with single spaces. The right option comes right after the passage in the cited paragraph, and no two options say much the same thing: one holds the other, or they are at least 0.65 alike (`difflib`).
5. **Autonomous Ingestion Generation (`ingest/scenarios.py`):**
   - Autonomous extraction during EPUB and PDF intake via `generate_chapter_scenario_cards(chapter_markdown, chapter_id, max_items=3)`.
   - Takes the top-scoring paragraphs of two or more sentences. The last sentence is the right option, and the sentences before it are the passage. A paragraph of one sentence has no passage, so it makes no card.
   - Takes the wrong options from other paragraphs of the chapter, best keyword overlap first. None comes from the paragraph right after the passage, and none is a near-copy of the right option or of another wrong option.
   - Uses only text that ends like a sentence, with `.`, `!` or `?` and maybe a closing quote or bracket, for every option. Text that the import cut off, or that ends with an image link or a footnote mark, is no option.
   - Places the right option with a hash, so the right options of a deck spread over A to D.
   - Zero-hallucination guarantee: every option (`A`, `B`, `C`, `D`) is a sentence of the chapter without its Markdown marks, and the generator checks this against the chapter before it uses a sentence. The rationale quotes the right sentence as the chapter has it.
   - Integrated into `pipeline.py` and `pdf_parser.py`, and formatted side-by-side with Cloze cards in `vault/notes/<book-id>/practice-deck.md`.
6. **Practice Modality Filtering & Dynamic Retrieval (`due_cards.rs`, `usePracticeDeck.ts`):**
   - Reader settings allow toggling between `verbatim` (Cloze/Scramble recall), `mcq_scenario` (quiz cards that ask what comes next), and `hybrid` (Balanced dual-modality).
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
   - A new topic never replaces one. Its file name comes from its title (`topic_id_from_title`), so titles that differ only in capitals or punctuation need the same file. `create_syntopic_topic` refuses a title whose file is already there, readable or not, and names the topic in it. Before DS-12 the page saved an empty topic over that file.
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
3. **Vector 3 (Zero-Hallucination & Dual-Modality Guardrail):** Confirms that every answer key and rationale quote is an exact character substring in the cited chapter, and that every quiz option is text of the cited chapter without its Markdown marks (LE-06), and that every cloze answer is a term and its prompt shows the exact source with no marks and no second answer (LE-07); enforces that library practice items feature both Cloze recall and deductive Scenario MCQ cards.
4. **Vector 4 (Backend Safety):** `cargo check` and `cargo test` in `apps/desktop/src-tauri` with zero errors and zero failing unit tests. Unit tests run inside a temporary sandbox vault and database (`src/test_support.rs`), never the real ones.
5. **Vector 5 (Frontend Safety):** TypeScript strict typecheck in `apps/desktop` with zero errors.
6. **Vector 6 (FTS5 Search Latency Benchmark):** SQLite FTS5 query latency average strictly $< 15.0\text{ms}$.
7. **Vector 7 (Desktop Runtime Launch Smoke Test):** Launches compiled native release binary headlessly and confirms window stability for 5.0 seconds.
8. **Vector 8 (Inspectional Parity - Level 2):** Audits `_meta.json` structural blueprints, pivotal chapters, non-overlapping head/tail dip sampling pairs, preview snippet hygiene, and the Adlerian exit assessments in `vault/notes/<book-id>/inspectional.json`.
9. **Vector 9 (Analytical Parity - Level 3):** Audits `vault/notes/*/analytical.json` for verified specialized terms, argument premise-to-conclusion graphs, Stage III evaluative critiques (Adler Rules 9–12), and author inquiry solutions.
10. **Vector 10 (Syntopical Parity - Level 4):** Audits `vault/syntopicon/` neutral terminology translations, universal questions, cross-book author perspectives, and multi-book citation anchor grounding.
11. **Vector 11 (Elementary Parity - Level 1):** Audits `_meta.json` readability metrics (`flesch_kincaid_grade`, `avg_sentence_length_words`, `estimated_reading_minutes`) within physiological bounds and confirms chapter-to-spine word count consistency.
12. **Vector 12 (Modularity & Vault Ephemeral Isolation):** Enforces Directive 1.1 (confirms zero SQLite databases or ephemeral caches leaked inside `vault/`) and Directive 4 (verifies that all source files in `apps/desktop/src/` and `packages/ingestion/ingest/` adhere to the $\le 300$-line modular ceiling).



