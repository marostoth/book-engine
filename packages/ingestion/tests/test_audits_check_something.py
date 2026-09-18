"""A check that read nothing says so and fails (TL-04).

Several checks reported success on empty or missing input, so a folder that does not exist, an empty vault and a
library with no practice deck all looked healthy. The system audit also started whichever app binary was on disk,
days older than the Rust it was built from, and its modularity check printed a clean line beside the word FAIL.
"""

import os
import sqlite3
from pathlib import Path
from types import ModuleType

import pytest
from conftest import REPO, load_skill
from ingest.book_check import book_problems


def anchors() -> ModuleType:
    return load_skill("audit-anchors.py")


def practice() -> ModuleType:
    return load_skill("audit-practice.py")


def system() -> ModuleType:
    return load_skill("audit-system.py")


def benchmark() -> ModuleType:
    return load_skill("benchmark-fts.py")


def a_vault(root: Path, books: int = 0, decks: int = 0, ledger: str = "[]") -> Path:
    """A vault folder with as many books and decks as asked for, and nothing else."""
    vault = root / "vault"
    (vault / "books").mkdir(parents=True, exist_ok=True)
    (vault / "notes").mkdir(parents=True, exist_ok=True)
    (vault / "_ledger.json").write_text(ledger, encoding="utf-8")
    for index in range(books):
        book = vault / "books" / f"book-{index}"
        book.mkdir()
        (book / "ch-01.md").write_text("# One\n\nA whole paragraph of a book. ^p-001\n", encoding="utf-8")
    for index in range(decks):
        notes = vault / "notes" / f"book-{index}"
        notes.mkdir(parents=True, exist_ok=True)
        (notes / "practice-deck.md").write_text("# Deck\n", encoding="utf-8")
    return vault


def point_at(mod: ModuleType, vault: Path, root: Path) -> None:
    """Makes a module of `.agent/skills/` read `vault` instead of the vault beside the repository."""
    mod.VAULT_DIR = vault
    mod.BOOKS_DIR = vault / "books"
    mod.NOTES_DIR = vault / "notes"
    if hasattr(mod, "LEDGER_PATH"):
        mod.LEDGER_PATH = vault / "_ledger.json"
    if hasattr(mod, "INBOX_PROCESSED_DIR"):
        mod.INBOX_PROCESSED_DIR = root / "inbox" / "processed"


# ---------------------------------------------------------------------------
# audit-anchors.py
# ---------------------------------------------------------------------------


def test_the_anchor_check_fails_on_a_folder_that_is_not_there(tmp_path: Path, capsys: pytest.CaptureFixture):
    """It used to print "All chapters passed" for a folder nobody had ever made, and stop with 0."""
    assert anchors().audit_book(tmp_path / "nowhere") is False
    assert "Nothing was checked" in capsys.readouterr().out


def test_the_anchor_check_fails_on_a_folder_that_holds_no_book(tmp_path: Path, capsys: pytest.CaptureFixture):
    """An empty `vault/books` holds no chapter file, so the old check read nothing and passed."""
    empty = tmp_path / "books"
    empty.mkdir()
    assert anchors().audit_book(empty) is False
    assert "holds no book" in capsys.readouterr().out


def test_the_anchor_check_reads_every_book_of_the_folder_of_books(vault_of_the_tests: Path, capsys):
    """`vault/books` is what the check reads when nobody names a folder, and it holds folders, not chapter files.

    The old check globbed `*.md` in the folder it was given and never went a level down, so the shortest way to run
    it, the one `ARCHITECTURE.md` documents, checked nothing at all and said every chapter passed.
    """
    assert anchors().audit_book(vault_of_the_tests / "books") is True
    said = capsys.readouterr().out
    assert "of 2 book(s) passed" in said
    chapters = len(list((vault_of_the_tests / "books").glob("*/*.md")))
    assert f"{chapters} chapters" in said


def test_the_anchor_check_still_finds_a_paragraph_with_no_anchor(tmp_path: Path, capsys: pytest.CaptureFixture):
    """The check must still fail for the reason it was written."""
    book = tmp_path / "a-book"
    book.mkdir()
    (book / "ch-01.md").write_text("# One\n\nA paragraph with no anchor.\n", encoding="utf-8")
    assert anchors().audit_book(book) is False
    assert "1 paragraph has no anchor" in capsys.readouterr().out


