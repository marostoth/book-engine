"""The vault has a second copy, and a stale one does not count (DS-14).

`vault/` is the sole permanent record and git keeps three files of it. A second copy existed until the repository
moved out of OneDrive, and it was a side effect of where the folder sat rather than a decision: the move took it
away and left the old copy frozen at the hour of the move. Thirty-five hours of reading were then in one place.

Every test here builds the vault it reads, under `tmp_path`, and never touches the reader's own books (TL-02).
"""

from __future__ import annotations

import hashlib
import json
import os
import stat
import time
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from conftest import load_skill
from ingest.vault_backup import (
    MANIFEST,
    Copied,
    NotWhole,
    clear_read_only,
    files_of,
    is_a_vault,
    long_path,
    make_snapshot,
    newest_change,
    read_and_hash,
    verify_snapshot,
)
from ingest.vault_copies import (
    TARGETS_VARIABLE,
    VAULT_VARIABLE,
    check,
    find_vault,
    made_at,
    prune,
    snapshots_in,
    spoken_span,
    targets_from,
)


def a_vault(root: Path, *, name: str = "vault") -> Path:
    """A small vault of five files, the shape the reader's own vault has."""
    vault = root / name
    (vault / "books" / "a-book").mkdir(parents=True)
    (vault / "notes" / "a-book").mkdir(parents=True)
    (vault / "books" / "a-book" / "ch-01.md").write_text("# One\n\nA paragraph. ^p-001\n", encoding="utf-8")
    (vault / "books" / "a-book" / "_meta.json").write_text('{"title": "A Book"}', encoding="utf-8")
    (vault / "notes" / "a-book" / "reviews.jsonl").write_text('{"card": "c1", "grade": 3}\n', encoding="utf-8")
    (vault / "notes" / "a-book" / "bookmark.json").write_text('{"chapter": "ch-01.md"}', encoding="utf-8")
    (vault / "_ledger.json").write_text("[]", encoding="utf-8")
    return vault


def every_file_of(folder: Path) -> dict[str, bytes]:
    """Every file under `folder`, by its relative path, so two folders can be held against each other."""
    return {path.as_posix(): (folder / path).read_bytes() for path in files_of(folder)}


def a_snapshot(vault: Path, target: Path, *, hours_ago: float = 0.0) -> Copied:
    """One snapshot, made as though `hours_ago` hours had passed since it was written."""
    return make_snapshot(vault, target, now=datetime.now(UTC) - timedelta(hours=hours_ago))


def rebuilt_zip(source: Path, changes: dict[str, bytes | None]) -> Path:
    """A copy of a snapshot with entries replaced, added, or, where the new bytes are None, left out."""
    changed = source.with_name("changed-" + source.name)
    with zipfile.ZipFile(source) as old, zipfile.ZipFile(changed, "w", zipfile.ZIP_DEFLATED) as new:
        for name in old.namelist():
            if name in changes and changes[name] is None:
                continue
            new.writestr(name, changes.get(name) or old.read(name))
        for name, data in changes.items():
            if data is not None and name not in old.namelist():
                new.writestr(name, data)
    return changed


# ---------------------------------------------------------------- the readers find something


def test_the_reader_of_a_vault_finds_every_file_of_one(tmp_path: Path):
    """Every check below compares two lists. Two empty lists agree and prove nothing (TL-04)."""
    vault = a_vault(tmp_path)
    assert [path.as_posix() for path in files_of(vault)] == [
        "_ledger.json",
        "books/a-book/_meta.json",
        "books/a-book/ch-01.md",
        "notes/a-book/bookmark.json",
        "notes/a-book/reviews.jsonl",
    ]
    assert newest_change(vault) > 0.0, "a vault of five files has a newest change"


