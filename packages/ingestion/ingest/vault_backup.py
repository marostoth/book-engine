"""Makes one snapshot of the reader's vault, and proves it can be read back (DS-14).

Why a snapshot is one zip file and not a folder tree, and what it promises, is
`docs/decisions/0007-the-vault-is-copied-as-dated-zip-snapshots.md`. Where copies live and whether they are fresh
enough is `vault_copies.py`.

Nothing here ever writes inside the vault.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import stat
import time
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

#: The name of one snapshot, in UTC, so two runs an hour apart still sort by name on the night the clocks go back.
STAMP = "%Y-%m-%d-%H%M%SZ"
SNAPSHOT_GLOB = "vault-*.zip"

#: The file inside every snapshot that says what the snapshot holds.
MANIFEST = "manifest.json"


class NotWhole(Exception):
    """A snapshot that was written and did not read back the same. It is removed, never left looking finished."""


@dataclass
class Read:
    """The bytes of one file of the vault, and whether it moved under us while it was read."""

    data: bytes
    sha256: str
    mtime: float
    changed: bool


@dataclass
class Copied:
    """What one snapshot holds, and what moved under it while it was made."""

    path: Path
    files: int
    source_bytes: int
    stored_bytes: int
    seconds: float
    changed_while_copying: list[str] = field(default_factory=list)


def long_path(path: Path) -> str:
    """`path` as a string Windows takes past 260 characters.

    The reader's longest vault path is 220 characters, so a vault two folders deeper than this one is already at the
    old limit. `LongPathsEnabled` is a setting of one machine, and a machine where it is 0 must still be able to make
    a copy. The prefix takes a path exactly as it is given, with no `.` or `..` and no forward slash, so it is added
    to an absolute path only.
    """
    text = str(path)
    if os.name != "nt" or not path.is_absolute() or text.startswith("\\\\?\\"):
        return text
    return "\\\\?\\" + text


def is_a_vault(folder: Path) -> bool:
    """A folder counts as a vault only when it holds `books`, the same rule the app uses (LC-01).

    A folder that is only nearly right must not be taken: the copy would be of the wrong folder, and a reader who
    saw a snapshot appear would believe their books were in it.
    """
    return (folder / "books").is_dir()


def files_of(vault: Path) -> list[Path]:
    """Every file of the vault, as paths relative to it, in one stable order."""
    root = long_path(vault)
    found: list[Path] = []
    for folder, _, names in os.walk(root):
        here = os.path.relpath(folder, root)
        under = Path() if here == "." else Path(here)
        found.extend(under / name for name in names)
    return sorted(found, key=lambda path: path.as_posix())


def newest_change(vault: Path) -> float:
    """When the vault last changed, as an epoch time. 0.0 when it holds no file at all."""
    times = [os.stat(long_path(vault / rel)).st_mtime for rel in files_of(vault)]
    return max(times, default=0.0)


def read_and_hash(source: Path) -> Read:
    """The bytes of one file, their hash, and whether the file was still moving when it was read.

    The app writes into the vault while it is open, so a file can be caught mid-write. A size or a time that moved
    across the read triggers a second read, and what is reported is whether the two reads differ. The second read is
    what is stored, and the hash is always of the stored bytes, so a snapshot holds a file and a hash that agree
    whatever the live file does next.

    The answer is the bytes and not the clock. Comparing the times of the two reads made this report nothing when a
    file was rewritten to the same length inside one tick of the file system clock, which is how the test of it
    passed on its own and failed in a full run. The trigger is still a `stat`, so a change that moves neither the
    size nor the clock is not noticed at all: that is the floor of reading a file that somebody else is writing.
    """
    text = long_path(source)
    before = os.stat(text)
    with open(text, "rb") as handle:
        data = handle.read()
    after = os.stat(text)
    changed = False
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        with open(text, "rb") as handle:
            again = handle.read()
        changed = again != data
        data = again
    return Read(data=data, sha256=hashlib.sha256(data).hexdigest(), mtime=after.st_mtime, changed=changed)


def _zip_time(mtime: float) -> tuple[int, int, int, int, int, int]:
    """One file's time in the six numbers a zip entry holds. A zip keeps local time, to the nearest two seconds."""
    when = time.localtime(mtime)
    return (max(when.tm_year, 1980), when.tm_mon, when.tm_mday, when.tm_hour, when.tm_min, when.tm_sec)


