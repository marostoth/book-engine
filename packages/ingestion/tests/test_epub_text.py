"""Every text of an EPUB book reaches its chapter file, and only a link to a note becomes a footnote (IN-02).

The converter wrote only some kinds of blocks, and only in some layouts. A `<pre>`, a `<figure>`, an `<aside>` and a
`<dl>` vanished, text before a paragraph in a box was lost, a `<br>` and the edge of a block ran words together, and a
chapter title in a `<header>` was lost. Every element with an id counted as a note, so a link such as "See Part Two"
became a footnote that held the whole part, and the link lost its words.
"""

import html
import importlib.util
import re
import zipfile
from pathlib import Path
from typing import Dict, List

import pymupdf
import pytest
from bs4 import BeautifulSoup

from ingest.epub_parser import html_to_markdown_blocks
from ingest.pipeline import ingest_epub

from conftest import SKILLS

BOOK_ID = "harbour-notes"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">harbour-notes</dc:identifier>
    <dc:title>Harbour Notes</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="figure" href="figure.png" media-type="image/png"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>
"""
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="ch01.xhtml">Chapter 1</a></li></ol></nav></body>
</html>
"""
# The documents of the book hold their tags with no whitespace between them, as many books do
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Harbour Notes</title></head>
<body>{body}</body>
</html>
"""

BLOCKS = (
    "<pre>def total(prices):\n    return sum(prices)\n\nprint(total([1, 2]))</pre>"
    '<figure><img src="figure.png" alt="Supply curve"/><figcaption>Figure 1. The supply curve.</figcaption></figure>'
    "<aside><p>A box beside the text.</p></aside>"
    "<dl><dt>Arbitrage</dt><dd>Buying and selling the same thing in two markets.</dd></dl>"
)
BLOCKS_MARKDOWN = [
    "<pre>def total(prices):\n    return sum(prices)&#10;\nprint(total(&#91;1, 2]))</pre>",
    "![Supply curve](figure.png)",
    "Figure 1. The supply curve.",
    "A box beside the text.",
    "**Arbitrage**",
    "Buying and selling the same thing in two markets.",
]


def blocks(body: str) -> List[str]:
    """The Markdown blocks that the EPUB import writes for an XHTML body."""
    return html_to_markdown_blocks(BeautifulSoup(f"<html><body>{body}</body></html>", "html.parser"))


def make_epub(path: Path, documents: Dict[str, str]) -> Path:
    """An EPUB book with a document for each body of `documents`, in that order, and the picture `figure.png`."""
    manifest = "".join(
        f'<item id="d{n}" href="{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    )
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    picture = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 80), False)
    picture.clear_with(200)
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV)
        book.writestr("OEBPS/figure.png", picture.tobytes("png"))
        for name, body in documents.items():
            book.writestr(f"OEBPS/{name}", DOCUMENT.format(body=body))
    return path


def import_book(folder: Path, documents: Dict[str, str]):
    """Imports a book with `documents` into a new vault in `folder`, and gives its `_meta.json` and its folder."""
    meta = ingest_epub(make_epub(folder / f"{BOOK_ID}.epub", documents), folder / "vault")
    return meta, folder / "vault" / "books" / BOOK_ID


def chapter_blocks(book_dir: Path, name: str) -> List[str]:
    """The blocks of a chapter file, without their paragraph anchors."""
    text = (book_dir / name).read_text(encoding="utf-8")
    return [re.sub(r" \^p-\d{3}$", "", block) for block in text.split("\n\n")]


def load_script(name: str, file_name: str):
    spec = importlib.util.spec_from_file_location(name, SKILLS / file_name)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "layout",
    ["{}", "<div>{}</div>", "<section><p>A paragraph before the blocks.</p>{}</section>", "<span>{}</span>"],
    ids=["in the body", "in a div", "after a paragraph", "in a span"],
)
def test_every_kind_of_block_is_written_in_any_layout(layout: str) -> None:
    before = ["A paragraph before the blocks."] if "<p>" in layout else []

    assert blocks(layout.format(BLOCKS)) == before + BLOCKS_MARKDOWN


def test_an_imported_chapter_holds_every_block_with_its_anchor(tmp_path: Path) -> None:
    meta, book_dir = import_book(tmp_path, {"ch01.xhtml": f"<h1>Every Block</h1><div>{BLOCKS}</div>"})

    assert (book_dir / "ch-01.md").read_text(encoding="utf-8").split("\n\n") == [
        "# Every Block",
        "<pre>def total(prices):\n    return sum(prices)&#10;\nprint(total(&#91;1, 2]))</pre> ^p-001",
        "![Supply curve](assets/figure.png) ^p-002",
        "Figure 1. The supply curve. ^p-003",
        "A box beside the text. ^p-004",
        "**Arbitrage** ^p-005",
        "Buying and selling the same thing in two markets. ^p-006",
    ]
    assert meta.spine[0].anchor_count == 6
    assert load_script("audit_anchors", "audit-anchors.py").audit_book(book_dir)


def test_preformatted_text_keeps_its_lines_and_spaces() -> None:
    code = (
        "def area(r):\n"
        "    # pi * r ** 2\n"
        "    return 3.14 * r * r\n"
        "\n"
        "\n"
        "[^1]: no note, `x` and ![a](b.png)\n"
        "# if a < b && c: print('&lt;')"
    )
    [block] = blocks(f"<pre><code>{html.escape(code)}</code></pre>")

    # One block of the chapter, which shows the text of the book as it is
    assert block.startswith("<pre>") and block.endswith("</pre>") and "\n\n" not in block
    assert html.unescape(block[len("<pre>") : -len("</pre>")]) == code
    # The reader finds no Markdown in it: no *, no backtick, no [ and no # at the start of a line
    assert not re.search(r"[*`\[]|^#", block, re.MULTILINE)
    # A browser shows no line break right after <pre>, and a <br> as a line break
    assert blocks("<pre>\none<br/>two\n\n</pre>") == ["<pre>one\ntwo</pre>"]


def test_words_never_run_together() -> None:
    # A paragraph is one line, as a browser shows it: a line break of the book file is a space
    assert blocks("<p>The book wraps\n   its lines.</p>") == ["The book wraps its lines."]
    assert blocks("<p>Poem line one<br/>Poem line two</p>") == ["Poem line one<br>Poem line two"]
    assert blocks("<h2>CHAPTER I.<br/>OF LABOUR.</h2>") == ["## CHAPTER I. OF LABOUR."]
    assert blocks("<div><dl><dt>term</dt><dd>DD2 definition</dd></dl></div>") == ["**term**", "DD2 definition"]
    assert blocks("<ul><li><p>First part.</p><p>Second part.</p></li></ul>") == ["- First part. Second part."]
    assert blocks("<table><tr><td>Line one<br/>Line two</td><td><p>A</p><p>B</p></td></tr></table>") == [
        "Line one<br>Line two | A B"
    ]
    assert blocks("<blockquote><p>First quoted paragraph.</p><p>Second quoted paragraph.</p></blockquote>") == [
        "> First quoted paragraph.\n>\n> Second quoted paragraph."
    ]
    assert blocks("<p>A<b> bold </b>word</p>") == ["A **bold** word"]


def test_lists_and_tables_keep_every_part() -> None:
    assert blocks("<ul><li>Fruit<ul><li>Apple</li><li>Pear</li></ul></li><li>Bread</li></ul>") == [
        "- Fruit\n  - Apple\n  - Pear\n- Bread"
    ]
    assert blocks("<ol><li>One<ol><li>Part</li></ol></li></ol>") == ["1. One\n   1. Part"]
    assert blocks("<table><caption>Table 1. Prices</caption><tr><th>Year</th><th>Price</th></tr></table>") == [
        "Table 1. Prices",
        "Year | Price",
    ]


def test_text_between_blocks_is_a_paragraph_and_a_comment_is_no_text() -> None:
    assert blocks("<div>Some <em>marked</em> words<p>A paragraph.</p>and the <b>rest</b></div><!-- a note -->") == [
        "Some *marked* words",
        "A paragraph.",
        "and the **rest**",
    ]


def test_a_chapter_title_in_a_header_is_the_title_of_the_chapter(tmp_path: Path) -> None:
    meta, book_dir = import_book(tmp_path, {
        "ch01.xhtml": (
            '<section epub:type="chapter"><header><h1>The Tides</h1></header><p>The text about the tides.</p></section>'
        ),
    })

    assert meta.spine[0].title == "The Tides"
    assert chapter_blocks(book_dir, "ch-01.md") == ["# The Tides", "The text about the tides."]


def test_project_gutenberg_boilerplate_is_left_out_and_any_other_footer_stays() -> None:
    # The owner chose to leave out the header and the license that Project Gutenberg adds to its books
    assert blocks(
        '<header class="pg-boilerplate pgheader"><h2>The Project Gutenberg eBook of Harbour Notes</h2>'
        "<p>This eBook is for the use of anyone anywhere.</p></header>"
        "<h1>Chapter One</h1><p>The text of the chapter.</p>"
        "<footer><p>Sources: the port office.</p></footer>"
        '<footer class="pg-boilerplate"><p>*** END OF THE PROJECT GUTENBERG EBOOK ***</p></footer>'
    ) == ["# Chapter One", "The text of the chapter.", "Sources: the port office."]


def test_a_link_that_names_no_note_keeps_its_words(tmp_path: Path) -> None:
    meta, book_dir = import_book(tmp_path, {
        "ch01.xhtml": (
            "<h1>Links</h1>"
            '<p>See <a href="#part-2">Part Two</a> for the details.</p>'
            '<p>Chapter two says more: read <a href="ch02.xhtml#chapter-2">the next chapter</a> now.</p>'
            '<p>A cross reference.<sup><a href="#part-3">3</a></sup></p>'
            '<section id="part-2"><h2>Part Two</h2><p>The text of part two.</p></section>'
            '<div id="part-3"><h3>Part Three</h3><p>The text of part three.</p></div>'
        ),
        "ch02.xhtml": '<div id="chapter-2"><p>The whole text of chapter two.</p><p>More text of chapter two.</p></div>',
    })

    assert chapter_blocks(book_dir, "ch-01.md") == [
        "# Links",
        "See Part Two for the details.",
        "Chapter two says more: read the next chapter now.",
        # A superscript that names a part of the book, not a note
        "A cross reference.3",
        "## Part Two",
        "The text of part two.",
        "### Part Three",
        "The text of part three.",
    ]
    assert [chapter.footnotes_count for chapter in meta.spine] == [0, 0]


def test_a_link_to_a_note_becomes_a_footnote_and_the_note_shows_once(tmp_path: Path) -> None:
    meta, book_dir = import_book(tmp_path, {
        "ch01.xhtml": (
            "<h1>Notes</h1>"
            '<p>A note in the notes file.<a href="notes.xhtml#n1" id="ref1"><sup>1</sup></a></p>'
            '<p>A note of this page.<a epub:type="noteref" href="#fn2">2</a></p>'
            '<p>A note of a converted book.<a class="calibre5" href="#n3">3</a></p>'
            '<p>A note with words, <a role="doc-noteref" href="#n4">see note 4</a>.</p>'
            '<p>A note in a list of notes.<sup><a href="#en5">5</a></sup></p>'
            '<p>A note with a letter.<sup><a href="#n6">a</a></sup></p>'
            '<aside epub:type="footnote" id="fn2"><p>The second note.</p></aside>'
            '<p id="n3">3. The third note.</p>'
            '<p id="n4">The fourth note.</p>'
            '<p id="n6">The sixth note.</p>'
            '<ol epub:type="endnotes"><li id="en5">The fifth note.</li></ol>'
        ),
        "notes.xhtml": '<div id="n1"><p><a href="ch01.xhtml#ref1">1.</a> The first note.</p></div>',
    })

    assert chapter_blocks(book_dir, "ch-01.md") == [
        "# Notes",
        "A note in the notes file.[^1]",
        "A note of this page.[^2]",
        "A note of a converted book.[^3]",
        "A note with words, see note 4[^4].",
        "A note in a list of notes.[^5]",
        "A note with a letter.[^6]",
        # A note that does not say that it is a note stays in the text, as before
        "3. The third note.",
        "The fourth note.",
        "The sixth note.",
        "[^1]: The first note.",
        "[^2]: The second note.",
        "[^3]: The third note.",
        "[^4]: The fourth note.",
        "[^5]: The fifth note.",
        "[^6]: The sixth note.",
    ]
    assert [chapter.footnotes_count for chapter in meta.spine] == [6]
    assert load_script("audit_anchors", "audit-anchors.py").audit_book(book_dir)
