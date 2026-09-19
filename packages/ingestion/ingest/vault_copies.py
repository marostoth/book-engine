"""Where the copies of the vault live, and whether one of them is fresh enough to count (DS-14).

Making one snapshot is `vault_backup.py`. Why the copies are dated snapshots and never a mirror is
`docs/decisions/0007-the-vault-is-copied-as-dated-zip-snapshots.md`.

`check` writes nothing at all. It is the part that fails, and its rule is one sentence: a target with no snapshot,
or whose newest snapshot is older than the newest file of the vault, or whose newest snapshot will not read back, is
not a second copy.
"""

from __future__ import annotations

import json
import os
import zipfile
from collections.abc import Mapping, Sequence
from pathlib import Path

from ingest.vault_backup import (
    MANIFEST,
    SNAPSHOT_GLOB,
    clear_read_only,
    is_a_vault,
    long_path,
    newest_change,
    verify_snapshot,
)

#: The variable that names the vault, for a run from a script. The same one the app reads.
VAULT_VARIABLE = "BOOK_ENGINE_VAULT"

#: The variable that names where the copies go, when no folder is passed. Separated the way this OS separates paths.
#:
#: No drive letter of one machine is written into this repository. The folders belong to the reader who runs it, so
#: they live in the scheduled task that runs the script, or in this variable, and a run that is given neither says so
#: and fails rather than quietly copying nothing.
TARGETS_VARIABLE = "BOOK_ENGINE_BACKUPS"

#: How many snapshots one target keeps. Fourteen of this vault are 308 MB.
KEEP_BY_DEFAULT = 14

#: How far up from a starting folder a `vault` folder is looked for, when nothing names one.
FOLDERS_UP = 6


def find_vault(named: str | None, environ: Mapping[str, str], start: Path) -> Path:
    """The vault to copy: the one named, else the one the variable names, else a `vault` at or above `start`."""
    if named:
        folder = Path(named).expanduser().resolve()
        if not is_a_vault(folder):
            raise LookupError(f"{folder} holds no `books` folder, so it is not a vault. Nothing was copied.")
        return folder

    from_variable = environ.get(VAULT_VARIABLE, "").strip()
    if from_variable:
        folder = Path(from_variable).expanduser().resolve()
        if not is_a_vault(folder):
            raise LookupError(f"{VAULT_VARIABLE} names {folder}, which holds no `books` folder. Nothing was copied.")
        return folder

    here = start.resolve()
    for folder in [here, *here.parents][: FOLDERS_UP + 1]:
        candidate = folder / "vault"
        if is_a_vault(candidate):
            return candidate
    raise LookupError(
        f"No `vault` folder holding `books` was found at or above {here}. "
        f"Name one with --vault, or set {VAULT_VARIABLE}."
    )


def targets_from(named: Sequence[str], environ: Mapping[str, str]) -> list[Path]:
    """Where the copies go: every folder passed, else every folder the variable names."""
    given = [text for text in named if text.strip()]
    if not given:
        given = [text for text in environ.get(TARGETS_VARIABLE, "").split(os.pathsep) if text.strip()]
    return [Path(text.strip()).expanduser().resolve() for text in given]


def snapshots_in(target: Path) -> list[Path]:
    """Every finished snapshot of `target`, oldest first. A `.part` left by a killed run is not one."""
    if not target.is_dir():
        return []
    return sorted((path for path in target.glob(SNAPSHOT_GLOB) if path.is_file()), key=lambda path: path.name)


def prune(target: Path, keep: int) -> list[Path]:
    """Removes the oldest snapshots past `keep`, and never the last one left."""
    if keep < 1:
        raise ValueError(f"A target keeps at least one snapshot, and {keep} was asked for.")
    found = snapshots_in(target)
    removed: list[Path] = []
    for path in found[: max(0, len(found) - keep)]:
        clear_read_only(path)
        path.unlink()
        removed.append(path)
    return removed


def made_at(snapshot: Path) -> float | None:
    """When a snapshot was made, read from its own manifest. None when it holds no manifest that can be read."""
    try:
        with zipfile.ZipFile(long_path(snapshot)) as archive:
            return float(json.loads(archive.read(MANIFEST))["created_epoch"])
    except (OSError, zipfile.BadZipFile, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None


def spoken_span(seconds: float) -> str:
    """A span of time in the words a reader uses about it.

    Never "0 minutes": a snapshot taken a moment before the change it misses is still missing it, and a line that
    says the gap is nothing reads as though there were nothing wrong.
    """
    hours = seconds / 3600
    if seconds < 60:
        return "less than a minute"
    if hours < 1:
        return f"{seconds / 60:.0f} minutes"
    if hours < 48:
        return f"{hours:.1f} hours"
    return f"{hours / 24:.1f} days"


def check(vault: Path, targets: Sequence[Path]) -> list[str]:
    """What is missing from the second copy. Empty means every target holds a readable snapshot newer than the vault."""
    newest = newest_change(vault)
    if newest == 0.0:
        return [f"{vault} holds no file, so this check read nothing and proves nothing (TL-04)."]

    problems: list[str] = []
    for target in targets:
        found = snapshots_in(target)
        if not found:
            problems.append(f"{target}: holds no snapshot, so the vault has no second copy here.")
            continue
        latest = found[-1]
        made = made_at(latest)
        if made is None:
            problems.append(f"{latest}: holds no manifest that can be read, so it does not count as a copy.")
            continue
        if made < newest:
            problems.append(
                f"{target}: its newest snapshot {latest.name} is {spoken_span(newest - made)} older than the "
                f"newest change in the vault, so everything changed since sits in one place only."
            )
        problems.extend(f"{target}: {problem}" for problem in verify_snapshot(latest))
    return problems
