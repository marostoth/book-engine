"""The import fits any book, not one book, and it loses no picture (IN-10).

Some rules of the import were tuned while the owner's own books were imported, and named the people and the
things of those books. Other rules lost or wrote over a picture:

- A picture of a page was deleted because a picture of the NEXT page had a snapshot. `pymupdf4llm` names a
  picture file by the 1-based page of the book, and the rule also took the 0-based index, which is the file of
  the page before. 4 pictures of Mind Over Markets and 48 of Principles of Marketing went that way.
- Figure 2.1 and Figure 3.1 of the same part wrote one file, so one figure showed the picture of the other.
  3 figures of Principles of Marketing did.
- Two pictures of an EPUB that share a plain name wrote one file.
- Every PDF was written down as English, whatever it said it was in.
- An EPUB with no contents got no contents at all, where the code said it would make some from the chapters.

Every test here makes its own little book, so none of them needs a book of yours.
"""

import json
import zipfile
from pathlib import Path
from typing import Dict, List

import pymupdf
import pytest

from ingest.assets import extract_epub_assets, suppress_page_images, svg_without_script
from ingest.models import ChapterMeta
from ingest.pdf_sanitizer import book_language
from ingest.pipeline import ingest_epub
from ingest.scenarios import generate_chapter_scenario_cards, tells_a_story
from ingest.toc_links import contents_of_chapters
from ingest.vector_figures import figure_file_name

BOOK_ID = "any-book"
INGEST = Path(__file__).resolve().parents[1] / "ingest"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">any-book</dc:identifier>
    <dc:title>Any Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>
"""
NAV_WITH_NOTHING = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol></ol></nav></body>
</html>
"""
NAV_WITH_ENTRIES = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="c1.xhtml">The First Way</a></li>
  <li><a href="c2.xhtml">The Second Way</a></li>
</ol></nav></body>
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

# A one-pixel PNG, which is too small to keep, and a bigger one that the import keeps
BIG_PNG = None  # made once by _big_png()


def _big_png() -> bytes:
    """A plain PNG of 80 by 80, big enough that the import keeps it."""
    global BIG_PNG
    if BIG_PNG is None:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 80), False)
        pix.clear_with(200)
        BIG_PNG = pix.tobytes("png")
    return BIG_PNG


