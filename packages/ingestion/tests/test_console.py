"""A command may print any letter of any book, and saying what it did may never make it fail (IN-09).

Windows gives a command that writes into a pipe or into a file the code page of the machine, such as cp1252. A
book title of Cyrillic letters is not in that code page. The import used to print the title AFTER it wrote every
file, so `UnicodeEncodeError` made the command say "Ingestion failed" and give back 1 when nothing had failed.

Every test here sets `PYTHONIOENCODING` or holds its own stream, so the same thing is proved on any machine.
"""

import importlib.util
import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path
from types import ModuleType
from typing import List

import pytest

from ingest.console import allow_any_letter, say_what_was_done

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "packages" / "ingestion"
SKILLS = ROOT / ".agent" / "skills"

# "War and Peace" in Russian. No code page of one byte a Windows machine uses by default holds these letters.
TITLE = "Война и мир"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE_FILE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">any-letter</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>ru</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="d0" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="d1" href="c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="d0"/><itemref idref="d1"/></spine>
</package>
"""
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol></ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Chapter</title></head>
<body>{body}</body>
</html>
"""
# A paragraph long enough that the import keeps its page: a page of under 20 letters is dropped as blank
PLAIN = (
    "<p>The great commerce of every civilized society is that carried on between the inhabitants of the town "
    "and those of the country.</p>"
)


def make_book(path: Path, title: str = TITLE) -> Path:
    """A little EPUB of two chapters, with `title` as its title."""
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE_FILE.format(title=title))
        book.writestr("OEBPS/nav.xhtml", NAV)
        book.writestr("OEBPS/c1.xhtml", DOCUMENT.format(body="<h2>Chapter One</h2>" + PLAIN))
        book.writestr("OEBPS/c2.xhtml", DOCUMENT.format(body="<h2>Chapter Two</h2>" + PLAIN))
    return path


class Pipe:
    """A stream like the one Windows gives a command whose output goes into a pipe or into a log file."""

    def __init__(self, encoding: str = "cp1252", errors: str = "strict") -> None:
        self.bytes = io.BytesIO()
        self.text = io.TextIOWrapper(self.bytes, encoding=encoding, errors=errors, newline="")

    def read(self) -> str:
        self.text.flush()
        return self.bytes.getvalue().decode("utf-8", errors="replace")


class StreamThatCannotChange:
    """A stream of a kind that has no way to change its encoding, such as one a test or a tool holds."""

    def __init__(self) -> None:
        self.said: List[str] = []
        self.encoding = "cp1252"

    def write(self, text: str) -> int:
        text.encode(self.encoding)  # a cp1252 stream refuses a letter it has no room for
        self.said.append(text)
        return len(text)

    def flush(self) -> None:
        pass


class StreamThatRefusesToChange(StreamThatCannotChange):
    """A stream that has the way but will not take it."""

    def reconfigure(self, **_: object) -> None:
        raise ValueError("this stream keeps the encoding it was made with")


class ClosedPipe:
    """A pipe whose reader went away, as `command | head -3` leaves one."""

    def write(self, text: str) -> int:
        raise BrokenPipeError(32, "The pipe is being closed")

    def flush(self) -> None:
        pass


@pytest.fixture()
def streams(monkeypatch):
    """Puts a stream of this test's own in front of both of the command's, and gives a way to swap either one.

    Both are swapped every time, because `allow_any_letter` changes both and the change cannot be taken back.
    """
    made = {"out": Pipe(), "errors": Pipe()}

    def use(out=None, errors=None):
        if out is not None:
            made["out"] = out
        if errors is not None:
            made["errors"] = errors
        monkeypatch.setattr(sys, "stdout", getattr(made["out"], "text", made["out"]))
        monkeypatch.setattr(sys, "stderr", getattr(made["errors"], "text", made["errors"]))
        return made["out"], made["errors"]

    use()
    return use


# ------------------------------------------------------------------ a command may print any letter


def test_a_pipe_that_takes_only_plain_letters_takes_a_cyrillic_title_after(streams) -> None:
    out, _ = streams(out=Pipe())
    allow_any_letter()
    print(f"[+] Successfully ingested '{TITLE}'")
    assert TITLE in out.read()


def test_what_a_command_complains_of_takes_any_letter_too(streams) -> None:
    _, errors = streams(errors=Pipe())
    allow_any_letter()
    print(f"[-] {TITLE}", file=sys.stderr)
    assert TITLE in errors.read()


def test_a_console_that_takes_every_letter_already_is_left_as_it_is(streams) -> None:
    out, _ = streams(out=Pipe(encoding="utf-8"))
    allow_any_letter()
    assert sys.stdout.encoding == "utf-8"
    print(TITLE)
    assert TITLE in out.read()


def test_a_stream_that_cannot_change_its_encoding_is_left_alone(streams) -> None:
    held, _ = streams(out=StreamThatCannotChange())
    allow_any_letter()  # says nothing, raises nothing
    print("[+] plain letters still go through")
    assert "".join(held.said).startswith("[+] plain letters")


