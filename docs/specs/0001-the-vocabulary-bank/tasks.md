# Tasks: The vocabulary bank

**Spec:** `docs/specs/0001-the-vocabulary-bank/spec.md`
**Plan:** `docs/specs/0001-the-vocabulary-bank/plan.md`

Format: `[ID] [P?] [Story] Description`. `[P]` means the task touches different files from its neighbours and
can run beside them. Every task names its exact file. Tests come before the code they prove.

## Phase 1: Setup (Shared Infrastructure)

- [x] **T001** [P] Put this folder on `DOCUMENT_FOLDERS` in
  `packages/ingestion/tests/test_the_docs_match_the_code.py`, as two entries: the `README.md` and the `*/*.md`
  of each feature folder. A folder of documents that is not on that list is checked by nothing, which has
  already happened twice.
- [x] **T002** [P] New guard `packages/ingestion/tests/test_the_specs_are_usable.py`: every feature folder holds
  the three files of the loop, the numbering has no gaps and no repeats, the folder name matches the title, the
  status is one of the three allowed words, the README table and the folders agree on both, `spec.md` holds
  every mandatory heading, and `spec.md` names no file, language or library.

## Phase 2: Foundational (Blocking Prerequisites)

Nothing in Phase 3 can be reached until the window can ask for the words.

- [x] **T003** Add `get_book_vocabulary` to `apps/desktop/src-tauri/src/commands.rs`. It runs on
  `tokio::task::spawn_blocking` and calls `crate::vault::get_book_vocabulary`, the same shape as
  `save_book_vocabulary` two functions above it.
- [x] **T004** Add it to `generate_handler!` in `apps/desktop/src-tauri/src/lib.rs`.
- [x] **T005** Add its row to the backend command table of `ARCHITECTURE.md`.

**No new test for these three.** `packages/ingestion/tests/test_no_dead_commands.py` already fails when a
command is defined and not registered, registered and never called, or reached only by the browser stand-in.
`packages/ingestion/tests/test_the_docs_match_the_code.py` already fails when a registered command is missing
from the table. Writing a fourth guard for the same three faults would be a copy, not a check.

## Phase 3: User Story 1 - Read back the words I saved (Priority: P1) 🎯 MVP

**Goal:** every word a reader saved in a book is on screen, with its meaning and its place, and one click goes
back to the paragraph.

**Independent test:** save three words in one book, open the drawer, filter to words, see all three.

### Tests for User Story 1

- [x] **T006** [P] [US1] `apps/desktop/src/lib/vocabularyEntries.test.ts`: the newest word is first; a word with
  no chapter lands in the last group; a word whose chapter is not in the spine lands there too; an empty anchor
  stays empty; the chapter title and order come from the spine.
- [x] **T007** [P] [US1] Add the vocabulary cases to `apps/desktop/src/lib/backendShapes.test.ts`: a damaged word
  is dropped and the good ones are kept; a word that is not an object is dropped; a missing meaning reads as
  empty rather than refusing the file.
- [x] **T008** [P] [US1] `apps/desktop/src/components/NotesDrawer.test.tsx`, first line
  `// @vitest-environment jsdom`: the words appear with the highlights, the Words filter shows the words only,
  the counts are on screen, and a click on a word asks to open its chapter at its anchor.

### Implementation for User Story 1

- [x] **T009** [US1] `vocabularyFrom` in `apps/desktop/src/lib/backendShapes.ts`, next to `highlightsFrom` and
  built the same way: one damaged word is dropped, the rest are kept.
- [x] **T010** [US1] `getBookVocabulary` in `apps/desktop/src/lib/api/lexiconApi.ts`, calling the new command
  and passing the answer through `vocabularyFrom`.
- [x] **T011** [P] [US1] The browser-mode answer in `apps/desktop/src/lib/api/dev/fallbackLexicon.ts`, wired in
  `apps/desktop/src/lib/api/dev/devBackend.ts`.
- [x] **T012** [US1] Add `"word"` to `item_type` on `AggregatedNoteItem` in `apps/desktop/src/lib/types.ts`.
- [x] **T013** [US1] `apps/desktop/src/lib/vocabularyEntries.ts`: saved words plus the book's spine become
  drawer entries, newest first, with one last group for a chapter the book does not have.
- [x] **T014** [P] [US1] How a word looks in `apps/desktop/src/components/notes/NoteEntryCard.tsx`: the word,
  then its meaning. Not a quotation and not a note.
- [x] **T015** [P] [US1] The Words filter and its count in `apps/desktop/src/components/notes/DrawerFilterBar.tsx`.
- [x] **T016** [US1] `apps/desktop/src/components/NotesDrawer.tsx` asks for the words as well as the notes,
  merges them, and tells the reader when the words could not be read instead of showing none.

**Checkpoint:** User Story 1 works on its own. Nothing below is needed for it.

## Phase 4: User Story 2 - The list is up to date while I read (Priority: P2)

**Goal:** a word saved while the drawer is open appears in it.

**Independent test:** open the drawer, save a word, see it without reopening.

### Tests for User Story 2

- [x] **T017** [P] [US2] `apps/desktop/src/lib/vocabularySaves.test.ts`: a listener hears a saved word, a
  listener that has gone away hears nothing, and two listeners both hear.

### Implementation for User Story 2

- [x] **T018** [US2] `apps/desktop/src/lib/vocabularySaves.ts`: a list of listeners, `onVocabularySaved` to
  join and a function to leave.
- [x] **T019** [US2] `apps/desktop/src/components/elementary/LexiconPopover.tsx` tells the listeners after a
  save that worked, and the dead `onSavedVocabulary` prop goes away in the same change.
- [x] **T020** [US2] `apps/desktop/src/components/NotesDrawer.tsx` listens while it is open and loads the words
  again.

## Phase 5: Polish & Cross-Cutting Concerns

- [x] **T021** [P] The save button in `apps/desktop/src/components/elementary/LexiconPopover.tsx` says where the
  word goes in plain words, not by naming a file on disk.
- [x] **T022** [P] The two new source files go into the As-Built Directory Manifest of `ARCHITECTURE.md`. The
  manifest guard fails on a source file that is not there, and it reads git, so it says nothing until the files
  are staged.
- [x] **T023** Tick RD-10 in `docs/review/2026-09-14-findings.md` with the fixing commit, and set the status of
  0001 in `docs/specs/README.md`.
- [x] **T024** `npm run check` green, the vault snapshotted before and after, and every new guard broken on
  purpose one at a time to prove it catches what it claims.

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 stands alone and can land first.
- Phase 2 blocks Phase 3. Without the command there is nothing to read.
- Phase 3 blocks Phase 4. There is no list to keep fresh until there is a list.
- Phase 5 comes last, because T022 and T023 name files that Phases 3 and 4 create.

### Within each user story

Tests before the code they prove. T009 before T010, because the call passes its answer through the check.
T012 before T013 and T016, because both use the type. T013 before T016.

### Parallel Opportunities

T001 and T002 together. T006, T007 and T008 together. T011, T014 and T015 together. T021 and T022 together.

## Implementation Strategy

**MVP first.** Phases 1 to 3 give the reader every saved word, searchable, grouped and clickable. If the work
stopped there, RD-10 would be closed. Phase 4 removes a rough edge; Phase 5 pays the debts.

## Notes

- The vault function and its 10 tests are already written. No Rust test is added for reading the words, because
  the reading is already tested; what was missing was the door, and the door has a guard of its own.
- The review finding says the vault function has 9 tests. **It has 10.** Six of them read, four write.
