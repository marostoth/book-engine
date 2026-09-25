"""The results table of the inbox says what happened to each book, and so does its exit code (TL-21).

The inbox moved the file of a book to `inbox/processed/` inside the same `try` that decides the row of the book. On
Windows a sync client or a virus scanner can hold that file for a moment. The move then failed AFTER the book was in
the vault and in the ledger, and the row said `Failed`, with no book id and no chapter count. `docs/rules/import-books.md`
says a `Failed` row means "The vault did not change", so the row said the opposite of what was true. And the inbox gave
back 0 whatever the rows said, so the table was the only signal.

Now the file waits while Windows holds it, as every other move of an import does, and a move that still cannot be made
does not change the row. A `Failed` row makes the run give back 1.

Every test here makes its own little inbox and vault, so none of them needs a book of yours.
"""

import importlib.util
import shutil
import sys
from pathlib import Path

import pytest
from ingest import vault_changes
from ingest.ledger import SET_ASIDE, read_ledger, write_ledger
from ingest.sample_generator import create_sample_epub

TITLE = "Principles of Distributed Systems"
FILE = "distributed.epub"


def an_inbox_on(folder: Path, monkeypatch):
    """The inbox skill, pointed at `folder` instead of the real inbox and vault."""
    spec = importlib.util.spec_from_file_location(
        "process_inbox", Path(__file__).resolve().parents[3] / ".agent" / "skills" / "process-inbox.py"
    )
    assert spec and spec.loader
    inbox = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inbox)
    monkeypatch.setattr(inbox, "INBOX_DIR", folder / "inbox")
    monkeypatch.setattr(inbox, "PROCESSED_DIR", folder / "inbox" / "processed")
    monkeypatch.setattr(inbox, "VAULT_DIR", folder / "vault")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    (folder / "inbox").mkdir()
    return inbox


class HeldFile:
    """Windows holding the files of `inbox/`, as OneDrive or a virus scanner does: a move of one fails `times` times."""

    def __init__(self, monkeypatch, times: int) -> None:
        self.times = times
        real_move = shutil.move

        def move(source, target, *args, **kwargs):
            if Path(source).parent.name == "inbox" and self.times > 0:
                self.times -= 1
                raise PermissionError(32, "The process cannot access the file because it is being used")
            return real_move(source, target, *args, **kwargs)

        monkeypatch.setattr(shutil, "move", move)

    def let_go(self) -> None:
        self.times = 0


def row_of(out: str, title: str) -> str:
    """The line of the results table that names `title`."""
    rows = [line for line in out.splitlines() if line.startswith("|") and title in line]
    assert len(rows) == 1, f"the table has {len(rows)} rows for {title!r}:\n{out}"
    return rows[0]


def the_book_id(folder: Path) -> str:
    (line,) = read_ledger(folder / "vault")
    return line["book_id"]


@pytest.fixture
def short_wait(monkeypatch):
    """A file that Windows holds for good is given up on after a short wait, so a test does not take five seconds."""
    monkeypatch.setattr(vault_changes, "HELD_FILE_WAIT", 0.3)
    monkeypatch.setattr(vault_changes, "HELD_FILE_PAUSE", 0.01)


def test_a_file_held_for_a_moment_still_leaves_the_inbox(tmp_path: Path, monkeypatch, capsys, short_wait):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    create_sample_epub(tmp_path / "inbox" / FILE)
    HeldFile(monkeypatch, times=3)

    assert inbox.main() == 0

    row = row_of(capsys.readouterr().out, TITLE)
    assert "Success" in row, row
    assert the_book_id(tmp_path) in row, row
    assert (tmp_path / "inbox" / "processed" / FILE).exists(), "the file must reach inbox/processed/"
    assert not (tmp_path / "inbox" / FILE).exists()