def make_book(path: Path, documents: Dict[str, str], nav: str = NAV_WITH_NOTHING,
              pictures: Dict[str, bytes] = None) -> Path:
    manifest = "".join(
        f'<item id="d{n}" href="{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    )
    for n, name in enumerate(pictures or {}):
        kind = "image/svg+xml" if name.lower().endswith(".svg") else "image/png"
        manifest += f'<item id="i{n}" href="{name}" media-type="{kind}"/>'
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", nav)
        for name, body in documents.items():
            book.writestr(f"OEBPS/{name}", DOCUMENT.format(body=body))
        for name, data in (pictures or {}).items():
            book.writestr(f"OEBPS/{name}", data)
    return path


def import_book(folder: Path, documents: Dict[str, str], nav: str = NAV_WITH_NOTHING):
    """Imports a book of these documents into a new vault, and gives its `_meta.json`."""
    path = make_book(folder / f"{BOOK_ID}.epub", documents, nav)
    ingest_epub(path, folder / "vault")
    book_dir = folder / "vault" / "books" / BOOK_ID
    return json.loads((book_dir / "_meta.json").read_text(encoding="utf-8")), book_dir


def two_chapters() -> Dict[str, str]:
    return {
        "c1.xhtml": "<h2>The First Way</h2>" + PLAIN,
        "c2.xhtml": "<h2>The Second Way</h2>" + PLAIN,
    }


# ------------------------------------------------------------------ a paragraph that tells a story


STORY = (
    "Jan had woken up before five that morning. He looked at his screen for a long while, and then he "
    "put his hand on the telephone and asked his broker what the night had done to the price."
)
TEXTBOOK = (
    "The campaign was picked up by over 800 media outlets around the world in two weeks, and the brand "
    "reported a rise of 48 percent in the number of people who could name it without help."
)
OLD_BOOK = (
    "Some part even of the French wine drank in Great Britain is imported from Holland, and the duty upon "
    "it is paid by the merchant who brings it in, and not by the man who drinks it at his own table."
)


def test_a_paragraph_that_tells_what_one_person_did_is_a_story():
    assert tells_a_story(STORY)


def test_a_textbook_that_says_a_story_was_picked_up_is_no_story():
    assert not tells_a_story(TEXTBOOK), "a campaign picked up by the media is not a person picking something up"


def test_wine_drank_in_a_country_is_no_story():
    assert not tells_a_story(OLD_BOOK)


def test_a_paragraph_about_one_person_with_no_story_phrase_is_no_story():
    about_a_person = (
        "He holds his shares for many years, and his brother holds hers for as long. He says that a share "
        "he has held since he was young has paid him more than his house ever did, and she agrees with him."
    )
    assert not tells_a_story(about_a_person), "many he and she words alone make no story"


def test_a_long_paragraph_with_one_person_word_is_no_story():
    long_one = TEXTBOOK + " " + " ".join(["The market moved again that day."] * 8) + " He agreed."
    assert not tells_a_story(long_one)


def test_a_paragraph_of_no_words_is_no_story():
    assert not tells_a_story("")


def test_no_rule_of_the_quiz_cards_names_a_book():
    """The rule itself, not the note beside it, is what the import runs."""
    from ingest.scenarios import NARRATIVE_PHRASE

    for named in ("cattle rancher", "ranching days", "quote equipment", "auction off his livestock",
                  "sank deeper into his chair", "the end of a pencil"):
        assert named not in NARRATIVE_PHRASE.pattern, f"{named!r} names one book, so it is no rule of the import"


def test_a_story_makes_no_quiz_card_and_the_rest_of_the_chapter_does():
    ordinary = [
        "The town and the country trade with one another, and each gives the other what it cannot make for "
        "itself. That is the whole of the commerce between them.",
        "A shop that knows its buyers keeps them for longer than a shop that does not. The cost of keeping a "
        "buyer is lower than the cost of finding a new one.",
        "A price that moves all day tells a trader less than a price that stands still for an hour. The hour "
        "of quiet is where the day makes up its mind.",
        "A market with many sellers and few buyers falls until a buyer comes back to it. The fall is not a "
        "fault of the market but the work of it.",
        "Every trade needs a buyer and a seller who disagree about the price to come. They agree only about "
        "the price of the moment they trade in.",
        "A book of accounts shows what a business did last year and not what it will do next year. A reader "
        "who forgets that reads the wrong thing from it.",
    ]
    blocks = [f"{STORY} ^p-001", f"{TEXTBOOK} ^p-002", f"{OLD_BOOK} ^p-003"]
    blocks += [f"{text} ^p-{n:03d}" for n, text in enumerate(ordinary, start=4)]
    chapter = "\n\n".join(blocks)

    cards = generate_chapter_scenario_cards(chapter, "ch-01", max_items=5)

    assert cards, "the paragraphs that are not stories still make cards"
    said = " ".join(option.text for card in cards for option in card.options)
    said += " ".join(card.scenario for card in cards)
    assert "woken up" not in said and "his broker" not in said, "no sentence of the story is in a card"


# ------------------------------------------------------------------ a picture of a page stays with its page


def picture_link(page_one_based: int, number: int = 1) -> str:
    return f"![](assets/book.pdf-{page_one_based:04d}-{number:02d}.png)"


def test_the_picture_of_a_page_with_a_snapshot_goes(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "book.pdf-0031-01.png").write_bytes(b"a picture")
    text = f"Words. {picture_link(31)} More words."

    left = suppress_page_images(text, assets, {30})  # page index 30 is page 31 of the book

    assert picture_link(31) not in left
    assert not (assets / "book.pdf-0031-01.png").exists()


def test_the_picture_of_the_page_before_stays(tmp_path: Path):
    """The file of page index 30 is `-0031-`, so `-0030-` is the file of the page BEFORE it (IN-10)."""
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "book.pdf-0030-01.png").write_bytes(b"a picture of the page before")
    text = f"Words. {picture_link(30)} More words."

    left = suppress_page_images(text, assets, {30})

    assert picture_link(30) in left, "no snapshot was taken of page 30, so its picture stays"
    assert (assets / "book.pdf-0030-01.png").exists()


def test_a_figure_snapshot_is_never_suppressed(tmp_path: Path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "fig-03-2-1.png").write_bytes(b"a figure")
    text = "Words. ![Figure 2.1: A Figure](assets/fig-03-2-1.png) More words."

    assert suppress_page_images(text, assets, {30, 31, 32}) == text
    assert (assets / "fig-03-2-1.png").exists()