def test_an_import_cannot_write_a_book_that_has_no_chapter(tmp_path: Path):
    """`book_problems` is what an import runs before a book goes into the vault (IN-05).

    It read no file and reported nothing wrong for a folder with no chapter in it, so an empty book would have
    passed the gate that stands in front of the vault.
    """
    empty = tmp_path / "book-with-no-chapter"
    empty.mkdir()
    assert book_problems(empty) == ["book-with-no-chapter: this folder holds no chapter file, so nothing was checked."]


# ---------------------------------------------------------------------------
# audit-practice.py
# ---------------------------------------------------------------------------


def test_a_cloze_card_must_take_its_words_from_the_paragraph_it_names(tmp_path: Path):
    """The card says which paragraph it came from, and the check now reads that paragraph.

    It used to search the whole chapter, so a card could name one paragraph and quote another one, and the audit
    called it grounded. That is the one thing a practice deck audit exists to catch.
    """
    mod = practice()
    books = tmp_path / "books"
    book = books / "b1"
    notes = tmp_path / "notes" / "b1"
    book.mkdir(parents=True)
    notes.mkdir(parents=True)
    (book / "ch-01.md").write_text(
        "# One\n\n"
        "The market profile shows where trade took place. ^p-001\n\n"
        "A value area holds the middle of the day. ^p-002\n",
        encoding="utf-8",
    )
    card = (
        "### card-001\n"
        "- **Chapter:** ch-01\n"
        "- **Anchor:** {anchor}\n"
        "- **Cloze:** A {{{{c1::value area}}}} holds the middle of the day.\n"
        "- **Answer Key:** `value area`\n"
        "- **Exact Source:** A value area holds the middle of the day.\n"
    )
    deck = notes / "practice-deck.md"

    deck.write_text(card.format(anchor="^p-002"), encoding="utf-8")
    right = mod.audit_book_practice_deck(deck, books)
    assert right.mismatches == 0, right.errors

    # The same card, pointed at the paragraph beside it. Every word is still somewhere in the chapter.
    deck.write_text(card.format(anchor="^p-001"), encoding="utf-8")
    wrong = mod.audit_book_practice_deck(deck, books)
    assert wrong.mismatches == 1
    assert any("^p-001" in error for error in wrong.errors), wrong.errors


def test_a_cloze_card_that_names_no_paragraph_fails(tmp_path: Path):
    mod = practice()
    books = tmp_path / "books"
    book = books / "b1"
    notes = tmp_path / "notes" / "b1"
    book.mkdir(parents=True)
    notes.mkdir(parents=True)
    (book / "ch-01.md").write_text("# One\n\nA value area holds the middle of the day. ^p-002\n", encoding="utf-8")
    deck = notes / "practice-deck.md"
    deck.write_text(
        "### card-001\n"
        "- **Chapter:** ch-01\n"
        "- **Cloze:** A {{c1::value area}} holds the middle of the day.\n"
        "- **Answer Key:** `value area`\n"
        "- **Exact Source:** A value area holds the middle of the day.\n",
        encoding="utf-8",
    )
    result = mod.audit_book_practice_deck(deck, books)
    assert result.mismatches == 1
    assert any("names no paragraph" in error for error in result.errors), result.errors


def test_the_practice_check_fails_when_it_finds_no_deck(tmp_path: Path):
    """It printed "No practice decks found" and stopped with 0, which every script reads as a pass."""
    mod = practice()
    vault = a_vault(tmp_path)
    point_at(mod, vault, tmp_path)
    assert mod.main() == 1


def test_the_practice_check_passes_on_the_decks_of_the_vault_of_the_tests(vault_of_the_tests: Path):
    """And it still stops with 0 when there are decks and every card is sound."""
    mod = practice()
    point_at(mod, vault_of_the_tests, vault_of_the_tests.parent)
    assert mod.main() == 0


# ---------------------------------------------------------------------------
# audit-system.py
# ---------------------------------------------------------------------------


def test_the_ledger_check_fails_when_the_ledger_names_no_book(tmp_path: Path):
    """An empty ledger sent the loop over nothing, and the check reported "0 books, 0 binaries synced" and passed."""
    mod = system()
    vault = a_vault(tmp_path)
    point_at(mod, vault, tmp_path)
    result = mod.check_ledger_and_vault_parity()
    assert result.passed is False
    assert any("names no book" in error for error in result.errors), result.errors


def test_the_anchor_and_asset_check_fails_when_it_reads_no_chapter(tmp_path: Path):
    """It counted 0 anchors in 0 chapters of 0 books and called that a pass."""
    mod = system()
    vault = a_vault(tmp_path)
    point_at(mod, vault, tmp_path)
    result = mod.check_anchor_and_asset_integrity()
    assert result.passed is False
    assert any("Nothing was checked" in error for error in result.errors), result.errors


