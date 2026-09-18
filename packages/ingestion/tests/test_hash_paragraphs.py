"""A paragraph that starts with a `#` is text of the book, and keeps its anchor (IN-08).

The import called every block that starts with a `#` a heading. A heading gets no paragraph anchor, so such a
paragraph could not be searched, cited or marked, and nothing said so.

The rule is wrong in two ways, and each needs its own answer:

- `#1 rule of the market`, a hashtag and `####### seven marks` are text already, and Markdown never read them as a
  heading. They only needed the right rule: `ingest.chapter_shape.is_heading`.
- `# PRICES OF WHEAT` is a paragraph of The Wealth of Nations, and Markdown reads it as the biggest heading of the
  chapter. The text alone cannot say which it is, so the import writes the `#` as `&#35;`, the way it already writes
  a `<` of the book text as `&lt;` (SEC-01).

Every test here makes its own little book, so none of them needs a book of yours.
"""

import json
import re
import zipfile
from pathlib import Path
from typing import Dict, List, Tuple

import pytest

from ingest.anchors import clean_preview_text, extract_inspectional_sampling, inject_paragraph_anchors
from ingest.book_check import book_problems
from ingest.chapter_shape import holds_no_text, is_heading
from ingest.markdown_text import escape_heading_mark, unescape_markdown_text
from ingest.pipeline import ingest_epub
from ingest.places import read_book_text

BOOK_ID = "hash-paragraphs"

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
PACKAGE = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">hash-paragraphs</dc:identifier>
    <dc:title>Hash Paragraphs</dc:title>
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
NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol></ol></nav></body>
</html>
"""
DOCUMENT = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Hash Paragraphs</title></head>
<body>{body}</body>
</html>
"""

# A paragraph long enough that the import keeps its page: a page of under 20 letters is dropped as blank
PLAIN = (
    "<p>The great commerce of every civilized society is that carried on between the inhabitants of the town "
    "and those of the country.</p>"
)
HEADING = "<h2>CHAPTER XI. OF THE RENT OF LAND</h2>"
ANCHOR_AT_END = re.compile(r"\^p-[a-zA-Z0-9_-]+$")


def import_book(folder: Path, documents: Dict[str, str]):
    """Imports a book of these document bodies into a new vault, and gives its `_meta.json` and its folder."""
    path = folder / f"{BOOK_ID}.epub"
    manifest = "".join(
        f'<item id="d{n}" href="{name}" media-type="application/xhtml+xml"/>' for n, name in enumerate(documents)
    )
    spine = "".join(f'<itemref idref="d{n}"/>' for n in range(len(documents)))
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("mimetype", "application/epub+zip")
        book.writestr("META-INF/container.xml", CONTAINER)
        book.writestr("OEBPS/content.opf", PACKAGE.format(manifest=manifest, spine=spine))
        book.writestr("OEBPS/nav.xhtml", NAV)
        for name, body in documents.items():
            book.writestr(f"OEBPS/{name}", DOCUMENT.format(body=body))
    ingest_epub(path, folder / "vault")
    book_dir = folder / "vault" / "books" / BOOK_ID
    return json.loads((book_dir / "_meta.json").read_text(encoding="utf-8")), book_dir


def blocks_of(book_dir: Path, name: str = "ch-01.md") -> List[str]:
    text = (book_dir / name).read_text(encoding="utf-8")
    return [block.strip() for block in text.split("\n\n") if block.strip()]


def anchored(book_dir: Path, name: str = "ch-01.md") -> List[Tuple[str, str]]:
    """Each block of the chapter as (its anchor or "", its first line without the anchor)."""
    pairs: List[Tuple[str, str]] = []
    for block in blocks_of(book_dir, name):
        anchor = ANCHOR_AT_END.search(block)
        pairs.append((anchor.group(0) if anchor else "", ANCHOR_AT_END.sub("", block).strip().split("\n")[0]))
    return pairs


# ------------------------------------------------------------------ what a heading is


def test_a_heading_of_the_book_is_a_heading():
    assert is_heading("# An Inquiry into the Nature and Causes of the Wealth of Nations")
    assert is_heading("## CHAPTER I. OF THE DIVISION OF LABOUR")
    assert is_heading("###### PART I. Of the Expense of Defence.")


def test_a_hash_and_a_word_is_text():
    assert not is_heading("#1 rule of the market is that price is the only thing that pays you.")
    assert not is_heading("#MarketProfile is where traders of the pit first learned to read the day.")


def test_more_than_six_marks_make_no_heading():
    assert is_heading("###### six marks are a heading")
    assert not is_heading("####### seven marks are too many for a heading, so this line is text.")


def test_marks_with_nothing_after_them_are_a_heading_with_no_words():
    assert is_heading("#")
    assert is_heading("######")
    assert not is_heading("#######")


def test_a_tab_after_the_marks_is_a_heading_too():
    assert is_heading("#\tOF THE DIVISION OF LABOUR")