def clear_read_only(path: Path) -> None:
    """Takes the read-only mark off a file, so Windows will let it be removed.

    A sync client sets that mark on what it syncs, which is why three other pieces of this repository retry a rename
    or clear it before removing a folder. Without this a snapshot in a synced folder could never be pruned, and a
    target would grow for ever.
    """
    with contextlib.suppress(OSError):
        os.chmod(long_path(path), stat.S_IWRITE)


def make_snapshot(vault: Path, target: Path, *, now: datetime | None = None) -> Copied:
    """One snapshot of `vault` in `target`, written whole or not at all.

    The zip is written under a `.part` name and renamed only after it has been read back, so a run that is killed
    leaves nothing that looks like a finished snapshot.
    """
    started = time.monotonic()
    when = now or datetime.now(UTC)
    relatives = files_of(vault)
    if not relatives:
        raise LookupError(f"{vault} holds no file, so there is nothing to copy. Nothing was written (TL-04).")

    target.mkdir(parents=True, exist_ok=True)
    final = target / f"vault-{when.strftime(STAMP)}.zip"
    part = Path(str(final) + ".part")

    files: dict[str, dict[str, object]] = {}
    moving: list[str] = []
    source_bytes = 0
    with zipfile.ZipFile(long_path(part), "w", zipfile.ZIP_DEFLATED) as archive:
        for rel in relatives:
            name = rel.as_posix()
            found = read_and_hash(vault / rel)
            entry = zipfile.ZipInfo(name, date_time=_zip_time(found.mtime))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, found.data)
            files[name] = {"sha256": found.sha256, "bytes": len(found.data), "mtime": found.mtime}
            source_bytes += len(found.data)
            if found.changed:
                moving.append(name)
        archive.writestr(
            MANIFEST,
            json.dumps(
                {
                    "created": when.isoformat(),
                    "created_epoch": when.timestamp(),
                    "vault": str(vault),
                    "newest_vault_change_epoch": newest_change(vault),
                    "totals": {"files": len(files), "bytes": source_bytes},
                    "changed_while_copying": moving,
                    "files": files,
                },
                indent=2,
                sort_keys=True,
            ),
        )

    problems = verify_snapshot(part)
    if problems:
        clear_read_only(part)
        part.unlink(missing_ok=True)
        raise NotWhole("\n".join(problems))

    os.replace(long_path(part), long_path(final))
    return Copied(
        path=final,
        files=len(files),
        source_bytes=source_bytes,
        stored_bytes=final.stat().st_size,
        seconds=time.monotonic() - started,
        changed_while_copying=moving,
    )


def verify_snapshot(path: Path) -> list[str]:
    """What is wrong with a snapshot, read from the snapshot alone. An empty list means it is whole and readable."""
    try:
        with zipfile.ZipFile(long_path(path)) as archive:
            broken = archive.testzip()
            if broken:
                return [f"{path.name}: {broken} does not match its own checksum inside the zip."]
            names = set(archive.namelist())
            if MANIFEST not in names:
                return [f"{path.name}: holds no {MANIFEST}, so what it should hold is unknown."]
            wanted: dict[str, dict[str, str]] = json.loads(archive.read(MANIFEST)).get("files", {})
            if not wanted:
                return [f"{path.name}: its {MANIFEST} names no file, so a clean read of it proves nothing (TL-04)."]
            problems = [
                f"{path.name}: {name} is in {MANIFEST} and not in the zip." for name in sorted(set(wanted) - names)
            ]
            problems += [
                f"{path.name}: {name} is not the bytes {MANIFEST} names."
                for name in sorted(set(wanted) & names)
                if hashlib.sha256(archive.read(name)).hexdigest() != wanted[name]["sha256"]
            ]
            problems += [
                f"{path.name}: {name} is in the zip and not in {MANIFEST}."
                for name in sorted(names - set(wanted) - {MANIFEST})
            ]
            return problems
    except (OSError, zipfile.BadZipFile, json.JSONDecodeError, KeyError, TypeError) as error:
        return [f"{path.name}: could not be read back ({type(error).__name__}). It does not count as a copy."]
