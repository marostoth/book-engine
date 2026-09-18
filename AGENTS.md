# Agent Directives: Local Book Engine & Reader

You are acting as a Principal Systems & Frontend Engineer specializing in local-first desktop applications, deterministic NLP, and high-performance text parsing.

## 1. Non-Negotiable Operational Guardrails

1. **Markdown Vault is Ground Truth:**
   - The user's Markdown vault (`vault/`) is the sole permanent record.
   - SQLite (`index.db`) is strictly an ephemeral query accelerator and search cache. It MUST be placed in OS AppData (`app_cache/`), NEVER inside the user vault.
   - If `index.db` is deleted, the system MUST be capable of rebuilding the entire index purely from the vault files.

2. **Zero-Hallucination & Verbatim Practice Standard:**
   - Practice items (Cloze, Scrambled Clauses, Q&A) MUST be 100% deterministic and extractive.
   - Every answer key must be programmatically verified as an exact character substring of the source chapter text before persistence.
   - Generative synthesis or speculative questioning without source citations is strictly prohibited.

3. **DOM Virtualization & Rendering Safety:**
   - Never load multi-chapter books simultaneously in the frontend DOM.
   - Render ONLY one chapter at a time in TipTap/ProseMirror to ensure 60+ FPS scrolling and sub-10ms input response.

4. **Highlight Anchoring Standard:**
   - Do NOT use absolute character-count offsets or volatile DOM tree paths.
   - Store highlights using the W3C Text Quote Selector standard (`exact`, `prefix`, `suffix`).

---

## 2. Technology & Language Standards

### Rust (Tauri v2 Backend)
- **Tooling:** Tauri v2, `sqlx` (or `rusqlite`), `notify` crate for file watching.
- **Safety:** Explicit error handling via `thiserror` and `anyhow`. Do not use `.unwrap()` or `.expect()` in non-test paths.
- **Concurrency:** Execute disk I/O, SQLite FTS5 queries, and hashing on background threads (`tokio::task::spawn_blocking`). Keep the IPC message loop unblocked.
- **Line Endings:** Read a chapter or notes file with `read_text_file` (`vault/text_file.rs`) before you split it into paragraphs or lines. It gives `\n` line endings only (IN-06).
- **Chapter Files Get New Names:** A new import can rename the chapter files of a book. The reading time in the cache follows `reading.jsonl` (`db/restore.rs`), and no chapter name goes from the cache into the vault (`db/backfill.rs`, IN-04).