def test_the_first_line_of_a_block_says_what_the_block_is():
    assert is_heading("# PRICES OF WHEAT\nand a second line")
    assert not is_heading("Year Prices/Quarter\n# 12")


def test_a_page_of_such_a_paragraph_is_a_chapter_of_its_own():
    """`holds_no_text` decides which page writes no chapter file and gives its headings to the next one (CQ-04).
    A page of such a paragraph used to give its words away as a heading."""
    assert not holds_no_text(["#1 rule of the market is that price pays."])
    assert not holds_no_text(["#MarketProfile is read by traders of the pit."])
    assert holds_no_text(["## BOOK I. OF THE CAUSES OF IMPROVEMENT"])


# ------------------------------------------------------------------ how the import writes such a `#`


def test_a_paragraph_that_markdown_would_read_as_a_heading_is_written_with_a_reference():
    assert escape_heading_mark("# PRICES OF WHEAT") == "&#35; PRICES OF WHEAT"


def test_only_the_first_mark_is_written_as_a_reference():
    assert escape_heading_mark("### A paragraph with three marks.") == "&#35;## A paragraph with three marks."


def test_a_paragraph_markdown_reads_as_text_already_keeps_every_character():
    for block in ("#1 rule of the market.", "#MarketProfile", "####### seven marks are text.", "No mark at all."):
        assert escape_heading_mark(block) == block


def test_every_line_of_a_block_is_looked_at():
    """A `#` that starts a line inside a block cuts a heading out of the block, so a table row gets one too."""
    assert escape_heading_mark("Year | Price\n# | 12") == "Year | Price\n&#35; | 12"


def test_the_book_text_comes_back_for_every_reader_of_it():
    """`clean_preview_text` is the one place that previews, practice cards and moved highlights read text through."""
    assert clean_preview_text("&#35; PRICES OF WHEAT ^p-269") == "# PRICES OF WHEAT"
    assert clean_preview_text("&#35;## Three marks ^p-004") == "### Three marks"
    assert unescape_markdown_text("&#35; PRICES OF WHEAT") == "# PRICES OF WHEAT"


def test_a_heading_of_the_book_still_loses_its_marks_in_a_preview():
    assert clean_preview_text("## CHAPTER I. OF THE DIVISION OF LABOUR") == "CHAPTER I. OF THE DIVISION OF LABOUR"


def test_only_a_mark_at_the_start_of_a_line_is_read_back():
    """`unescape_markdown_text` undoes what `escape_heading_mark` did, and nothing else. Preformatted text
    writes its own references (`_preformatted_block`) and keeps every character of the book, so a `&#35;`
    that is not at the start of a line is left as it is."""
    assert unescape_markdown_text("<pre>&#35; a line of code</pre>") == "<pre>&#35; a line of code</pre>"
    assert clean_preview_text("<pre>&#35; a line of code</pre>") == "<pre>&#35; a line of code</pre>"


def test_a_reference_the_book_itself_holds_is_never_read_as_a_mark():
    """`escape_markdown_text` writes a `&` of the book text that starts a reference as `&amp;` first, so a `&#35;`
    the book itself holds never comes back as a `#` of its own."""
    assert unescape_markdown_text("&amp;#35; PRICES OF WHEAT") == "&#35; PRICES OF WHEAT"


def test_such_a_paragraph_can_be_the_sample_of_its_chapter():
    """The head and tail samples of a chapter go into `_meta.json`, and the reader shows them before you
    open the chapter. A chapter of such paragraphs used to have no sample at all."""
    markdown, _ = inject_paragraph_anchors(
        "# CHAPTER XI\n\n#1 rule of the market is that price pays.\n\n#MarketProfile is read by traders."
    )

    sampling = extract_inspectional_sampling(markdown)

    assert sampling.head_anchors == ["^p-001"]
    assert sampling.tail_anchors == ["^p-002"]
    assert sampling.head_text_preview == "#1 rule of the market is that price pays."
    assert sampling.tail_text_preview == "#MarketProfile is read by traders."


# ------------------------------------------------------------------ the import, from book to chapter file


def test_a_paragraph_that_starts_with_a_hash_and_a_word_keeps_its_anchor(tmp_path: Path):
    body = (
        f"{HEADING}{PLAIN}"
        "<p>#1 rule of the market is that price is the only thing that pays you.</p>"
        "<p>#MarketProfile is where traders of the pit first learned to read the day.</p>"
        "<p>####### seven marks are too many for a heading, so this line is text.</p>"
    )

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    assert anchored(book_dir) == [
        ("", "## CHAPTER XI. OF THE RENT OF LAND"),
        ("^p-001", "The great commerce of every civilized society is that carried on between the inhabitants of "
                   "the town and those of the country."),
        ("^p-002", "#1 rule of the market is that price is the only thing that pays you."),
        ("^p-003", "#MarketProfile is where traders of the pit first learned to read the day."),
        ("^p-004", "####### seven marks are too many for a heading, so this line is text."),
    ]