def test_a_stream_that_refuses_to_change_its_encoding_is_left_alone(streams) -> None:
    held, _ = streams(out=StreamThatRefusesToChange())
    allow_any_letter()  # the refusal is not a crash
    print("[+] plain letters still go through")
    assert "".join(held.said).startswith("[+] plain letters")


def test_a_letter_that_no_stream_can_take_is_printed_as_a_question_mark(streams) -> None:
    out, _ = streams(out=Pipe())
    allow_any_letter()
    print("half a letter: \udcff")  # one half of a pair, which not even UTF-8 can write
    assert "half a letter: ?" in out.read()


# ------------------------------------------------------------------ saying what was done may not undo it


def test_every_sentence_is_printed_in_order(monkeypatch) -> None:
    pipe = Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", pipe.text)
    say_what_was_done(["[+] one", "[+] two", "[+] three"])
    assert pipe.read().split("\n")[:3] == ["[+] one", "[+] two", "[+] three"]


def test_it_can_say_it_on_the_error_stream(monkeypatch) -> None:
    out, errors = Pipe(encoding="utf-8"), Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", out.text)
    monkeypatch.setattr(sys, "stderr", errors.text)
    say_what_was_done(["[!] the book was replaced"], to_errors=True)
    assert "[!] the book was replaced" in errors.read()
    assert out.read() == ""


def test_a_stream_that_cannot_take_a_letter_does_not_stop_the_command(monkeypatch) -> None:
    held, errors = StreamThatCannotChange(), Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", held)
    monkeypatch.setattr(sys, "stderr", errors.text)
    say_what_was_done([f"[+] Successfully ingested '{TITLE}'"])  # raises nothing
    assert "The work is done" in errors.read()


def test_a_pipe_whose_reader_went_away_does_not_stop_the_command(monkeypatch) -> None:
    errors = Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", ClosedPipe())
    monkeypatch.setattr(sys, "stderr", errors.text)
    say_what_was_done(["[+] one", "[+] two"])  # raises nothing
    assert "The work is done" in errors.read()
    assert "BrokenPipeError" in errors.read(), "the line names what went wrong, in plain letters"


def test_the_line_about_a_stream_holds_plain_letters_only(monkeypatch) -> None:
    held, errors = StreamThatCannotChange(), StreamThatCannotChange()
    monkeypatch.setattr(sys, "stdout", held)
    monkeypatch.setattr(sys, "stderr", errors)
    say_what_was_done([f"[+] {TITLE}"])
    assert "The work is done" in "".join(errors.said), "a cp1252 stream can take the line about it"


def test_nothing_is_left_to_say_it_with_and_the_command_still_lives(monkeypatch) -> None:
    monkeypatch.setattr(sys, "stdout", ClosedPipe())
    monkeypatch.setattr(sys, "stderr", ClosedPipe())
    say_what_was_done(["[+] the book is in the vault"])  # raises nothing


def test_a_fault_in_making_a_sentence_is_not_swallowed(monkeypatch) -> None:
    pipe = Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", pipe.text)

    def sentences():
        yield "[+] one"
        raise KeyError("the command itself has a fault")

    with pytest.raises(KeyError):
        say_what_was_done(sentences())
    assert pipe.read() == "", "a sentence is made before any of them is printed"


# ------------------------------------------------------------------ the import command


def cp1252_command(*more: str) -> subprocess.CompletedProcess:
    """Runs the import command with a stream that takes plain letters only, as a pipe on Windows does."""
    env = dict(os.environ, PYTHONIOENCODING="cp1252")
    return subprocess.run(
        [sys.executable, "-m", "ingest.cli", *more],
        cwd=PACKAGE, capture_output=True, env=env, encoding="utf-8", errors="replace",
    )


def test_the_import_command_says_it_worked_and_gives_back_zero(tmp_path: Path) -> None:
    book = make_book(tmp_path / "book.epub")
    vault = tmp_path / "vault"
    done = cp1252_command(str(book), "--vault", str(vault), "--book-id", "any-letter")

    assert done.returncode == 0, done.stdout + done.stderr
    assert "Ingestion failed" not in done.stderr
    assert "Traceback" not in done.stderr
    assert "Successfully ingested" in done.stdout


def test_the_import_command_prints_the_title_as_the_book_has_it(tmp_path: Path) -> None:
    book = make_book(tmp_path / "book.epub")
    vault = tmp_path / "vault"
    done = cp1252_command(str(book), "--vault", str(vault), "--book-id", "any-letter")

    assert TITLE in done.stdout, done.stdout
    meta = json.loads((vault / "books" / "any-letter" / "_meta.json").read_text(encoding="utf-8"))
    assert meta["title"] == TITLE
    assert meta["total_chapters"] == 2


def test_the_import_command_still_says_so_when_it_really_fails(tmp_path: Path) -> None:
    not_a_book = tmp_path / "not-a-book.epub"
    not_a_book.write_bytes(b"this is not an EPUB at all")
    done = cp1252_command(str(not_a_book), "--vault", str(tmp_path / "vault"), "--book-id", "any-letter")

    assert done.returncode == 1, done.stdout + done.stderr
    assert "Ingestion failed" in done.stderr