### Python (Ingestion Pipeline)
- **Tooling:** Python 3.11+, `mypy` strict mode, `pytest`.
- **Parsing:** `ebooklib` + `beautifulsoup4` for EPUBs, `pymupdf4llm` for PDFs, `pydantic` for schema validation.
- **A Formula Says What the Book Says:** A symbol font can name its characters wrongly, so an "=" comes out as a "1/4" and an "x" as a broken character. `repair_glyph_maps` (`ingest/glyph_repair.py`) gives such a font a correct map in the open document before any text is read, and `ingest/pdf_parser.py` calls it right after it opens the file. A new bad font needs an entry in `FONT_GLYPHS` and `FONT_CODES`, and you prove each glyph by cutting it out of the page as a picture, never by guessing. A chapter that still holds a broken character fails the book check, so it never reaches the vault (CQ-02).
- **A Document of Nothing but Notes Is No Chapter:** never decide what a document of an EPUB is by the end of its file name. The import used to drop every document ending in `notes`, `endnotes`, `footnotes` or `backmatter`, so a real chapter named `ch03-fieldnotes.xhtml` was lost and a document that says `epub:type="endnotes"` but is named `rear.xhtml` was read twice. `documents_of_only_notes` (`ingest/note_documents.py`) decides it by what the document holds: the book says so in `epub:type` or `role`, on the body or on the one and only block inside it, or taking out every note that another document already shows as a footnote leaves nothing but headings. Read the notes of the whole book before the first chapter, so the answer never depends on the order of the spine. Where the rule cannot be sure, keep the document: losing a chapter is the fault, and a note read twice is the smaller harm. Say which document makes no chapter and why (IN-07).
- **A Citation Points at Its Passage:** a dossier is written to `vault/syntopicon/reports/`, so a link from it to a passage climbs two folders (`../../books/<book-id>/ch-04.md#^p-001`) and carries the paragraph anchor. Never write such a link from where the repository starts, and never leave the anchor out. A citation is free text, so `place_of` (`vault/syntopicon_check.rs`) puts the book id and the chapter file through `check_book_id` and `check_chapter_file` first, and a name that breaks the rule gets no link at all. `check_citation` reads the quote back from the paragraph it names, comparing letters and digits only, as `words_of` in `ingest/places.py` does. The report says how many quotes are still there and marks the rest; saving a topic is never refused, because a book may have left the vault. Check a report link by following it, not by matching its shape: the audit's old pattern checked nothing once the app wrote the report (CQ-06).
- **The Ledger Says What the Books Say:** `vault/_ledger.json` records each file the inbox took in and how many chapters and words the book it made has. Those numbers went stale, because only the inbox wrote them and a book imported again from the command line changed only its `_meta.json`. Read and write the file only through `ingest/ledger.py`, never with a second copy of the code. `keep_numbers_true` runs at the end of `ingest_epub` and `ingest_pdf`, so the numbers follow the book whoever imports it. An import never adds a line: only the inbox takes a file in, because only the inbox knows the file it moved into `inbox/processed/`. Vector 1 of the audit compares every line with its book and leaves out a line whose book is not in the vault (CQ-05).
- **A Chapter Has Something to Read:** a page of a book that holds nothing but a title is no chapter. A reader would open it and find nothing, and it makes no practice card, because it holds no sentence. `holds_no_text` (`ingest/chapter_shape.py`) knows such a page, and its headings go to the top of the chapter they introduce, so no word is lost. The name of that chapter is then its own: `chapter_name` takes the first heading, except when that heading names a division of the book (`DIVISION_TITLE`) and the heading after it names a chapter (`CHAPTER_TITLE`). A division that carries words of its own keeps its name. An entry of the contents that opens no chapter and groups no other entry is dropped (`without_entries_that_lead_nowhere`). A long paragraph is never cut: the 2,760-word paragraph of The Wealth of Nations is one paragraph in the EPUB, so cutting it would put breaks in the book that the book does not have (CQ-04).
- **A Sentence Stays Whole:** a page break, a picture, a photo credit or the title of a story box can cut a sentence in two, and a reader cannot highlight, quote or study half a sentence. `stitch_layout_blocks` (`ingest/layout_stitcher.py`) joins the halves and moves what stood between them after the whole sentence, and it repeats until nothing more joins. A join is refused when the second half opens with a bare word ending such as "ers", because that is the tail of another line and a wrong join would put words in the book that the book never wrote. `repair_page_text` (`ingest/text_repair.py`) takes the page's own marks off the text: the book's own `<mark>` highlight, a heading with no words, a word a hyphen and a space cut in two, and a lost first letter. A first letter goes back only when exactly one capital turns the stem into a word the chapter already uses, never by guessing (CQ-03).
- **Determinism:** Normalization must be idempotent. Re-running ingestion on the same file must generate identical Markdown and paragraph anchors.
- **Line Endings:** Parse an EPUB document with `read_html` and write every vault text file with `write_text_file` (`ingest/line_endings.py`), so vault files have `\n` line endings on every system (IN-06).
- **EPUB Text:** Write each kind of XHTML element in `html_to_markdown_blocks` (`ingest/epub_parser.py`). A block of a chapter file never holds a blank line, a paragraph is one line, and only a link to a note becomes a footnote (`ingest/endnotes.py`, IN-02).
- **Reader Files Follow the Text:** An import that replaces a book reads its old chapters before it writes anything (`read_book_text`). `BookBuild.put_in_vault` finds the moves (`reader_moves`, `ingest/places.py`) in the new chapters of the build folder, and they go into the vault with the book, before a notes template. A new kind of reader file in `vault/notes/<book-id>/` that names a chapter or a paragraph needs a move there (IN-04).
- **Build, Check, Then Put in Place:** An import writes a book only into its build folder (`BookBuild`, `ingest/book_build.py`), and it changes other vault files only through `VaultChanges` (`ingest/vault_changes.py`), so a failed import changes nothing. A file that an import makes holds nothing that changes from one import to the next, such as a time (IN-05).
- **Pinned Versions:** Install the dependencies from `packages/ingestion/requirements.lock`. When you change a version, change the lock, run `pytest packages/ingestion/tests`, and compare the files of a real book that you import before and after the change (IN-05).