def test_a_folder_that_holds_no_books_is_not_a_vault(tmp_path: Path):
    """A folder that is only nearly right must not be copied instead of the real one."""
    (tmp_path / "notes").mkdir()
    assert not is_a_vault(tmp_path), "a folder with no `books` inside is not a vault"
    assert is_a_vault(a_vault(tmp_path)), "a folder with `books` inside is one"


# ---------------------------------------------------------------- making a snapshot


def test_a_snapshot_holds_every_file_of_the_vault_byte_for_byte(tmp_path: Path):
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    wanted = every_file_of(tmp_path / "vault")
    with zipfile.ZipFile(copy.path) as archive:
        stored = {name: archive.read(name) for name in archive.namelist() if name != MANIFEST}
    assert stored == wanted, "the snapshot is not the vault"
    assert copy.files == len(wanted) == 5


def test_the_manifest_names_every_file_with_the_hash_of_its_bytes(tmp_path: Path):
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    with zipfile.ZipFile(copy.path) as archive:
        manifest = json.loads(archive.read(MANIFEST))
        assert sorted(manifest["files"]) == sorted(name for name in archive.namelist() if name != MANIFEST)
        for name, facts in manifest["files"].items():
            assert facts["bytes"] == len(archive.read(name))
    assert manifest["totals"]["files"] == 5
    assert manifest["changed_while_copying"] == []


def test_a_vault_with_no_file_in_it_is_refused_and_nothing_is_written(tmp_path: Path):
    """A check that read nothing is not a pass, and a backup of nothing is not a backup (TL-04)."""
    empty = tmp_path / "vault"
    (empty / "books").mkdir(parents=True)
    target = tmp_path / "target"
    with pytest.raises(LookupError, match="holds no file"):
        make_snapshot(empty, target)
    assert not target.exists() or list(target.iterdir()) == [], "a refused run left something behind"


def test_nothing_is_ever_written_inside_the_vault(tmp_path: Path):
    """The reader's only permanent record is read here and never touched."""
    vault = a_vault(tmp_path)
    before = every_file_of(vault)
    a_snapshot(vault, tmp_path / "target")
    check(vault, [tmp_path / "target"])
    assert every_file_of(vault) == before, "the vault changed while it was being copied"


def test_a_snapshot_keeps_the_day_each_file_was_last_written(tmp_path: Path):
    """A reader who opens a snapshot in Explorer sees when each file was written, not the day it was zipped."""
    vault = a_vault(tmp_path)
    long_ago = 1_600_000_000.0  # 13 September 2020
    os.utime(vault / "books" / "a-book" / "ch-01.md", (long_ago, long_ago))
    copy = a_snapshot(vault, tmp_path / "target")

    with zipfile.ZipFile(copy.path) as archive:
        entry = archive.getinfo("books/a-book/ch-01.md")
        stored = json.loads(archive.read(MANIFEST))["files"]["books/a-book/ch-01.md"]
    assert entry.date_time[:3] == time.localtime(long_ago)[:3], "the zip entry lost the day the file was written"
    assert stored["mtime"] == pytest.approx(long_ago), "the manifest lost the exact time the file was written"


def test_a_finished_run_leaves_no_part_file_behind(tmp_path: Path):
    target = tmp_path / "target"
    a_snapshot(a_vault(tmp_path), target)
    assert [path.name for path in target.iterdir() if path.name.endswith(".part")] == []


