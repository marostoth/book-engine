"""The vault the tests read is the one they built, and no test reaches for the one beside the repository (TL-02).

`conftest.py` builds `vault_of_the_tests` once for a run. These tests pin what it holds, so a check that needs a
practice deck or a topic cannot quietly start passing on an empty one, and they hold the door shut behind it: a
test that writes `Path("vault")` is reading the reader's own books again, which is what TL-02 is about.
"""

import ast
import json
from pathlib import Path

from conftest import FIRST_BOOK, REPO, SECOND_BOOK

TESTS = Path(__file__).resolve().parent

#: A path written like this is read from whatever folder pytest was started in. For these two names that folder
#: is the repository, so the path reaches the reader's own books and their own notes.
NAMES_OF_THE_REAL_THING = ("vault", ".agent")


def paths_relative_to_the_working_folder(source: str) -> list[str]:
    """Every `Path("vault...")` or `Path(".agent...")` in one file of Python."""
    found: list[str] = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or node.func.id != "Path":
            continue
        if not node.args or not isinstance(node.args[0], ast.Constant):
            continue
        first = node.args[0].value
        if isinstance(first, str) and first.split("/")[0] in NAMES_OF_THE_REAL_THING:
            found.append(first)
    return found


def test_the_guard_knows_a_path_of_the_working_folder_when_it_sees_one():
    """The guard below is only worth having while it still finds what it looks for.

    Without this, the names it looks for could be changed to something no test ever writes, and the guard would
    go on passing for ever while reading nothing.
    """
    caught = paths_relative_to_the_working_folder(
        "from pathlib import Path\n"
        'a = Path("vault")\n'
        'b = Path("vault/books/some-book/ch-01.md")\n'
        'c = Path(".agent/skills/audit-system.py")\n'
    )
    assert caught == ["vault", "vault/books/some-book/ch-01.md", ".agent/skills/audit-system.py"]

    allowed = paths_relative_to_the_working_folder(
        "from pathlib import Path\n"
        "def t(tmp_path):\n"
        '    a = tmp_path / "vault"\n'
        '    b = Path(__file__).resolve().parents[3] / "vault"\n'
        '    c = "vault is only a word here"\n'
    )
    assert allowed == [], "a vault of its own, and a word in a sentence, are not a path of the working folder"


def test_no_test_opens_the_vault_beside_the_repository():
    """A test reads the vault it built, never the one the reader keeps their own books in."""
    reaching = {
        path.name: paths_relative_to_the_working_folder(path.read_text(encoding="utf-8"))
        for path in sorted(TESTS.glob("*.py"))
    }
    reaching = {name: paths for name, paths in reaching.items() if paths}
    assert reaching == {}, f"These tests read the reader's own files: {reaching}"


def test_the_vault_of_the_tests_holds_two_whole_books(vault_of_the_tests: Path):
    """Two books, each with chapters, a `_meta.json` and a practice deck."""
    for book_id in (FIRST_BOOK, SECOND_BOOK):
        book = vault_of_the_tests / "books" / book_id
        assert (book / "_meta.json").exists()
        assert sorted(p.name for p in book.glob("ch-*.md")) == ["ch-01.md", "ch-02.md"]
        assert (vault_of_the_tests / "notes" / book_id / "practice-deck.md").exists()


def test_the_vault_of_the_tests_holds_notes_a_check_can_read(vault_of_the_tests: Path):
    """Analytical notes of all four kinds, one topic that cites two books, and the report of that topic."""
    notes = json.loads((vault_of_the_tests / "notes" / FIRST_BOOK / "analytical.json").read_text(encoding="utf-8"))
    for kind in ("terms", "arguments", "critiques", "inquiries"):
        assert len(notes[kind]) >= 1, f"the notes of the tests hold no {kind}"

    topics = sorted((vault_of_the_tests / "syntopicon" / "topics").glob("*.json"))
    assert len(topics) == 1
    topic = json.loads(topics[0].read_text(encoding="utf-8"))
    cited = {mapping["bookId"] for term in topic["neutralTerms"] for mapping in term["mappings"]}
    assert cited == {FIRST_BOOK, SECOND_BOOK}, "a topic must cite two books, or its audit cannot pass"

    reports = sorted((vault_of_the_tests / "syntopicon" / "reports").glob("*.md"))
    assert len(reports) == 1


def test_the_vault_of_the_tests_is_not_the_one_beside_the_repository(vault_of_the_tests: Path):
    """The fixture is a temporary folder, so nothing a test does can touch the reader's books."""
    assert vault_of_the_tests != REPO / "vault"
    assert REPO not in vault_of_the_tests.parents


def test_a_quote_of_the_topic_is_read_back_from_the_paragraph_it_names(vault_of_the_tests: Path):
    """The fixture takes each quote out of the paragraph it cites, so the quote check has something to pass on."""
    from ingest.citations import quote_that_moved

    topic = json.loads(next((vault_of_the_tests / "syntopicon" / "topics").glob("*.json")).read_text(encoding="utf-8"))
    citation = topic["neutralTerms"][0]["mappings"][0]["citation"]
    chapter = (vault_of_the_tests / "books" / citation["bookId"] / citation["chapterFile"]).read_text(encoding="utf-8")
    assert quote_that_moved(citation, chapter) is None

    moved = dict(citation, quote="words that the book never wrote at all")
    assert quote_that_moved(moved, chapter) is not None
