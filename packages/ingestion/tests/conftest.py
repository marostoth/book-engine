"""A whole vault, built here, so that no test ever opens the reader's own books (TL-02).

Eight tests in five files used to open `vault/` beside the repository: the reader's own books, their own notes and
their own topics. That had three faults at once.

- On a fresh clone four of them FAILED, because a clone has no books at all.
- Two of them fail on the owner's computer as well, and for a reason that is not about the code: one wants
  analytical notes that were never written, and one reads a topic file that git keeps, which cites two books that
  were moved out of the vault.
- They named `vault` and `.agent/skills/...` as paths relative to the folder pytest was started in, so running
  pytest from anywhere else read the wrong place, or nothing.

`vault_of_the_tests` builds a small vault once for the whole run: two books imported from EPUBs made here, their
practice decks, analytical notes, one syntopical topic and its report. Every check the live-vault tests made is
made against it, on any computer, with nothing of the reader's own in reach.

The reader's own books are still checked, by `.agent/skills/audit-anchors.py`, `audit-practice.py` and
`audit-system.py`, which read the real vault and are run by hand.
"""

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest
from ebooklib import epub
from ingest.pipeline import ingest_epub
from ingest.sample_generator import create_sample_epub

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / ".agent" / "skills"

#: The book the repository can make on its own, and a second one made here. A syntopical topic must cite two
#: different books, so one is not enough.
FIRST_BOOK = "sample"
SECOND_BOOK = "sample-two"

#: The second book carries a marked term in each paragraph, because a practice card is made from one: a bold
#: term, or a sentence of the shape "X is defined as ..." (`ingest/cloze.py`). A fixture book whose deck holds
#: no card would let a broken deck pass unseen.
SECOND_BOOK_TITLE = "Notes on Orderly Work"
SECOND_BOOK_CHAPTERS = [
    (
        "Work Shared Between Hands",
        [
            "In an orderly workshop, <strong>shared work</strong> is defined as the practice of giving each "
            "pair of hands one task of a thing instead of the whole of it.",
            "The purpose of a <strong>task boundary</strong> is marking where the work of one pair of hands "
            "ends and the work of the next pair begins.",
            "Under a shared plan, the <strong>carrying cost</strong> is defined as the time the workshop loses "
            "while it moves a half-made thing from one pair of hands to the next.",
        ],
    ),
    (
        "What the Sharing Costs",
        [
            "In a shared workshop, <strong>narrow skill</strong> is defined as the knowledge of one task that "
            "a worker keeps while the knowledge of the whole thing stays with the workshop.",
            "The purpose of an <strong>order keeper</strong> is holding the plan of every task, so that no "
            "pair of hands waits on a pair that has already finished.",
        ],
    ),
]


def load_skill(name: str) -> ModuleType:
    """One of the scripts in `.agent/skills/`, loaded by an anchored path, not by where pytest was started."""
    path = SKILLS / name
    spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
    assert spec and spec.loader, f"{path} could not be loaded"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _second_book_epub(path: Path) -> Path:
    """A second small book, so a syntopical topic can cite two of them."""
    book = epub.EpubBook()
    book.set_identifier("sample-orderly-work-01")
    book.set_title(SECOND_BOOK_TITLE)
    book.set_language("en")
    book.add_author("A Second Hand")

    documents = []
    for number, (title, paragraphs) in enumerate(SECOND_BOOK_CHAPTERS, start=1):
        body = "".join(f"<p>{text}</p>" for text in paragraphs)
        document = epub.EpubHtml(title=title, file_name=f"chap{number:02d}.xhtml", lang="en")
        document.content = f"<html><body><h1>{title}</h1>{body}</body></html>"
        book.add_item(document)
        documents.append(document)

    book.toc = tuple(documents)
    book.spine = ["nav", *documents]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    epub.write_epub(str(path), book)
    return path


def paragraphs_of(chapter: Path) -> list[tuple[str, str]]:
    """Every paragraph of a chapter file as (anchor, the words of it), in the order the chapter has them."""
    found: list[tuple[str, str]] = []
    for block in chapter.read_text(encoding="utf-8").split("\n\n"):
        one = block.strip()
        if not one.startswith("#") and " ^p-" in one:
            words, _, anchor = one.rpartition(" ^p-")
            found.append((f"^p-{anchor.strip()}", words.strip()))
    return found


def _plain_quote(paragraph: str, words: int = 8) -> str:
    """The opening words of a paragraph, as the paragraph has them, so the quote can be read back (CQ-06)."""
    return " ".join(paragraph.split()[:words])


