# Implementation Plan: The vocabulary bank

**Spec:** `docs/specs/0001-the-vocabulary-bank/spec.md`
**Branch:** `feat/vocabulary-bank`

## Summary

The words are already written to `vault/notes/<book-id>/vocabulary.json`, and the vault function that reads
them back already exists with 10 tests. Nothing calls it. This plan adds the one missing command, checks the
answer before the window believes it, and shows the words in the drawer that already holds the highlights and
the notes of the same book.

## Technical Context

**Language and version:** Rust 2021 with Tauri v2 for the backend; TypeScript 5 with React 18 for the window.
**Storage:** the vault. `vault/notes/<book-id>/vocabulary.json`, a plain JSON list.
**Testing:** `cargo test` through the sandbox of `apps/desktop/src-tauri/src/test_support.rs`, `vitest` for the
window, `pytest` for the guards that read the source files.
**Target platform:** the desktop app. The window also runs in a browser against the fallback backend.

### What is already there

| Piece | Where | State |
|---|---|---|
| Read the words of a book | `apps/desktop/src-tauri/src/vault/vocabulary.rs` | done, 10 tests |
| Save a word | `apps/desktop/src-tauri/src/commands.rs` | done, registered |
| Read the words from the window | nothing | **missing** |
| A screen that shows them | nothing | **missing** |
| A per-book drawer with search, filters and jump-to-paragraph | `apps/desktop/src/components/NotesDrawer.tsx` | done, holds highlights and notes |

So the work is one command, one shape check, one mapping, and three small changes to the drawer.

## Constitution Check

*GATE: must pass before the first line of code. Re-checked after the design below.*

The rules are in `AGENTS.md` and `docs/rules/`. Each row names the rule, what it forces on this feature, and
the test that fails if it is broken.

| Rule | What it forces here | Test that catches it |
|---|---|---|
| **Concurrency** (`docs/rules/backend.md`) | The new command reads a file, so it runs on `tokio::task::spawn_blocking`, the same as `save_book_vocabulary`. | reading the command |
| **Safety** (`docs/rules/backend.md`) | No `.unwrap()` and no `.expect()`. The error becomes a `String` for the window. | `cargo clippy` |
| **Nothing From Outside Is Believed** (`docs/rules/frontend.md`) | The list of words is `unknown` until `apps/desktop/src/lib/backendShapes.ts` checks it. A damaged word is dropped and the rest are kept, the way `highlightsFrom` already does. | `packages/ingestion/tests/test_frontend_stays_tidy.py` |
| **Anchors** (`docs/rules/frontend.md`) | A word saved with no paragraph keeps an empty anchor. Never `^p-001`. | `apps/desktop/src/lib/citations.test.ts` |
| **A Component Gets a Component Test** (`docs/rules/frontend.md`) | The drawer change gets a `.test.tsx` beside it, with `// @vitest-environment jsdom` on line 1. Plain mapping functions get a `.test.ts` in `apps/desktop/src/lib/`. | `packages/ingestion/tests/test_one_check.py` |
| **One Place Per Setting, One Context Per Concern** (`docs/rules/frontend.md`) | **This one fails the obvious design.** See below. | `packages/ingestion/tests/test_frontend_stays_tidy.py` |

### The gate stopped the obvious design

`LexiconPopover` already takes an `onSavedVocabulary` callback that nothing passes. The obvious fix is to pass
one down: `App.tsx` gives it to `Reader`, `Reader` gives it to the popover.

**That is not allowed.** `ReaderProps` is capped at 21 props, and the cap may go down but never up. The cap
exists because prop drilling through `App.tsx` is what RD-09 found. A 22nd prop on the reader, to carry one
word from a popover to a drawer, is exactly the fault the cap was measured to stop.

So the word does not travel as a prop. A small module, `apps/desktop/src/lib/vocabularySaves.ts`, holds a
list of listeners. The popover says a word was saved; the drawer listens while it is open. Neither `App.tsx`
nor `Reader` learns anything about vocabulary, and no prop count changes. The dead `onSavedVocabulary` prop
goes away in the same commit, because leaving both would give the feature two doors.

**Re-check after the design:** pass. No new prop on any capped component.

## Project Structure

### Documentation (this feature)

```
docs/specs/0001-the-vocabulary-bank/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```
apps/desktop/src-tauri/src/
├── commands.rs                    # + get_book_vocabulary, a thin wrapper on the vault function
└── lib.rs                         # + the command in generate_handler!

apps/desktop/src/
├── lib/
│   ├── api/lexiconApi.ts          # + getBookVocabulary
│   ├── api/dev/fallbackLexicon.ts # + the browser-mode answer
│   ├── api/dev/devBackend.ts      # + the wiring
│   ├── backendShapes.ts           # + vocabularyFrom, so a damaged word is dropped and the rest kept
│   ├── vocabularyEntries.ts       # + the mapping to drawer entries, a plain function
│   └── vocabularySaves.ts         # + the listener list, in place of the dead prop
└── components/
    ├── NotesDrawer.tsx            # loads the words too, and reloads when one is saved
    ├── notes/DrawerFilterBar.tsx  # + the Words filter and its count
    ├── notes/NoteEntryCard.tsx    # + how a word looks
    └── elementary/LexiconPopover.tsx  # tells the listeners; plain words on the button
```

### The mapping

`NotesDrawer` already groups `AggregatedNoteItem` by chapter, searches it, and jumps to its anchor. A word
becomes one of those, with `item_type: "word"`, so every one of those behaviours is had for free instead of
written twice.

The chapter title and reading order come from `BookMeta.spine`, which the drawer already holds. A word whose
chapter is not in the spine, or which has no chapter at all, goes in one last group. `chapter_order` for that
group is larger than any real chapter, so it sorts last without a special case in the drawer.

The mapping is a plain function in `apps/desktop/src/lib/vocabularyEntries.ts`, not code inside the component,
so its tests run in `node` and say something in one line when they fail. A test that compares React elements
takes minutes to print its failure.

## Complexity Tracking

| Choice | Why | Simpler alternative, and why it was rejected |
|---|---|---|
| A listener module instead of a callback prop | The prop cap on `Reader` is a measured limit, not a style preference | A prop through `App.tsx` and `Reader`. Rejected: it raises a cap that may only go down. |
| A third `item_type` on the drawer entry | Search, grouping, and jump-to-paragraph already work on that type | A separate list with its own search and grouping. Rejected: two of everything, and the words would not sit beside the highlight from the same paragraph. |
| A new command rather than adding words to `get_all_book_notes` | The vault function and its 10 tests are already written for one book's words | Widening the notes aggregate in Rust. Rejected: it changes a contract that three screens already use, to save one small command. |

Nothing else here is new. No new dependency, no new window, no new file format.