def test_the_book_is_imported_whatever_the_console_takes(tmp_path: Path, monkeypatch) -> None:
    """Even a stream that will not change its encoding cannot turn a finished import into a failure."""
    from ingest import cli

    book = make_book(tmp_path / "book.epub")
    vault = tmp_path / "vault"
    held, errors = StreamThatRefusesToChange(), Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", held)
    monkeypatch.setattr(sys, "stderr", errors.text)
    monkeypatch.setattr(sys, "argv", ["book-ingest", str(book), "--vault", str(vault), "--book-id", "any-letter"])

    cli.main()  # gives back nothing and raises nothing, so the command ends with 0

    meta = json.loads((vault / "books" / "any-letter" / "_meta.json").read_text(encoding="utf-8"))
    assert meta["title"] == TITLE
    assert "The work is done" in errors.read()


def test_a_batch_counts_a_book_it_wrote_whatever_the_console_takes(tmp_path: Path, monkeypatch) -> None:
    """`batch_ingest` says what it wrote the same way, so a title it cannot print is no failed book."""
    from ingest.batch import batch_ingest

    source = tmp_path / "source"
    source.mkdir()
    make_book(source / "voyna.epub")
    held, errors = StreamThatCannotChange(), Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", held)
    monkeypatch.setattr(sys, "stderr", errors.text)

    done = batch_ingest(source, tmp_path / "vault", stop_on_error=True)

    assert [meta.title for meta in done] == [TITLE]
    assert "Failed to ingest" not in "".join(held.said)
    assert "The work is done" in errors.read()


# ------------------------------------------------------------------ the inbox skill


def load_skill(name: str) -> ModuleType:
    """The skill `name` as a module, so a test can give it folders of its own."""
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SKILLS / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def inbox_skill(tmp_path: Path, monkeypatch):
    """The inbox skill, with an inbox and a vault of its own. The real inbox and vault are never touched."""
    skill = load_skill("process-inbox")
    monkeypatch.setattr(skill, "INBOX_DIR", tmp_path / "inbox")
    monkeypatch.setattr(skill, "PROCESSED_DIR", tmp_path / "inbox" / "processed")
    monkeypatch.setattr(skill, "VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr(sys, "argv", ["process-inbox.py"])
    (tmp_path / "inbox").mkdir()
    make_book(tmp_path / "inbox" / "voyna.epub")
    return skill


def test_the_table_of_the_inbox_skill_is_made_before_it_is_printed(monkeypatch) -> None:
    skill = load_skill("process-inbox")
    held = StreamThatCannotChange()
    monkeypatch.setattr(sys, "stdout", held)
    lines = skill.status_table([{"book_id": "voyna", "title": TITLE, "chapters": "2",
                                "anchors": "PASS", "status": "Success"}])
    assert held.said == [], "making the table prints nothing"
    assert any(TITLE in line for line in lines)


def test_the_inbox_skill_reports_the_book_it_imported(inbox_skill, tmp_path: Path, streams) -> None:
    out, _ = streams(out=Pipe())

    assert inbox_skill.main() == 0

    said = out.read()
    assert f"Successfully ingested '{TITLE}'" in said
    assert "Success" in said and "Failed" not in said
    assert (tmp_path / "vault" / "books" / "voyna").is_dir()
    assert (tmp_path / "inbox" / "processed" / "voyna.epub").is_file()


def test_the_inbox_skill_ends_well_when_the_console_will_not_change(inbox_skill, tmp_path: Path, monkeypatch) -> None:
    held, errors = StreamThatRefusesToChange(), Pipe(encoding="utf-8")
    monkeypatch.setattr(sys, "stdout", held)
    monkeypatch.setattr(sys, "stderr", errors.text)

    assert inbox_skill.main() == 0, "the book is in the vault, so the run did not fail"

    assert (tmp_path / "vault" / "books" / "voyna").is_dir()
    ledger = json.loads((tmp_path / "vault" / "_ledger.json").read_text(encoding="utf-8"))
    assert [entry["title"] for entry in ledger] == [TITLE]
    assert "The work is done" in errors.read()


# ------------------------------------------------------------------ every command keeps the rule


def commands() -> List[Path]:
    """Every command of the repository: a Python file that can be run on its own.

    The list is read from the files, so a command written later is looked at too.
    """
    found = sorted(SKILLS.glob("*.py")) + sorted((PACKAGE / "ingest").glob("*.py"))
    return [path for path in found if 'if __name__ == "__main__":' in path.read_text(encoding="utf-8")]


def test_there_are_commands_to_look_at() -> None:
    assert len(commands()) >= 8, "the list of commands is read from the files, so it must not come back empty"


@pytest.mark.parametrize("command", commands(), ids=lambda path: path.name)
def test_every_command_lets_the_console_take_any_letter(command: Path) -> None:
    text = command.read_text(encoding="utf-8")
    assert "allow_any_letter()" in text, (
        f"{command.name} is a command, so it must call allow_any_letter() before it prints anything (IN-09)"
    )