def _write_analytical_notes(vault: Path, book_id: str) -> None:
    """Terms, arguments, critiques and inquiries for one book, each citing a paragraph that book really has."""
    chapter = vault / "books" / book_id / "ch-01.md"
    places = paragraphs_of(chapter)
    assert len(places) >= 2, f"{chapter} has {len(places)} paragraphs, and the notes need two"
    first, second = places[0], places[1]

    notes: dict[str, object] = {
        "terms": [
            {
                "id": "term-1",
                "term": "Shared Work",
                "citation": {"chapterFile": "ch-01.md", "anchor": first[0], "quote": _plain_quote(first[1])},
            }
        ],
        "arguments": [
            {
                "id": "arg-1",
                "title": "Sharing work finishes more of it",
                "conclusion": {"chapterFile": "ch-01.md", "anchor": first[0]},
                "premises": [{"chapterFile": "ch-01.md", "anchor": second[0]}],
            }
        ],
        "critiques": [
            {
                "id": "crit-1",
                "targetArgumentId": "arg-1",
                "judgment": "disagree",
                "defects": ["incomplete"],
                "understandingDeclared": True,
                "rationale": "The passage does not say what the sharing costs.",
            }
        ],
        "inquiries": [
            {
                "id": "inq-1",
                "question": "What does sharing work cost?",
                "domain": "theoretical",
                "priority": "primary",
                "citation": {"chapterFile": "ch-01.md", "anchor": first[0]},
                "resolution": "solved",
                "solutionArgumentIds": ["arg-1"],
                "solutionCitation": {"chapterFile": "ch-01.md", "anchor": second[0]},
            }
        ],
    }
    notes_dir = vault / "notes" / book_id
    notes_dir.mkdir(parents=True, exist_ok=True)
    (notes_dir / "analytical.json").write_text(json.dumps(notes, indent=2), encoding="utf-8")


def _write_syntopicon(vault: Path, topic_id: str = "shared-work") -> None:
    """One topic that cites both books, and the report that goes with it."""
    places = {}
    for book_id in (FIRST_BOOK, SECOND_BOOK):
        chapter = vault / "books" / book_id / "ch-01.md"
        found = paragraphs_of(chapter)
        assert found, f"{chapter} has no paragraph with an anchor"
        places[book_id] = (found[0][0], _plain_quote(found[0][1]))

    def citation(book_id: str) -> dict[str, str]:
        anchor, quote = places[book_id]
        return {"bookId": book_id, "chapterFile": "ch-01.md", "anchor": anchor, "quote": quote}

    topic = {
        "id": topic_id,
        "title": "Shared Work",
        "description": "What two books say about splitting one task between many hands.",
        "neutralTerms": [
            {
                "id": "term-shared-work",
                "term": "Shared Work",
                "neutralDefinition": "Splitting one piece of work between several hands.",
                "mappings": [
                    {"bookId": book_id, "authorVariant": "Shared Work", "citation": citation(book_id)}
                    for book_id in (FIRST_BOOK, SECOND_BOOK)
                ],
            }
        ],
        "questions": [{"id": "q-shared-work", "question": "What does sharing work cost?", "order": 1}],
        "controversies": [
            {
                "id": "c-shared-work",
                "questionId": "q-shared-work",
                "title": "More Work Done against More Waiting",
                "perspectives": [
                    {
                        "bookId": book_id,
                        "stance": "Sharing work between hands changes what the whole can do.",
                        "citations": [citation(book_id)],
                    }
                    for book_id in (FIRST_BOOK, SECOND_BOOK)
                ],
            }
        ],
        "synthesisNotes": "Both books agree that the sharing is not free.",
        "dialecticalResolution": "The gain and the cost are read together, not one without the other.",
        "createdAt": "2026-09-18T00:00:00Z",
    }

    topics_dir = vault / "syntopicon" / "topics"
    topics_dir.mkdir(parents=True, exist_ok=True)
    (topics_dir / f"{topic_id}.json").write_text(json.dumps(topic, indent=2), encoding="utf-8")

    # A link of a report is written from the folder the report is saved in (CQ-06).
    links = "\n".join(
        f"- [`ch-01.md#{places[book_id][0]}`](../../books/{book_id}/ch-01.md#{places[book_id][0]})"
        for book_id in (FIRST_BOOK, SECOND_BOOK)
    )
    reports_dir = vault / "syntopicon" / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / f"{topic_id}-synthesis.md").write_text(
        f"---\ntopic_id: {topic_id}\n---\n\n# Shared Work\n\nBoth books speak about it.\n\n{links}\n",
        encoding="utf-8",
    )


@pytest.fixture(scope="session")
def vault_of_the_tests(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A vault with two books, their practice decks, analytical notes, one topic and its report.

    It is built once for the whole run, and it is a temporary folder, so a test can read it but nothing of the
    reader's own is ever in reach. A test that changes it must copy it first.
    """
    root = tmp_path_factory.mktemp("vault-of-the-tests")
    vault = root / "vault"

    first = create_sample_epub(root / "first.epub")
    ingest_epub(first, vault, custom_book_id=FIRST_BOOK)

    second = _second_book_epub(root / "second.epub")
    ingest_epub(second, vault, custom_book_id=SECOND_BOOK)

    _write_analytical_notes(vault, FIRST_BOOK)
    _write_syntopicon(vault)
    return vault
