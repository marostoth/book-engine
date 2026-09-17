"""The changes of an import go into the vault all together, or not at all (IN-05)."""

import os
import stat
from pathlib import Path
from typing import Dict, Optional

import pytest

import ingest.vault_changes as vault_changes
from ingest.vault_changes import VaultChanges


def everything(folder: Path) -> Dict[str, Optional[bytes]]:
    """Every file with its bytes, and every folder with None, by its path in `folder`."""
    return {
        path.relative_to(folder).as_posix(): path.read_bytes() if path.is_file() else None
        for path in sorted(folder.rglob("*"))
    }


@pytest.fixture
def vault(tmp_path: Path) -> Path:
    """A vault with a book and the reader's files for it, and a new build of the book in `.import`."""
    vault = tmp_path / "vault"
    (vault / "books" / "tides").mkdir(parents=True)
    (vault / "books" / "tides" / "ch-01.md").write_bytes(b"The old chapter 1. ^p-001\n")
    (vault / "books" / "tides" / "ch-02.md").write_bytes(b"The old chapter 2. ^p-001\n")
    (vault / "notes" / "tides").mkdir(parents=True)
    (vault / "notes" / "tides" / "bookmark.json").write_bytes(b'{"chapterFile": "ch-02.md"}')
    (vault / "notes" / "tides" / "ch-02-notes.md").write_bytes(b"# Notes\r\n")
    (vault / ".import" / "tides").mkdir(parents=True)
    (vault / ".import" / "tides" / "ch-01.md").write_bytes(b"The new chapter 1. ^p-001\n")
    return vault


def changes_of(vault: Path) -> VaultChanges:
    """The new book folder, a moved bookmark, a deck in a notes folder that is not there, and notes with a new name."""
    changes = VaultChanges()
    changes.replace_folder(vault / ".import" / "tides", vault / "books" / "tides")
    changes.write(vault / "notes" / "tides" / "bookmark.json", '{"chapterFile": "ch-01.md"}')
    changes.write(vault / "notes" / "harbour" / "practice-deck.md", "# Deck\n")
    changes.write(vault / "notes" / "tides" / "ch-01-notes.md", "# Notes\r\n")
    changes.remove(vault / "notes" / "tides" / "ch-02-notes.md")
    return changes


def test_every_change_goes_in(vault: Path):
    changes_of(vault).carry_out()

    assert everything(vault) == {
        ".import": None,
        "books": None,
        "books/tides": None,
        "books/tides/ch-01.md": b"The new chapter 1. ^p-001\n",
        "notes": None,
        "notes/harbour": None,
        "notes/harbour/practice-deck.md": b"# Deck\n",
        "notes/tides": None,
        "notes/tides/bookmark.json": b'{"chapterFile": "ch-01.md"}',
        "notes/tides/ch-01-notes.md": b"# Notes\r\n",
    }, "no old chapter, no old book folder, no temporary file, and every text keeps its line endings"


@pytest.mark.skipif(os.name != "nt", reason="Windows marks folders read-only")
def test_an_old_book_folder_that_windows_marks_read_only_is_removed(vault: Path):
    # OneDrive marks the folders of a vault read-only. Windows moves such a folder, but cannot remove it with the mark.
    (vault / "books" / "tides" / "assets").mkdir()
    os.chmod(vault / "books" / "tides" / "assets", stat.S_IREAD)
    os.chmod(vault / "books" / "tides", stat.S_IREAD)

    changes_of(vault).carry_out()

    assert not (vault / ".import" / "tides.replaced").exists()
    assert (vault / "books" / "tides" / "ch-01.md").read_bytes() == b"The new chapter 1. ^p-001\n"


def test_a_file_that_cannot_go_in_puts_back_every_change(vault: Path, monkeypatch: pytest.MonkeyPatch):
    before = everything(vault)
    real_replace = os.replace

    def replace(source, target):
        if Path(target).name == "ch-01-notes.md":
            raise OSError("The disk is full")
        real_replace(source, target)

    monkeypatch.setattr(vault_changes.os, "replace", replace)

    with pytest.raises(OSError, match="The disk is full"):
        changes_of(vault).carry_out()

    assert everything(vault) == before, "the old book folder and bookmark, and no new deck, folder or temporary file"


def test_a_book_folder_that_cannot_move_puts_back_the_old_book_folder(vault: Path, monkeypatch: pytest.MonkeyPatch):
    before = everything(vault)
    real_rename = os.rename

    def rename(source, target):
        if Path(source) == vault / ".import" / "tides":
            raise OSError("The folder is in use")
        real_rename(source, target)

    monkeypatch.setattr(vault_changes.os, "rename", rename)

    with pytest.raises(OSError, match="The folder is in use"):
        changes_of(vault).carry_out()

    assert everything(vault) == before


def test_a_file_that_windows_holds_for_a_moment_still_goes_in(vault: Path, monkeypatch: pytest.MonkeyPatch):
    real_replace = os.replace
    held = []

    def replace(source, target):
        if Path(target).name == "bookmark.json" and len(held) < 2:
            held.append(target)
            raise PermissionError(13, "The process cannot access the file because it is being used by another process")
        real_replace(source, target)

    monkeypatch.setattr(vault_changes.os, "replace", replace)
    monkeypatch.setattr(vault_changes, "HELD_FILE_PAUSE", 0.01)

    changes_of(vault).carry_out()

    assert len(held) == 2
    assert (vault / "notes" / "tides" / "bookmark.json").read_bytes() == b'{"chapterFile": "ch-01.md"}'


def test_what_cannot_be_removed_at_the_end_stays_and_is_named(
    vault: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
):
    monkeypatch.setattr(vault_changes, "HELD_FILE_WAIT", 0.05)
    monkeypatch.setattr(vault_changes, "HELD_FILE_PAUSE", 0.01)
    real_unlink = Path.unlink

    def unlink(self: Path, missing_ok: bool = False) -> None:
        if self.name == "ch-02-notes.md":
            raise PermissionError(13, "The file is in use")
        real_unlink(self, missing_ok=missing_ok)

    def rmtree(path, *args, **kwargs):
        raise PermissionError(13, "The folder is in use")

    monkeypatch.setattr(Path, "unlink", unlink)
    monkeypatch.setattr(vault_changes.shutil, "rmtree", rmtree)

    changes_of(vault).carry_out()

    printed = capsys.readouterr().err
    assert (vault / "books" / "tides" / "ch-01.md").read_bytes() == b"The new chapter 1. ^p-001\n", "the changes are in"
    assert (vault / "notes" / "tides" / "ch-02-notes.md").exists()
    assert "ch-02-notes.md could not be removed" in printed and "Its text is in another file too" in printed, printed
    assert (vault / ".import" / "tides.replaced" / "ch-02.md").exists()
    assert "The book folder from before the import is still in" in printed, printed
