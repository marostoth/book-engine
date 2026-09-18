"""Book text in chapter Markdown: text that looks like HTML is written so that the app shows it as text (SEC-01)."""

from pathlib import Path

from bs4 import BeautifulSoup
from ebooklib import epub
from ingest.epub_parser import html_to_markdown_blocks
from ingest.markdown_text import escape_markdown_text, unescape_markdown_text
from ingest.pipeline import ingest_epub


def blocks(body: str) -> list[str]:
    """The Markdown blocks that the EPUB import writes for an XHTML body."""
    return html_to_markdown_blocks(BeautifulSoup(f"<html><body>{body}</body></html>", "html.parser"))


def test_a_tag_that_the_book_shows_as_text_is_not_written_as_a_tag() -> None:
    assert blocks('<p>Write &lt;img src=x onerror="stolen=1"&gt; to show a picture.</p>') == [
        'Write &lt;img src=x onerror="stolen=1"> to show a picture.'
    ]


def test_every_kind_of_block_writes_its_text_the_same_way() -> None:
    assert blocks(
        "Loose &lt;i&gt; text"
        "<h2>The &lt;b&gt; tag</h2>"
        "<div>A &lt;span&gt; in a box</div>"
        "<blockquote>Quote &lt;q&gt;</blockquote>"
        "<ul><li>Item &lt;li&gt;</li></ul>"
        "<table><tr><td>Cell &lt;td&gt;</td></tr></table>"
        '<img src="a.png" alt="Picture of &lt;b&gt;"/>'
        "<p><strong>Bold &lt;b&gt;</strong> and <code>&lt;code&gt;</code></p>"
    ) == [
        "Loose &lt;i> text",
        "## The &lt;b> tag",
        "A &lt;span> in a box",
        "> Quote &lt;q>",
        "- Item &lt;li>",
        "Cell &lt;td>",
        "![Picture of &lt;b>](a.png)",
        "**Bold &lt;b>** and `&lt;code>`",
    ]


def test_text_that_cannot_start_a_tag_or_a_character_reference_stays_as_it_is() -> None:
    assert blocks("<p>Rows &amp; columns, 2 &lt; 3, x&lt;=y, AT&amp;T, R&amp;D; and &amp;lt; or &amp;#60;.</p>") == [
        "Rows & columns, 2 < 3, x<=y, AT&T, R&amp;D; and &amp;lt; or &amp;#60;."
    ]


def test_written_text_reads_back_as_the_book_has_it() -> None:
    texts = [
        "plain",
        "<img src=x>",
        "</p>",
        "<!-- note -->",
        "<?php",
        "2 < 3",
        "AT&T",
        "R&D;",
        "&lt;",
        "&amp;lt;",
        "&#60;",
        "<&lt;",
        "&<b>",
        "&&lt;",
        "&amp;<b",
    ]
    for text in texts:
        assert unescape_markdown_text(escape_markdown_text(text)) == text, text


def test_an_imported_book_keeps_a_tag_from_its_text_as_text(tmp_path: Path) -> None:
    book = epub.EpubBook()
    book.set_identifier("web-pages-test")
    book.set_title("Web Pages")
    book.set_language("en")
    book.add_author("Test Author")
    chapter = epub.EpubHtml(title="Chapter 1", file_name="ch01.xhtml", lang="en")
    chapter.content = (
        "<html><head><title>Chapter 1</title></head><body>"
        "<h1>Chapter 1: The &lt;img&gt; Tag</h1>"
        '<p>Write &lt;img src=x onerror="stolen=1"&gt; to show a picture.</p>'
        "<p>Every picture needs a short text for readers who cannot see it.</p>"
        "</body></html>"
    )
    book.add_item(chapter)
    book.toc = (epub.Link("ch01.xhtml", "Chapter 1", "ch01"),)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", chapter]
    epub_path = tmp_path / "web-pages.epub"
    epub.write_epub(str(epub_path), book)

    meta = ingest_epub(epub_path, tmp_path / "vault", custom_book_id="web-pages")

    chapter_md = (tmp_path / "vault" / "books" / "web-pages" / "ch-01.md").read_text(encoding="utf-8")
    assert "# Chapter 1: The &lt;img> Tag" in chapter_md
    assert 'Write &lt;img src=x onerror="stolen=1"> to show a picture. ^p-001' in chapter_md
    assert "<img" not in chapter_md
    # _meta.json holds plain text, which the app shows as it is.
    assert meta.spine[0].title == "Chapter 1: The <img> Tag"
    sampling = meta.spine[0].inspectional_sampling
    assert sampling is not None
    assert sampling.head_text_preview.startswith('Write <img src=x onerror="stolen=1"> to show a picture.')