def test_the_practice_guardrail_fails_when_there_is_no_deck(tmp_path: Path):
    """The guardrail against made-up practice cards passed for a library with no practice card in it."""
    mod = system()
    vault = a_vault(tmp_path, books=1)
    point_at(mod, vault, tmp_path)
    result = mod.check_zero_hallucination_practice()
    assert result.passed is False
    assert any("Nothing was checked" in error for error in result.errors), result.errors


def test_the_checks_pass_on_a_vault_that_holds_books(vault_of_the_tests: Path, tmp_path: Path):
    """The guards fail on nothing, and they leave a vault that holds books alone."""
    mod = system()
    point_at(mod, vault_of_the_tests, tmp_path)
    assert mod.check_anchor_and_asset_integrity().passed is True

    # The vault of the tests has practice decks, so the new guard stays quiet. The books of the fixture make cloze
    # cards and no scenario cards, so the older guard against a deck of one kind speaks instead.
    guardrail = mod.check_zero_hallucination_practice()
    assert not any("Nothing was checked" in error for error in guardrail.errors), guardrail.errors
    assert "clozes" in guardrail.metric and "0 clozes" not in guardrail.metric


def test_the_launch_check_refuses_an_app_older_than_its_code(tmp_path: Path):
    """The app on disk was built days before the Rust it was built from, and starting it passed the check."""
    mod = system()
    desktop = tmp_path / "apps" / "desktop"
    exe = desktop / "src-tauri" / "target" / "release" / "book-engine-desktop.exe"
    source = desktop / "src-tauri" / "src" / "main.rs"
    exe.parent.mkdir(parents=True)
    source.parent.mkdir(parents=True)
    exe.write_bytes(b"not a real binary")
    source.write_text("fn main() {}\n", encoding="utf-8")
    old = exe.stat().st_mtime - 7 * 86400
    os.utime(exe, (old, old))

    mod.DESKTOP_DIR = desktop
    mod.ROOT_DIR = tmp_path
    result = mod.check_desktop_runtime_launch()
    assert result.passed is False
    assert "older than the code" in result.metric
    assert any("main.rs" in error and "cargo build" in error for error in result.errors), result.errors


def test_the_launch_check_takes_the_binary_that_was_built_last(tmp_path: Path):
    """It took the release binary whenever there was one, even when the debug one was newer."""
    mod = system()
    desktop = tmp_path / "apps" / "desktop"
    release = desktop / "src-tauri" / "target" / "release" / "book-engine-desktop.exe"
    debug = desktop / "src-tauri" / "target" / "debug" / "book-engine-desktop.exe"
    source = desktop / "src-tauri" / "src" / "main.rs"
    for path in (release, debug, source):
        path.parent.mkdir(parents=True, exist_ok=True)
    release.write_bytes(b"old")
    debug.write_bytes(b"new")
    source.write_text("fn main() {}\n", encoding="utf-8")
    old = debug.stat().st_mtime - 3 * 86400
    os.utime(release, (old, old))
    os.utime(source, (old - 60, old - 60))

    mod.DESKTOP_DIR = desktop
    mod.ROOT_DIR = tmp_path
    # The debug binary is the newer one, and it is newer than the code, so the check gets as far as starting it.
    result = mod.check_desktop_runtime_launch()
    assert "debug" in result.target, result.target


def test_the_audit_does_not_start_the_app_unless_it_is_asked_to():
    """Starting the app opens a window and reads the reader's own vault, so it waits for `--launch` (TL-04)."""
    source = (REPO / ".agent" / "skills" / "audit-system.py").read_text(encoding="utf-8")
    assert '"--launch"' in source
    assert "if args.launch:" in source


def test_the_modularity_check_says_what_it_found(tmp_path: Path):
    """Its line read "<= 300 lines (0 DB leaks)" whatever it found, so a failed check printed a clean result."""
    mod = system()
    vault = a_vault(tmp_path)
    (vault / "books" / "index.db").write_bytes(b"a database that does not belong in a vault")
    point_at(mod, vault, tmp_path)
    mod.ROOT_DIR = tmp_path
    mod.SKILLS_DIR = tmp_path / "skills"
    result = mod.check_modularity_and_vault_isolation()
    assert result.passed is False
    assert "1 DB leaks" in result.metric, result.metric
    assert "0 DB leaks" not in result.metric


