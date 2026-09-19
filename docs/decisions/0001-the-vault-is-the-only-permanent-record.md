---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# A folder of Markdown files is the only permanent record

## Context and Problem Statement

A reading app accumulates things the reader cannot replace: notes, highlights, the place they stopped, and
years of review history. Where does that live so it is still readable when the app is gone, and so a bad
release cannot take it?

## Decision Drivers

* The reader must be able to open, edit and back up their own work without this program.
* Losing review history is unrecoverable; losing a search index is not.
* Moving to another computer should take the work with it.
* An app that owns its data in a private database can corrupt it beyond the reader's reach.

## Considered Options

* A folder of Markdown and JSON files, with a rebuildable cache beside it
* One SQLite database holding both the content and the progress
* A hosted account with sync

## Decision Outcome

Chosen option: **a folder of Markdown and JSON files**, because it is the only option where the reader keeps
working data in a format that outlives the program, and where deleting the app's own storage costs nothing.

`vault/` holds the books, the notes, the highlights, the bookmark and the study log. `index.db` in the OS
application data folder holds a **copy** for speed. Delete `index.db` and the next start builds the search
index again from the Markdown and replays the study log; delete the app and the reader still has every word
they wrote, in files Obsidian, Neovim or VS Code can open.

### Consequences

* Good, because the reader owns their work in a format nothing can take hostage.
* Good, because backup and sync are the reader's own, with any tool they already use.
* Good, because a cache bug can always be answered by deleting the cache.
* Bad, because every write has to be crash-safe by hand: `write_file` in
  `apps/desktop/src-tauri/src/vault/safe_write.rs` writes to a temporary file in the same folder, flushes,
  then replaces. Windows can hold a file open, so several places retry.
* Bad, because two writers of one file corrupt it, which forced the rule that each vault file has exactly
  one writer.
* Bad, because a re-import that renumbers chapters has to move the reader's files with the text
  (`packages/ingestion/ingest/places.py`), which is a large and delicate piece of the import.
* Bad, because a cloud sync client holds files open and marks folders read-only, so the repository and the
  vault must stay out of OneDrive and the like.

### Confirmation

`apps/desktop/src-tauri/src/db/restore.rs` rebuilds card schedules, review history and reading time from
`vault/notes/<book-id>/reviews.jsonl` and `reading.jsonl` at every start, and `db/restore_tests.rs` holds it.
Vector 12 of `.agent/skills/audit-system.py` fails when any SQLite database appears inside `vault/`.
`tests/test_git_tracks_the_right_files.py` keeps the vault out of version control.

## More Information

This was a guardrail before it was a record: `AGENTS.md` section 1 has said "Markdown Vault is Ground Truth"
from the start. Two review findings made it true rather than merely stated. DS-01 found that study progress
could **not** be rebuilt from the vault, and added `restore.rs`. RD-08 found one note format written once and
read two different ways. Both are in `docs/review/2026-09-14-findings.md`.