### TypeScript / Frontend
- **Tooling:** React 18+, TipTap 3 / ProseMirror, Tailwind CSS, Floating UI.
- **Anchors:** Never write a paragraph anchor that the app does not have. A citation, a topic citation and a vocabulary word keep the anchor of the block of the passage (`citationAnchorAt`, `src/lib/citations.ts`), an empty anchor when the app does not know one, and never a default such as `^p-001` (RD-04). `src/lib/citations.test.ts` fails when a file that saves such data holds an anchor of its own.
- **The Work of One Scroll:** The reader is memoized (`React.memo`), so every handler that the app gives it is made once with `useCallback`. Never build the options of the editor inside a render: TipTap compares them by identity and would give ProseMirror the whole chapter state again (`readerEditorOptions`, `components/reader/readerEditorOptions.ts`). A scroll reports a percent only when the whole number changes (`createProgressTicker`, `src/lib/readerProgress.ts`). `src/lib/readerEditor.test.ts` and `src/lib/readerProgress.test.ts` fail when the reader loses the memo, holds options of its own, counts a percent on its own, or gets a handler that was made during a render (RD-06).
- **Editor Library:** Keep every `@tiptap/*` package at the same version, 3.30.4 or later, the first version without the `__proto__` hole of `mergeAttributes` (GHSA-cp6q-959q-f8rh, SEC-05). After a change, `cd apps/desktop && npm audit` must find nothing. The reader takes from the starter kit only the parts that a chapter file uses, so `readerExtensions.ts` turns off a new part of a newer kit; `src/lib/readerEditor.test.ts` fails when the reader gets another node, mark or part.
- **Typing:** Strict mode enabled (`noImplicitAny: true`, `strictNullChecks: true`).
- **Editor:** Markdown AST transformations must occur through headless custom nodes.
- **Chapter Documents:** The reader shows a chapter as a document of the nodes in `readerExtensions` (`components/reader/readerExtensions.ts`). `parseChapterMarkdown` (`lib/markdown.ts`) makes it from markdown-it tokens, block by block, and the first node of each block keeps the anchor of the block. Never build chapter HTML as a string. A new kind of block or tag in a chapter file needs a node or a mark there, and a test that shows it in a document that fits the reader's nodes (RD-03).
- **Highlights:** Draw a saved highlight over the chapter as a decoration (`ReaderHighlights`, `components/reader/ReaderHighlights.ts`), never as a mark in the chapter document. `createHighlight` saves the words of a selection from the text of the chapter document (`readerText`, `lib/readerText.ts`), and `highlightRanges` finds them there again with white space not counted. A new inline node that shows text needs that text in `readerText` (RD-02).

---

## 3. Verification Protocol

Before declaring any task or phase complete:
1. Run the anchor integrity check: `python .agent/skills/audit-anchors.py vault/books/<book-id>`
2. Run pipeline tests: `pytest packages/ingestion/tests/`
3. Verify that search benchmarks pass under 15ms: `python .agent/skills/benchmark-fts.py`
4. Verify verbatim practice integrity: `python .agent/skills/audit-practice.py`

---

## 4. Execution Rules

- **Process Hygiene**: Never leave dev servers, Vite watchers, or background test instances running after completing a task. Always terminate background processes or run builds headlessly.
- **Architecture Synchronization**: Whenever a task introduces new features, modifies core components, or creates/deletes/renames/relocates files, update both the 'As-Built Directory Manifest' and the relevant feature specifications in `ARCHITECTURE.md` to reflect current disk reality before staging commits. Never introduce duplicate utility or model directories.
- **Batch Intake Protocol**: When the user asks to 'Process new books', execute `python .agent/skills/process-inbox.py`. Report the results table and confirm quarantined binaries in `inbox/processed/`. A book that the vault already has is reported as `Stopped`, and its file stays in `inbox/`: report it, and run with `--force` only when the user asks for that book to be replaced. A file whose book id belongs to a book from another file is also `Stopped`: report both files, and ask the user whether it is a different book (run the `--book-id` command that the stop gives) or a new copy of that book (run the `--force --book-id` command). A book that fails the anchor and footnote check is `Failed`: report the problems that the script names. The vault did not change, and the file stays where it is.
- **System Audit Protocol**: When the user requests 'Run audit', 'Audit project', or 'Check system health', immediately execute `python .agent/skills/audit-system.py`. Do not manually inspect files; rely entirely on the orchestrator's output and present the final diagnostic table.
- **Modular File Rule**: Maintain a soft ceiling of ~300 lines per file. When components or modules exceed 300 lines (e.g., `Reader.tsx`, `commands.rs`), refactor out custom hooks, helper utilities, or child subcomponents to ensure high AI diffing fidelity and maintain clean separation of concerns.
