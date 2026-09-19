---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# The vault is copied as dated zip snapshots

## Context and Problem Statement

[0001](0001-the-vault-is-the-only-permanent-record.md) made `vault/` the only permanent record. It did not say
where the second copy of it lives. Until 2026-09-18 there was one, and nobody chose it: the whole repository sat
inside OneDrive, so OneDrive held a copy. TL-09 moved the repository to `C:\dev\book-engine` because a sync
client holds files open and marks folders read-only, and that took the copy away. The old folder stayed on disk
and stopped being updated, so the copy was frozen at the hour of the move while the reader carried on reading.

Measured on 2026-09-19: the live vault was 154 files and 21,971,738 bytes; the old copy was 154 files with its
newest file from 2026-09-18 08:02, which is 35 hours behind. One day of reading time, the bookmark, the
preferences and two Syntopicon files were in one place only.

## Decision Drivers

* A disk that fails, or a folder deleted by mistake, must not take the reader's books and study history.
* A mistake must be recoverable. A copy that follows a deletion is not a backup of it.
* The reader must be able to restore without this program, and without an agent.
* Nothing may write inside the vault, and a backup may never report success for copying nothing.
* No drive letter of one machine belongs in a repository that is shared under the AGPL.

## Considered Options

* Dated zip snapshots, pushed to folders the reader names
* A mirrored folder tree kept in step with the vault
* Moving the live vault inside OneDrive and pointing the app at it
* Git, with the vault tracked

## Decision Outcome

Chosen option: **dated zip snapshots**, one file per run, written to every folder the reader names and verified by
reading them back.

A **mirror** was rejected because it copies a mistake: the note deleted this morning is gone from a mirror by this
evening, and that is the loss this decision is mostly about. Snapshots keep fourteen runs, which is 308 MB of a
22 MB vault.

**Moving the live vault into OneDrive** was rejected because the sync client is the reason the repository had to
leave OneDrive in the first place: it holds files open while the app writes, and it marks folders read-only. LC-01
does allow it — the app remembers a vault folder the reader picks — so this stays available to a reader who wants
it. It is not the default.

**Git** was rejected by 0001 already: the vault is 22 MB of PDF-derived pictures that change with every import,
and `.gitignore` keeps it out on purpose.

A snapshot is **one zip file rather than a folder tree** for four reasons, all measured:

* The longest path inside the reader's vault is 220 characters. A dated folder under `E:\book-engine-backups`
  makes that 265 and under a OneDrive folder 286, against Windows' old limit of 260. A tree written on short test
  names would pass every test and fail on the reader's real books.
* A sync client marks folders read-only, so pruning a tree needs that mark cleared on every folder.
* A sync client uploads one file rather than 154.
* A reader restores it by opening it in Explorer, with nothing installed.

### Consequences

* Good, because the copy is a decision now, with a check that fails, rather than a side effect of a folder's
  location.
* Good, because a snapshot is proved: every file in it is held against the hash of the bytes that went in, and a
  zip that does not read back is removed instead of being left where the next check would trust it.
* Good, because a run is atomic. The zip is written under a `.part` name and renamed last, so a killed run leaves
  nothing that looks finished.
* Bad, because a snapshot cannot be read one file at a time without opening the zip.
* Bad, because the app writes into the vault while it is open, so a file can be caught mid-write. Such a file is
  read a second time and, if it is still changing, named in the report. A snapshot is a true copy of what it read,
  which is not the same as a copy of a vault that stood still.
* Bad, because an empty folder is not stored: a zip holds files. No reader data is in an empty folder, and the app
  makes the folders it needs.
* Bad, because the folders live outside the repository, in `BOOK_ENGINE_BACKUPS` or in the scheduled task. A clone
  on another machine has no backup until somebody names one, which is why a run with no target fails loudly.

### Confirmation

`packages/ingestion/tests/test_vault_has_a_second_copy.py` holds all of it: that a snapshot is the vault byte for
byte, that a vault with no file is refused, that nothing is ever written inside the vault, that a changed or
missing or unnamed file inside a snapshot is reported, that pruning never removes the last copy and does remove one
a sync client marked read-only, and that a vault whose paths pass 260 characters is still copied whole.

The one that would catch this decision being reversed is `python .agent/skills/backup-vault.py --check`: it gives
back 1 when a target holds no snapshot, when the newest snapshot is older than the newest file of the vault, or
when that snapshot will not read back. `docs/rules/health-audit.md` says when it runs.

## More Information

DS-14 in `docs/review/2026-09-14-findings.md` is the finding. It said no second copy existed; the stale one did,
which is why the check is about freshness and not only about presence. The related decisions are
[0001](0001-the-vault-is-the-only-permanent-record.md), and the rules TL-09 left behind in `AGENTS.md` about
keeping the repository out of a synced folder.
