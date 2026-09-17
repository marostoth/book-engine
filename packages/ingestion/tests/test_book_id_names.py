"""A book id comes from the name of the file, and names in other scripts give ids of their own (IN-03).

The id kept only the letters a-z and the digits of the name. An EPUB named "Война и мир" or "战争与和平" got the id
"sample" and replaced the sample book, a PDF with such a name got "unnamed-book", and "Économie" lost its "É".
"""

from pathlib import Path

from ebooklib import epub

from ingest.book_id import check_book_id
from ingest.epub_parser import extract_metadata
from ingest.pdf_sanitizer import generate_pdf_slug
from ingest.pipeline import ingest_book
from ingest.sample_generator import create_sample_epub

#: Names that the letters a-z cannot write, or that have no letter at all.
OTHER_NAMES = ["Война и мир", "Война и мир 2", "Анна Каренина 2", "战争与和平", "Ελληνικά", "مقدمة ابن خلدون", "!!!", "…"]


def epub_id(name: str) -> str:
    return extract_metadata(epub.EpubBook(), name)[0]


def pdf_id(name: str) -> str:
    """The id of a PDF with no title of its own: the importer then gives the file name as the title."""
    return generate_pdf_slug(f"{name}.pdf", name)


def files_under(folder: Path) -> dict:
    return {str(path.relative_to(folder)): path.read_bytes() for path in sorted(folder.rglob("*")) if path.is_file()}


def make_epub(path: Path, title: str) -> Path:
    """A small EPUB book with one chapter."""
    book = epub.EpubBook()
    book.set_identifier(f"test-{len(title)}")
    book.set_title(title)
    book.set_language("ru")
    chapter = epub.EpubHtml(title="Глава 1", file_name="chapter-1.xhtml", lang="ru")
    chapter.content = "<html><body><h1>Глава 1</h1><p>Ещё в начале июля, в чрезвычайно жаркое время.</p></body></html>"
    book.add_item(chapter)
    book.toc = [epub.Link("chapter-1.xhtml", "Глава 1", "chapter-1")]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", chapter]
    epub.write_epub(str(path), book)
    return path


def test_names_in_other_scripts_get_ids_of_their_own() -> None:
    for book_id_of in (epub_id, pdf_id):
        ids = [book_id_of(name) for name in OTHER_NAMES]

        assert len(set(ids)) == len(OTHER_NAMES), ids
        assert not {"sample", "unnamed-book", "2"} & set(ids), ids
        for book_id in ids:
            check_book_id(book_id)
        assert [book_id_of(name) for name in OTHER_NAMES] == ids, "the same name always gives the same id"


def test_a_long_name_gets_a_code_and_an_id_that_follows_the_rule() -> None:
    peace, war = "a" * 250 + " и мир", "a" * 250 + " и война"
    for book_id_of in (epub_id, pdf_id):
        ids = [book_id_of(peace), book_id_of(war)]

        assert ids[0] != ids[1], ids
        for book_id in ids:
            check_book_id(book_id)


def test_letters_with_accents_become_plain_letters() -> None:
    assert epub_id("Économie – 2024") == "economie---2024"
    assert epub_id("Straße") == "strasse"
    assert pdf_id("Économie politique") == "economie-politique"


def test_plain_names_keep_their_ids() -> None:
    assert epub_id("sample") == "sample"
    assert epub_id("wealth-of-nations") == "wealth-of-nations"
    assert epub_id("My Book (2nd ed.)") == "my-book--2nd-ed"
    kotler = "[MKTG] Kotler P., Armstrong G. Principles of Marketing 19ed 2023.pdf"
    assert generate_pdf_slug(kotler, "Principles of Marketing, Global Edition") == "principles-of-marketing-19ed"
    dalton = "[TRADE] Dalton J. Mind Over Markets Power Trading with Market Generated Information, Updated Edition"
    assert pdf_id(dalton) == "dalton-j-mind-over-markets-power-trading-with-market-generated-information-updated-edition"


def test_a_book_whose_name_has_no_latin_letters_leaves_the_sample_book_alone(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    ingest_book(create_sample_epub(tmp_path / "sample.epub"), vault)
    sample_book = files_under(vault / "books" / "sample")
    sample_notes = files_under(vault / "notes" / "sample")

    war_and_peace = ingest_book(make_epub(tmp_path / "Война и мир.epub", "Война и мир"), vault)

    assert war_and_peace.book_id != "sample"
    assert (vault / "books" / war_and_peace.book_id / "_meta.json").exists()
    assert files_under(vault / "books" / "sample") == sample_book
    assert files_under(vault / "notes" / "sample") == sample_notes