def test_the_paragraph_of_the_wealth_of_nations_keeps_its_hash_and_its_anchor(tmp_path: Path):
    """`# PRICES OF WHEAT` is the caption of the wheat price table in ch-14.md. The reader showed it as the biggest
    heading of the chapter, and it had no anchor."""
    body = f"{HEADING}{PLAIN}<p># PRICES OF WHEAT</p><p>Year Prices/Quarter Average of different prices.</p>"

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    assert anchored(book_dir)[2] == ("^p-002", "&#35; PRICES OF WHEAT")
    assert clean_preview_text(blocks_of(book_dir)[2]) == "# PRICES OF WHEAT"


def test_a_heading_of_the_book_is_still_a_heading(tmp_path: Path):
    _, book_dir = import_book(tmp_path, {"ch01.xhtml": f"{HEADING}{PLAIN}<h3>PART I. OF THE PRODUCE</h3>{PLAIN}"})

    assert [block for anchor, block in anchored(book_dir) if not anchor] == [
        "## CHAPTER XI. OF THE RENT OF LAND",
        "### PART I. OF THE PRODUCE",
    ]


def test_a_list_item_that_starts_with_a_hash_keeps_the_list_whole(tmp_path: Path):
    """Markdown reads a heading inside a list item too, and that item would then hold no text of its own."""
    body = f"{HEADING}{PLAIN}<ul><li># PRICES OF WHEAT</li><li>Year Prices/Quarter</li></ul>"

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    assert blocks_of(book_dir)[2] == "- &#35; PRICES OF WHEAT\n- Year Prices/Quarter ^p-002"


def test_a_quote_that_starts_with_a_hash_stays_a_quote(tmp_path: Path):
    body = f"{HEADING}{PLAIN}<blockquote><p># PRICES OF WHEAT</p></blockquote>"

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    assert blocks_of(book_dir)[2] == "> &#35; PRICES OF WHEAT ^p-002"


def test_a_table_row_that_starts_with_a_hash_keeps_the_table_whole(tmp_path: Path):
    body = (
        f"{HEADING}{PLAIN}<table><tr><td>Year</td><td>Price</td></tr>"
        "<tr><td># 1202</td><td>0 12 0</td></tr></table>"
    )

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    assert blocks_of(book_dir)[2] == "Year | Price\n&#35; 1202 | 0 12 0 ^p-002"


def test_preformatted_text_of_the_book_keeps_every_character(tmp_path: Path):
    """`_preformatted_block` writes a `#` that starts a line itself, and must not be written a second time."""
    body = f"{HEADING}{PLAIN}<pre># a line of code\nand another</pre>"

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    assert blocks_of(book_dir)[2] == "<pre>&#35; a line of code\nand another</pre> ^p-002"


def test_the_words_a_card_and_a_highlight_read_hold_no_reference(tmp_path: Path):
    """A moved highlight and a practice card read a paragraph as letters and digits, so a `35` of a reference left
    in the text would look like a word of the book."""
    body = f"{HEADING}{PLAIN}<p># PRICES OF WHEAT</p><p>#1 rule of the market is that price pays.</p>"

    _, book_dir = import_book(tmp_path, {"ch01.xhtml": body})

    words = [paragraph.words for paragraph in read_book_text(book_dir).paragraphs]
    assert "pricesofwheat" in words
    assert "1ruleofthemarketisthatpricepays" in words
    assert not any("35" in word for word in words)


# ------------------------------------------------------------------ the check that used to say nothing


def test_the_check_names_a_paragraph_with_no_anchor(tmp_path: Path):
    """A book imported before this fix has such a paragraph with no anchor. `audit-anchors.py` reads a book folder
    with this rule, and used to pass it in silence."""
    book_dir = tmp_path / "old-book"
    book_dir.mkdir()
    (book_dir / "ch-01.md").write_text(
        "# Chapter 1\n\nThe great commerce of every civilized society. ^p-001\n\n#1 rule of the market.\n",
        encoding="utf-8",
    )

    assert book_problems(book_dir) == ["ch-01.md: 1 paragraph has no anchor."]


def test_the_check_says_nothing_about_a_heading(tmp_path: Path):
    book_dir = tmp_path / "good-book"
    book_dir.mkdir()
    (book_dir / "ch-01.md").write_text(
        "# Chapter 1\n\n###### A smaller heading\n\nThe great commerce of every civilized society. ^p-001\n",
        encoding="utf-8",
    )

    assert book_problems(book_dir) == []


# ------------------------------------------------------------------ the anchors of a chapter


@pytest.mark.parametrize(
    "block, anchors",
    [
        ("# A heading", 1),
        ("#1 rule of the market.", 2),
        ("#MarketProfile", 2),
        ("####### seven marks", 2),
        ("&#35; PRICES OF WHEAT", 2),
    ],
)
def test_a_chapter_gives_an_anchor_to_every_block_of_text(block: str, anchors: int):
    markdown = f"# Chapter\n\nFirst paragraph.\n\n{block}"

    _, count = inject_paragraph_anchors(markdown)

    assert count == anchors