def test_the_modularity_check_reads_the_rust_and_its_own_scripts(tmp_path: Path):
    """It read the Python of the import and the TypeScript of the app, and nothing else.

    `AGENTS.md` names `commands.rs` as its own example of a file over the line, and the check never opened a Rust
    file. The longest file in the repository is the audit script itself, and the check let it off too.
    """
    mod = system()
    vault = a_vault(tmp_path)
    point_at(mod, vault, tmp_path)
    mod.ROOT_DIR = tmp_path
    mod.SKILLS_DIR = tmp_path / "skills"
    long_rust = tmp_path / "apps" / "desktop" / "src-tauri" / "src" / "commands.rs"
    long_script = tmp_path / "skills" / "audit-everything.py"
    for path in (long_rust, long_script):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("// a line\n" * 400, encoding="utf-8")

    result = mod.check_modularity_and_vault_isolation()
    assert result.passed is False
    named = result.errors[0]
    assert "commands.rs (400 lines)" in named, named
    assert "audit-everything.py (400 lines)" in named, named


# ---------------------------------------------------------------------------
# benchmark-fts.py
# ---------------------------------------------------------------------------


def a_small_index(path: Path, words: str) -> None:
    conn = sqlite3.connect(str(path))
    try:
        benchmark().make_tables(conn)
        conn.execute(
            "INSERT INTO search_index (book_id, chapter_id, chapter_title, chapter_file, anchor, content) "
            "VALUES ('b1', 'ch-01', 'One', 'ch-01.md', '^p-001', ?)",
            (words,),
        )
        conn.commit()
    finally:
        conn.close()


def test_the_benchmark_never_writes_to_the_index_it_measures(tmp_path: Path):
    """It opened the live search database of the app read-write, set its journal mode and made tables in it.

    When it found the index empty it inserted a row per paragraph of the vault, into the file the app reads.
    """
    mod = benchmark()
    live = tmp_path / "index.db"
    a_small_index(live, "consensus and quorum and paxos")
    before = live.read_bytes(), live.stat().st_mtime_ns

    where_from = mod.index_to_measure(live, tmp_path / "copy.db")

    assert "a copy of" in where_from
    assert (live.read_bytes(), live.stat().st_mtime_ns) == before
    assert not (tmp_path / "index.db-wal").exists()
    assert (tmp_path / "copy.db").exists()


def test_the_benchmark_fails_when_a_query_finds_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys):
    """The fastest query there is, is one that finds nothing. The benchmark never looked at the results."""
    mod = benchmark()
    live = tmp_path / "index.db"
    a_small_index(live, "a paragraph about nothing in this list")
    monkeypatch.setattr(mod, "find_db_path", lambda: live)

    assert mod.run_benchmark() is False
    assert "found no paragraph at all" in capsys.readouterr().err


def test_the_benchmark_passes_when_every_query_finds_something(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mod = benchmark()
    live = tmp_path / "index.db"
    a_small_index(live, " ".join(query.rstrip("*") for query in mod.TEST_QUERIES))
    monkeypatch.setattr(mod, "find_db_path", lambda: live)

    assert mod.run_benchmark() is True


def test_a_whole_benchmark_run_leaves_the_index_alone(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """The copy is no use if the run that follows it opens the live file anyway.

    A mutation that pointed the timing loop back at the live database slipped past the test above, which only
    watches the copy being made, so this one watches the file from the first call to the last.
    """
    mod = benchmark()
    live = tmp_path / "index.db"
    a_small_index(live, " ".join(query.rstrip("*") for query in mod.TEST_QUERIES))
    monkeypatch.setattr(mod, "find_db_path", lambda: live)
    before = live.read_bytes(), live.stat().st_mtime_ns

    assert mod.run_benchmark() is True

    assert (live.read_bytes(), live.stat().st_mtime_ns) == before
    assert not (tmp_path / "index.db-wal").exists()
    assert sorted(p.name for p in tmp_path.iterdir()) == ["index.db"]


# ---------------------------------------------------------------------------
# The rules the agents read
# ---------------------------------------------------------------------------


def test_the_rules_no_longer_forbid_reading_the_files():
    """`AGENTS.md` told an agent to trust the audit and not open a file, which is how these bugs stayed hidden."""
    rules = (REPO / "AGENTS.md").read_text(encoding="utf-8")
    assert "Do not manually inspect files" not in rules
    assert "read the files a failed check names" in rules