def test_a_figure_stays_even_when_its_name_reads_like_a_page(tmp_path: Path):
    """A figure is known by the `fig-` at the start of its name, never by the numbers in it."""
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "fig-1031-1-1.png").write_bytes(b"a figure of part 1031")
    text = "Words. ![Figure 1.1: A Figure](assets/fig-1031-1-1.png) More words."

    assert suppress_page_images(text, assets, {1030}) == text, "the `-1031-` in the name is a part, not a page"
    assert (assets / "fig-1031-1-1.png").exists()


def test_two_figures_of_one_part_keep_two_pictures():
    assert figure_file_name(3, 2, 1) != figure_file_name(3, 3, 1), "Figure 2.1 and Figure 3.1 are two figures"
    assert figure_file_name(3, 2, 1) == "fig-03-2-1.png"


def test_the_same_figure_in_two_parts_keeps_two_pictures():
    assert figure_file_name(3, 2, 1) != figure_file_name(4, 2, 1)


def test_a_figure_picture_is_known_by_its_name():
    assert figure_file_name(12, 7, 4).startswith("fig-"), "suppress_page_images leaves a `fig-` file alone"


# ------------------------------------------------------------------ two pictures that share a plain name


def test_two_pictures_that_share_a_plain_name_both_stay(tmp_path: Path):
    from ebooklib import epub

    path = make_book(
        tmp_path / f"{BOOK_ID}.epub",
        two_chapters(),
        pictures={"images/fig1.png": _big_png(), "extra/fig1.png": _big_png()},
    )
    book = epub.read_epub(str(path))
    assets = tmp_path / "assets"

    asset_map = extract_epub_assets(book, assets)

    written = sorted(p.name for p in assets.iterdir())
    assert len(written) == 2, f"both pictures are written, not one: {written}"
    assert asset_map["images/fig1.png"] != asset_map["extra/fig1.png"], "each is found by its whole name"
    assert asset_map["images/fig1.png"] == "assets/fig1.png", "the first keeps the plain name"
    assert asset_map["fig1.png"] == asset_map["images/fig1.png"], "the plain name still opens the first picture"


def test_a_picture_of_its_own_keeps_its_plain_name(tmp_path: Path):
    from ebooklib import epub

    path = make_book(tmp_path / f"{BOOK_ID}.epub", two_chapters(), pictures={"images/only.png": _big_png()})
    book = epub.read_epub(str(path))

    asset_map = extract_epub_assets(book, tmp_path / "assets")

    assert asset_map["images/only.png"] == "assets/only.png"
    assert asset_map["only.png"] == "assets/only.png"


# ------------------------------------------------------------------ a drawing of the book carries no script


def test_a_drawing_of_the_book_loses_its_script():
    drawing = (
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>window.alert(1)</script>'
        b'<circle cx="5" cy="5" r="4"/></svg>'
    )
    clean = svg_without_script(drawing)
    assert b"<script" not in clean and b"alert" not in clean
    assert b"<circle" in clean, "the drawing itself is kept"


def test_a_drawing_loses_a_handler_and_a_javascript_link():
    drawing = b'<svg onload="go()"><a xlink:href="javascript:go()"><rect width="9" height="9"/></a></svg>'
    clean = svg_without_script(drawing)
    assert b"onload" not in clean and b"javascript:" not in clean
    assert b"<rect" in clean


def test_a_plain_drawing_keeps_every_character():
    drawing = b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L9 9"/></svg>'
    assert svg_without_script(drawing) == drawing


def test_a_drawing_that_the_import_writes_holds_no_script(tmp_path: Path):
    """The import itself takes the script out, not only the rule on its own."""
    from ebooklib import epub

    drawing = (
        b'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">'
        b"<script>window.alert(1)</script>"
        b'<circle cx="100" cy="100" r="90"/>'
        + b"<!-- " + b"a long comment so the file is big enough to keep. " * 30 + b"-->"
        + b"</svg>"
    )
    path = make_book(tmp_path / f"{BOOK_ID}.epub", two_chapters(), pictures={"images/draw.svg": drawing})
    book = epub.read_epub(str(path))
    assets = tmp_path / "assets"

    extract_epub_assets(book, assets)

    written = (assets / "draw.svg").read_bytes()
    assert b"<script" not in written and b"alert" not in written, "the script is out of the file in the vault"
    assert b"<circle" in written, "the drawing itself is kept"


# ------------------------------------------------------------------ the language a book says it is in