def test_a_snapshot_that_will_not_read_back_is_removed_rather_than_left_looking_finished(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """A zip that failed its own read-back must not sit in the target where the next check would trust it."""
    from ingest import vault_backup

    monkeypatch.setattr(vault_backup, "verify_snapshot", lambda _: ["made up: this snapshot is not whole"])
    target = tmp_path / "target"
    with pytest.raises(NotWhole, match="not whole"):
        make_snapshot(a_vault(tmp_path), target)
    assert list(target.iterdir()) == [], "a snapshot that failed its read-back was left behind"


def growing_under_the_reader(monkeypatch: pytest.MonkeyPatch, file: Path, *, on_every_call: bool) -> None:
    """Makes `file` change the moment it is looked at, either once or on every look.

    The app writes into the vault while it is open, so a file really can be caught mid-write. Forcing it is the only
    way to hold the retry to its promise, because a real race would pass whatever the code did.

    Each body is a different string, so the two tests below compare bytes and never a clock. When they compared the
    times of the two reads instead, the second body and the third landed inside one tick of the file system clock,
    and the test passed on its own and failed in a full run.
    """
    from ingest import vault_backup

    real = os.stat
    seen = {"calls": 0}

    def growing(path, *args, **kwargs):  # it stands in for os.stat, and takes whatever os.stat takes
        seen["calls"] += 1
        answer = real(path, *args, **kwargs)
        if on_every_call or seen["calls"] == 1:
            file.write_text("body number " + str(seen["calls"] + 1), encoding="utf-8")
        return answer

    monkeypatch.setattr(vault_backup.os, "stat", growing)


def test_a_file_that_settles_after_one_change_is_read_again_and_not_called_moving(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """The second read is what is stored, and a file that has settled is not worth a warning to the reader."""
    moving = tmp_path / "moving.md"
    moving.write_text("first", encoding="utf-8")
    growing_under_the_reader(monkeypatch, moving, on_every_call=False)

    found = read_and_hash(moving)
    assert found.data == b"body number 2", "the second read is what is stored"
    assert not found.changed, "a file that has stopped changing must not be reported as moving"


def test_a_file_that_keeps_changing_while_it_is_read_is_named(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """A file whose two reads differ is reported, and the hash always matches the bytes that were stored."""
    moving = tmp_path / "moving.md"
    moving.write_text("first", encoding="utf-8")
    growing_under_the_reader(monkeypatch, moving, on_every_call=True)

    found = read_and_hash(moving)
    assert found.changed, "a file whose two reads gave different bytes was reported as still"
    assert found.data == b"body number 3", "the second read is what is stored"
    assert found.sha256 == hashlib.sha256(found.data).hexdigest(), "the hash is not of the bytes that were stored"


# ---------------------------------------------------------------- reading a snapshot back


def test_a_snapshot_whose_bytes_were_changed_does_not_verify(tmp_path: Path):
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    changed = rebuilt_zip(copy.path, {"_ledger.json": b'["a book that was never there"]'})
    assert verify_snapshot(copy.path) == [], "the snapshot as written must verify"
    assert [problem for problem in verify_snapshot(changed) if "_ledger.json" in problem], (
        "a changed file inside a snapshot went unreported"
    )


def test_a_snapshot_missing_a_file_its_manifest_names_does_not_verify(tmp_path: Path):
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    short = rebuilt_zip(copy.path, {"books/a-book/ch-01.md": None})
    assert any("ch-01.md" in problem and "not in the zip" in problem for problem in verify_snapshot(short))


def test_a_file_in_a_snapshot_that_its_manifest_does_not_name_does_not_verify(tmp_path: Path):
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    extra = rebuilt_zip(copy.path, {"a-file-nobody-listed.md": b"where did this come from"})
    assert any("a-file-nobody-listed.md" in problem for problem in verify_snapshot(extra))


def test_a_snapshot_with_no_manifest_does_not_verify(tmp_path: Path):
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    assert any("manifest" in problem for problem in verify_snapshot(rebuilt_zip(copy.path, {MANIFEST: None})))


def test_a_snapshot_whose_manifest_names_no_file_does_not_verify(tmp_path: Path):
    """An empty manifest would otherwise make every check of it pass while it proves nothing (TL-04)."""
    copy = a_snapshot(a_vault(tmp_path), tmp_path / "target")
    hollow = rebuilt_zip(copy.path, {MANIFEST: json.dumps({"files": {}, "created_epoch": 0}).encode()})
    assert any("names no file" in problem for problem in verify_snapshot(hollow))


def test_a_file_that_is_not_a_zip_does_not_verify(tmp_path: Path):
    not_a_zip = tmp_path / "vault-2026-09-19-000000Z.zip"
    not_a_zip.write_bytes(b"this is not a zip file")
    assert any("could not be read back" in problem for problem in verify_snapshot(not_a_zip))
    assert made_at(not_a_zip) is None, "a file that will not open has no time of its own"


# ---------------------------------------------------------------- the check that fails


def test_the_check_fails_when_a_target_holds_no_snapshot(tmp_path: Path):
    problems = check(a_vault(tmp_path), [tmp_path / "empty-target"])
    assert len(problems) == 1
    assert "holds no snapshot" in problems[0]


def test_the_check_fails_when_the_newest_snapshot_is_older_than_the_newest_file_of_the_vault(tmp_path: Path):
    """The whole finding in one test: the stale OneDrive copy was 35 hours behind the vault."""
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    a_snapshot(vault, target, hours_ago=35)
    (vault / "notes" / "a-book" / "reading.jsonl").write_text('{"seconds": 900}\n', encoding="utf-8")

    problems = check(vault, [target])
    assert len(problems) == 1, problems
    assert "older than the newest change in the vault" in problems[0]
    assert "35.0 hours" in problems[0], problems[0]
    assert str(target) in problems[0], "a failure that does not name the target leaves two targets alike"


def test_the_check_passes_when_the_newest_snapshot_is_newer_than_the_vault(tmp_path: Path):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    a_snapshot(vault, target, hours_ago=35)
    a_snapshot(vault, target)
    assert check(vault, [target]) == []


def test_the_check_fails_on_a_vault_that_holds_no_file(tmp_path: Path):
    """A check of an empty vault would otherwise report a healthy second copy of nothing (TL-04)."""
    empty = tmp_path / "vault"
    (empty / "books").mkdir(parents=True)
    target = tmp_path / "target"
    a_snapshot(a_vault(tmp_path, name="real"), target)
    assert any("read nothing" in problem for problem in check(empty, [target]))


def test_the_check_does_not_count_a_part_file_left_by_a_killed_run(tmp_path: Path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "vault-2026-09-19-120000Z.zip.part").write_bytes(b"half a snapshot")
    assert snapshots_in(target) == [], "a killed run left something that counted as a copy"
    assert any("holds no snapshot" in problem for problem in check(a_vault(tmp_path), [target]))


def test_the_check_fails_when_the_newest_snapshot_will_not_read_back(tmp_path: Path):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    a_snapshot(vault, target)
    newest = snapshots_in(target)[-1]
    newest.write_bytes(b"something ate this snapshot")
    assert any("does not count as a copy" in problem for problem in check(vault, [target]))


def test_the_check_writes_nothing_at_all(tmp_path: Path):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    a_snapshot(vault, target, hours_ago=35)
    before = every_file_of(target)
    assert check(vault, [target, tmp_path / "never-made"]) != [], "this test needs the check to have failed"
    assert every_file_of(target) == before, "the check changed the target it was reading"
    assert not (tmp_path / "never-made").exists(), "the check made a target folder it was only asked about"


def test_a_span_of_time_is_never_reported_as_nothing():
    """A snapshot taken a moment before the change it misses is still missing it."""
    assert spoken_span(5) == "less than a minute"
    assert spoken_span(600) == "10 minutes"
    assert spoken_span(35 * 3600) == "35.0 hours"
    assert spoken_span(72 * 3600) == "3.0 days"


# ---------------------------------------------------------------- how many copies are kept


def test_pruning_keeps_the_newest_and_removes_the_oldest(tmp_path: Path):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    for hours in (4, 3, 2, 1):
        a_snapshot(vault, target, hours_ago=hours)
    kept_before = [path.name for path in snapshots_in(target)]
    removed = prune(target, 2)
    assert [path.name for path in removed] == kept_before[:2]
    assert [path.name for path in snapshots_in(target)] == kept_before[2:]


def test_pruning_never_removes_the_last_snapshot(tmp_path: Path):
    target = tmp_path / "target"
    a_snapshot(a_vault(tmp_path), target)
    assert prune(target, 1) == []
    assert prune(target, 14) == []
    assert len(snapshots_in(target)) == 1, "pruning left the vault with no copy at all"


def test_pruning_refuses_to_keep_none(tmp_path: Path):
    target = tmp_path / "target"
    a_snapshot(a_vault(tmp_path), target)
    with pytest.raises(ValueError, match="at least one snapshot"):
        prune(target, 0)
    assert len(snapshots_in(target)) == 1


def test_pruning_removes_a_snapshot_a_sync_client_marked_read_only(tmp_path: Path):
    """OneDrive sets that mark on what it syncs, and Windows then refuses to remove the file."""
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    for hours in (2, 1):
        a_snapshot(vault, target, hours_ago=hours)
    oldest = snapshots_in(target)[0]
    os.chmod(oldest, stat.S_IREAD)
    assert prune(target, 1) == [oldest], "a read-only snapshot was not pruned"
    assert not oldest.exists()


def test_the_read_only_mark_is_cleared_and_a_missing_file_is_not_an_error(tmp_path: Path):
    marked = tmp_path / "marked.zip"
    marked.write_bytes(b"x")
    os.chmod(marked, stat.S_IREAD)
    clear_read_only(marked)
    assert os.access(marked, os.W_OK), "the mark was not cleared"
    clear_read_only(tmp_path / "was-never-there.zip")


# ---------------------------------------------------------------- paths longer than Windows used to allow


def test_the_windows_prefix_goes_on_an_absolute_path_only(tmp_path: Path):
    """`\\\\?\\` takes a path exactly as given, so a relative one or a `..` in it would break."""
    if os.name != "nt":
        pytest.skip("the 260 character limit is Windows' own")
    assert long_path(tmp_path) == "\\\\?\\" + str(tmp_path), "an absolute path did not get the prefix"
    relative = Path("books-of-no-vault/a-book")
    assert long_path(relative) == str(relative), "a relative path must be left exactly as it is"
    assert long_path(Path(long_path(tmp_path))) == long_path(tmp_path), "the prefix was added twice"


def test_a_vault_whose_paths_pass_the_old_windows_limit_is_copied_whole(tmp_path: Path):
    """The reader's longest vault path is 220 characters. A target folder takes the total past 260 (DS-14)."""
    vault = tmp_path / "vault"
    deep = vault / "books" / ("a" * 100) / ("b" * 100) / "assets"
    os.makedirs(long_path(deep), exist_ok=True)
    long_file = deep / ("c" * 60 + ".png")
    with open(long_path(long_file), "wb") as handle:
        handle.write(b"a picture of a page")
    assert len(str(long_file)) > 260, f"this test needs a path past 260, and made one of {len(str(long_file))}"

    copy = a_snapshot(vault, tmp_path / "target")
    with zipfile.ZipFile(copy.path) as archive:
        stored = [name for name in archive.namelist() if name != MANIFEST]
    assert stored == [long_file.relative_to(vault).as_posix()]
    assert verify_snapshot(copy.path) == []


# ---------------------------------------------------------------- finding the vault and the targets


def test_the_vault_named_on_the_command_line_wins_over_the_variable(tmp_path: Path):
    named = a_vault(tmp_path, name="named")
    other = a_vault(tmp_path, name="from-the-variable")
    assert find_vault(str(named), {VAULT_VARIABLE: str(other)}, tmp_path) == named.resolve()


def test_the_variable_names_the_vault_when_nothing_else_does(tmp_path: Path):
    vault = a_vault(tmp_path, name="from-the-variable")
    assert find_vault(None, {VAULT_VARIABLE: str(vault)}, tmp_path) == vault.resolve()


def test_a_folder_that_is_not_a_vault_is_refused_whichever_way_it_was_named(tmp_path: Path):
    not_a_vault = tmp_path / "just-a-folder"
    not_a_vault.mkdir()
    with pytest.raises(LookupError, match="not a vault"):
        find_vault(str(not_a_vault), {}, tmp_path)
    with pytest.raises(LookupError, match="holds no `books`"):
        find_vault(None, {VAULT_VARIABLE: str(not_a_vault)}, tmp_path)
    with pytest.raises(LookupError, match="No `vault` folder"):
        find_vault(None, {}, not_a_vault)


def test_a_vault_beside_or_above_the_starting_folder_is_found(tmp_path: Path):
    vault = a_vault(tmp_path)
    deeper = tmp_path / "one" / "two" / "three"
    deeper.mkdir(parents=True)
    assert find_vault(None, {}, deeper) == vault.resolve()


def test_the_targets_come_from_the_variable_when_none_are_passed(tmp_path: Path):
    first, second = tmp_path / "to-e", tmp_path / "to-the-cloud"
    joined = os.pathsep.join([str(first), " ", str(second)])
    assert targets_from([], {TARGETS_VARIABLE: joined}) == [first.resolve(), second.resolve()]
    assert targets_from([str(first)], {TARGETS_VARIABLE: str(second)}) == [first.resolve()]
    assert targets_from([], {}) == [], "a target list out of nothing is empty, and the command must say so"


# ---------------------------------------------------------------- the command itself


def command():
    return load_skill("backup-vault.py")


def test_the_command_with_no_target_copies_nothing_and_does_not_report_success(tmp_path: Path, capsys):
    """A backup command that quietly copies nothing is worse than none, because it reports success."""
    vault = a_vault(tmp_path)
    assert command().main([f"--vault={vault}"], {}) == 1
    assert "No target folder was named" in capsys.readouterr().out


def test_the_command_makes_a_snapshot_in_every_target_and_says_what_it_did(tmp_path: Path, capsys):
    vault = a_vault(tmp_path)
    first, second = tmp_path / "to-e", tmp_path / "to-the-cloud"
    code = command().main([f"--vault={vault}", f"--target={first}", f"--target={second}"], {})
    printed = capsys.readouterr().out
    assert code == 0, printed
    assert "2 of 2 target(s)" in printed
    assert len(snapshots_in(first)) == len(snapshots_in(second)) == 1
    assert verify_snapshot(snapshots_in(first)[-1]) == []


def test_the_command_keeps_only_as_many_snapshots_as_it_was_told_to(tmp_path: Path, capsys):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    for hours in (3, 2):
        a_snapshot(vault, target, hours_ago=hours)
    assert command().main([f"--vault={vault}", f"--target={target}", "--keep=1"], {}) == 0
    capsys.readouterr()
    assert len(snapshots_in(target)) == 1, "the oldest snapshots were kept although --keep said one"


def test_the_command_gives_back_one_when_the_check_fails_and_zero_when_it_passes(tmp_path: Path, capsys):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    a_snapshot(vault, target, hours_ago=35)
    (vault / "notes" / "a-book" / "reading.jsonl").write_text('{"seconds": 900}\n', encoding="utf-8")

    assert command().main([f"--vault={vault}", f"--target={target}", "--check"], {}) == 1
    assert "older than the newest change" in capsys.readouterr().out

    a_snapshot(vault, target)
    assert command().main([f"--vault={vault}", f"--target={target}", "--check"], {}) == 0
    assert "hold a readable snapshot newer than" in capsys.readouterr().out


def test_the_command_reads_the_targets_from_the_variable(tmp_path: Path, capsys):
    vault = a_vault(tmp_path)
    target = tmp_path / "target"
    code = command().main([f"--vault={vault}"], {TARGETS_VARIABLE: str(target)})
    assert code == 0, capsys.readouterr().out
    capsys.readouterr()
    assert len(snapshots_in(target)) == 1