def test_a_file_held_past_the_wait_is_in_the_vault_and_says_so(tmp_path: Path, monkeypatch, capsys, short_wait):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    create_sample_epub(tmp_path / "inbox" / FILE)
    held = HeldFile(monkeypatch, times=10_000)

    assert inbox.main() == 0, "the book is in the vault, so the run did not fail"

    said = capsys.readouterr()
    row = row_of(said.out, TITLE)
    assert "Success" in row and "Failed" not in row, row
    assert the_book_id(tmp_path) in row, "the row must name the book it put in the vault"
    assert "-" not in row.split("|")[3], "the row must give the number of chapters"
    assert (tmp_path / "inbox" / FILE).exists(), "the file stays in inbox/"
    assert FILE in said.err and "next run" in said.err, "the run must say the file stays, and what moves it"

    # The next run finds the book in the ledger and moves the file, once Windows lets go of it
    held.let_go()
    assert inbox.main() == 0
    assert "Skipped" in row_of(capsys.readouterr().out, TITLE)
    assert (tmp_path / "inbox" / "processed" / FILE).exists()
    assert not (tmp_path / "inbox" / FILE).exists()


def test_a_held_file_of_a_book_the_ledger_knows_is_skipped_not_failed(tmp_path: Path, monkeypatch, capsys, short_wait):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    create_sample_epub(tmp_path / "inbox" / FILE)
    assert inbox.main() == 0
    shutil.copy2(tmp_path / "inbox" / "processed" / FILE, tmp_path / "inbox" / FILE)
    capsys.readouterr()
    HeldFile(monkeypatch, times=10_000)

    assert inbox.main() == 0

    row = row_of(capsys.readouterr().out, TITLE)
    assert "Skipped" in row and "Failed" not in row, row
    assert the_book_id(tmp_path) in row, row


def test_a_failed_book_makes_the_run_fail(tmp_path: Path, monkeypatch, capsys):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    (tmp_path / "inbox" / "broken.epub").write_bytes(b"this is not a book")

    assert inbox.main() == 1, "a Failed row is the only signal a person gets, so the exit code must carry it too"

    assert "Failed" in row_of(capsys.readouterr().out, "broken")
    assert (tmp_path / "inbox" / "broken.epub").exists(), "the file of a failed book stays where it is"


def test_one_failed_book_fails_the_run_and_leaves_the_others_in(tmp_path: Path, monkeypatch, capsys):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    (tmp_path / "inbox" / "broken.epub").write_bytes(b"this is not a book")
    create_sample_epub(tmp_path / "inbox" / FILE)

    assert inbox.main() == 1

    out = capsys.readouterr().out
    assert "Failed" in row_of(out, "broken")
    assert "Success" in row_of(out, TITLE)
    assert (tmp_path / "inbox" / "processed" / FILE).exists()


# --- and the control, which must stay green ---


def test_a_run_where_every_book_went_in_gives_back_0(tmp_path: Path, monkeypatch, capsys):
    inbox = an_inbox_on(tmp_path, monkeypatch)
    create_sample_epub(tmp_path / "inbox" / FILE)

    assert inbox.main() == 0

    assert "Success" in row_of(capsys.readouterr().out, TITLE)


def test_a_file_whose_book_was_set_aside_says_so_when_it_comes_back(tmp_path: Path, monkeypatch, capsys):
    """ "Already recorded in ledger" reads as "already in the vault", and a book the owner set aside is not (TL-15)."""
    inbox = an_inbox_on(tmp_path, monkeypatch)
    create_sample_epub(tmp_path / "inbox" / FILE)
    assert inbox.main() == 0
    vault = tmp_path / "vault"
    lines = read_ledger(vault)
    lines[0][SET_ASIDE] = "2026-09-17"
    write_ledger(vault, lines)
    shutil.move(vault / "books" / the_book_id(tmp_path), tmp_path / "set-aside")
    shutil.copy2(tmp_path / "inbox" / "processed" / FILE, tmp_path / "inbox" / FILE)
    capsys.readouterr()

    assert inbox.main() == 0

    out = capsys.readouterr().out
    assert "set aside on 2026-09-17" in out and "--force" in out, out
    assert "already recorded" not in out, out
