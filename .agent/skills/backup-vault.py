#!/usr/bin/env python3
"""Makes the second copy of the reader's vault, and fails when there is no fresh one (DS-14).

Why a snapshot is one zip file, what it promises and what it does not, is in `ingest/vault_backup.py`. This is how
it is run.

    python .agent/skills/backup-vault.py --target E:\\folder --target C:\\...\\OneDrive\\folder
    python .agent/skills/backup-vault.py --check

No drive letter of one machine is in this repository. The folders belong to whoever runs it, so they are passed
with `--target`, or set once in `BOOK_ENGINE_BACKUPS`. A run that is given neither says so and gives back 1: a
backup command that quietly copies nothing is worse than no backup command, because it reports success.

`--check` is the part that fails, and it is not in `npm run check`: it reads the reader's real vault and the
folders of one machine, the way the other scripts of this folder do. `docs/rules/health-audit.md` says when it
runs, and how the daily task is registered.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "packages" / "ingestion"))

from ingest.console import allow_any_letter, say_what_was_done
from ingest.vault_backup import Copied, NotWhole, make_snapshot
from ingest.vault_copies import (
    KEEP_BY_DEFAULT,
    TARGETS_VARIABLE,
    VAULT_VARIABLE,
    check,
    find_vault,
    prune,
    targets_from,
)


def report_of(vault: Path, targets: Sequence[Path], made: Sequence[Copied], pruned: Mapping[Path, int]) -> list[str]:
    """The lines a run prints once it has finished writing."""
    lines = [f"[+] {len(made)} of {len(targets)} target(s) hold a new snapshot of {vault}."]
    for copy in made:
        removed = pruned.get(copy.path.parent, 0)
        lines.append(
            f"    {copy.path}: {copy.files} files, {copy.stored_bytes / 1_000_000:.1f} MB, {copy.seconds:.1f} s"
            + (f", {removed} older snapshot(s) removed" if removed else "")
        )
        lines += [
            f"    [!] {name} changed while it was read. Close the app before a snapshot you mean to rely on."
            for name in copy.changed_while_copying
        ]
    return lines


def parse(argv: Sequence[str] | None) -> argparse.Namespace:
    """What the command was asked to do."""
    parser = argparse.ArgumentParser(description="Makes and checks the second copy of the vault (DS-14).")
    parser.add_argument("--vault", help=f"The vault to copy. Default: {VAULT_VARIABLE}, else a `vault` folder above.")
    parser.add_argument("--target", action="append", default=[], help=f"Where a copy goes. Default: {TARGETS_VARIABLE}")
    parser.add_argument(
        "--keep", type=int, default=KEEP_BY_DEFAULT, help=f"Snapshots a target keeps ({KEEP_BY_DEFAULT})"
    )
    parser.add_argument("--check", action="store_true", help="Say whether every target holds a fresh copy. Write none.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> int:
    """Makes a snapshot in every target, or with `--check` only says whether a fresh one is there."""
    args = parse(argv)
    environ = os.environ if environ is None else environ

    try:
        vault = find_vault(args.vault, environ, Path(__file__).resolve().parent)
    except LookupError as error:
        print(f"[-] {error}")
        return 1

    targets = targets_from(args.target, environ)
    if not targets:
        print(
            f"[-] No target folder was named, so nothing was copied and nothing was checked. Pass --target, "
            f"or set {TARGETS_VARIABLE} to the folders, separated by '{os.pathsep}'."
        )
        return 1

    if args.check:
        problems = check(vault, targets)
        for problem in problems:
            print(f"[-] {problem}")
        if not problems:
            say_what_was_done([f"[+] {len(targets)} target(s) hold a readable snapshot newer than {vault}."])
        return 1 if problems else 0

    made: list[Copied] = []
    pruned: dict[Path, int] = {}
    failed: list[str] = []
    for target in targets:
        try:
            copy = make_snapshot(vault, target)
        except (LookupError, NotWhole, OSError) as error:
            failed.append(f"{target}: {error}")
            continue
        made.append(copy)
        pruned[target] = len(prune(target, args.keep))

    for problem in failed:
        print(f"[-] {problem}")
    say_what_was_done(report_of(vault, targets, made, pruned))
    return 1 if len(made) != len(targets) else 0


if __name__ == "__main__":
    # A command of this repository may print any letter of any book (IN-09)
    allow_any_letter()
    sys.exit(main())