def pdf_that_says(language, path: Path) -> Path:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "A page of words.")
    if language is not None:
        doc.xref_set_key(doc.pdf_catalog(), "Lang", f"({language})")
    doc.save(str(path))
    doc.close()
    return path


@pytest.mark.parametrize("said,written", [
    ("fr-FR", "fr-FR"),
    ("de", "de"),
    ("zh-Hans", "zh-Hans"),
    (None, "en"),
    ("", "en"),
    ("a whole sentence, not a language", "en"),
])
def test_a_pdf_is_written_down_in_the_language_it_says(tmp_path: Path, said, written):
    doc = pymupdf.open(str(pdf_that_says(said, tmp_path / "book.pdf")))
    try:
        assert book_language(doc) == written
    finally:
        doc.close()


def test_a_thing_that_is_no_document_keeps_the_language_it_falls_back_to():
    assert book_language(object()) == "en"


# ------------------------------------------------------------------ a book that carries no contents


def chapters(*names: str) -> List[ChapterMeta]:
    return [
        ChapterMeta(id=f"ch-{n:02d}", title=name, file_path=f"ch-{n:02d}.md", order=n)
        for n, name in enumerate(names, start=1)
    ]


def test_the_chapters_become_the_contents():
    items = contents_of_chapters(chapters("The First Way", "The Second Way"))
    assert [item.title for item in items] == ["The First Way", "The Second Way"]
    assert [item.href for item in items] == ["ch-01.md", "ch-02.md"]
    assert all(item.anchor is None and item.level == 1 for item in items), "each opens the top of its chapter"


def test_a_book_with_no_contents_of_its_own_gets_one_entry_for_each_chapter(tmp_path: Path):
    meta, _ = import_book(tmp_path, two_chapters(), nav=NAV_WITH_NOTHING)

    assert meta["total_chapters"] == 2
    assert [item["title"] for item in meta["toc"]] == ["The First Way", "The Second Way"]
    assert [item["href"] for item in meta["toc"]] == ["ch-01.md", "ch-02.md"]


def test_a_book_with_contents_of_its_own_keeps_them(tmp_path: Path):
    meta, _ = import_book(tmp_path, two_chapters(), nav=NAV_WITH_ENTRIES)

    assert [item["title"] for item in meta["toc"]] == ["The First Way", "The Second Way"]
    assert [item["href"] for item in meta["toc"]] == ["ch-01.md", "ch-02.md"]


def test_every_entry_of_the_made_contents_opens_a_chapter_file(tmp_path: Path):
    meta, book_dir = import_book(tmp_path, two_chapters(), nav=NAV_WITH_NOTHING)

    assert meta["toc"], "a reader must have some way to move through the book"
    for item in meta["toc"]:
        assert (book_dir / item["href"]).is_file(), f"{item['href']} is no chapter of the book"


# ------------------------------------------------------------------ no rule of the import names a book


NAMED_IN_A_BOOK = ["Emirates", "Iain Masterton", "Adam Slama", "Ted S. Warren", "Cathy Yeulet"]


def test_no_module_of_the_import_names_a_person_or_a_passage_of_one_book():
    """A rule that names a real person or a passage of one book works for that book and for no other."""
    found = [
        f"{module.name} names {named!r}"
        for module in sorted(INGEST.glob("*.py"))
        for named in NAMED_IN_A_BOOK
        if named in module.read_text(encoding="utf-8")
    ]
    assert not found, "; ".join(found)


def test_a_photo_credit_is_still_known_by_the_agency():
    from ingest.layout_stitcher import stitch_layout_blocks

    page = (
        "A camp is small and what it lacks in size it makes up\nHalil Erdogan/Alamy Stock Photo\n\n"
        "for with its own pool. The camp makes up for with its own style.\n"
    )
    out = stitch_layout_blocks(page)
    assert "it makes up for with its own pool." in out, "the cut sentence is joined again"
    assert "Halil Erdogan/Alamy Stock Photo" in out, "the credit itself is kept"


def test_a_photo_credit_of_a_photographer_no_book_of_yours_has_is_known_too():
    from ingest.layout_stitcher import stitch_layout_blocks

    page = (
        "The shop had stood on that corner for years and the owner knew\nRosa Lindqvist/Getty Images\n\n"
        "every one of her buyers by name. The owner knew every one of her buyers.\n"
    )
    out = stitch_layout_blocks(page)
    assert "the owner knew every one of her buyers by name." in out
    assert "Rosa Lindqvist/Getty Images" in out
