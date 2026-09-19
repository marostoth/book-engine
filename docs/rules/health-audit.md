# The system health audit

Each rule below was written after a real fault in this repository. It names the test that fails when it is broken, and the review finding at its end is the whole story, in `docs/review/2026-09-14-findings.md`.

This reads the reader's real vault, so it is run by hand and never as part of `npm run check`.

- **System Audit Protocol**: When the user requests 'Run audit', 'Audit project', or 'Check system health', immediately execute `python .agent/skills/audit-system.py`. Present the final diagnostic table, and read the files a failed check names before you say what is wrong. The audit does not start the app; pass `--launch` when you want that too, and it refuses a binary older than the Rust it was built from.

- **The Vault Has a Second Copy, and a Stale One Does Not Count:** a health check of the whole system asks whether the only permanent record exists twice. Run `python .agent/skills/backup-vault.py --check`: it gives back 1 when a target holds no snapshot, when its newest snapshot is older than the newest file of the vault, or when that snapshot will not read back. Run it without `--check` to make one. The copy used to be a side effect of the repository sitting in OneDrive, so TL-09's move to `C:/dev/book-engine` left it frozen 35 hours behind while the reading went on. Why it is a dated zip and never a mirror is `docs/decisions/0007-the-vault-is-copied-as-dated-zip-snapshots.md`; `tests/test_vault_has_a_second_copy.py` holds every part of it that does not need the reader's own books (DS-14).

## Where the copies go, and how the daily run is registered

No drive letter of one machine is in this repository, because the folders belong to whoever runs it. Name them with `--target`, once per folder, or set `BOOK_ENGINE_BACKUPS` to them separated by `;`. A run given neither folder copies nothing and gives back 1, because a backup command that reports success for copying nothing is worse than none.

Pick one folder on a **different physical disk** than the vault, and one that a cloud client syncs. A copy on the same disk survives a deleted folder and not a dead disk; a copy in the cloud survives the machine. `Get-PhysicalDisk` and `Get-Partition` say which drive letter is on which disk, and a drive letter alone does not.

The daily run is one scheduled task. It writes nothing inside the vault, so it needs no special rights:

```
schtasks /create /tn "book-engine vault backup" /sc daily /st 20:00 /tr "python C:\dev\book-engine\.agent\skills\backup-vault.py --target <first folder> --target <second folder>" /f
```

`--keep` is 14 snapshots a target, which is 308 MB of a 22 MB vault. A snapshot taken while the app is open can catch a file mid-write; such a file is read again and, if it is still moving, named in the report. Close the app before a snapshot you mean to rely on.
