"""Book text in chapter Markdown (SEC-01, IN-08).

The app reads the HTML that a chapter file holds: the reader shows it, and search leaves it out. The PDF import writes
some on purpose (`<sup>`, `<br>`). So the EPUB import writes a `<` of the book text that could start a tag as `&lt;`,
and a `&` that could start a character reference such as `&lt;` as `&amp;`. The reader then shows the text as the book
has it, search finds it as text, and every other character stays as it is.

A `#` that starts a line is written the same way, as `&#35;`, because Markdown reads such a line as a
heading and a heading gets no paragraph anchor. `# PRICES OF WHEAT` is a paragraph of The Wealth of
Nations, and the biggest heading of its chapter is what the reader showed (IN-08).
"""

from __future__ import annotations

import re

# A `<` before a letter, `/`, `!` or `?` can start a tag, a comment or a declaration.
_TAG_START = re.compile(r"<(?=[A-Za-z/!?])")
# A `&` before a name or a number and `;` can start a character reference.
_REFERENCE_START = re.compile(r"&(?=#?[A-Za-z0-9]+;)")
# The first `#` of a line that Markdown reads as a heading: one to six marks, and then a space, a tab or
# the end of the line. `ingest.chapter_shape.HEADING` is the same rule (IN-08).
_HEADING_MARK = re.compile(r"^#(?=#{0,5}(?:[ \t]|$))", re.MULTILINE)
# The same `#` in a chapter file. Book text of its own could never hold it: `escape_markdown_text` writes
# a `&` that starts a reference as `&amp;` first.
_HEADING_MARK_WRITTEN = re.compile(r"^&#35;", re.MULTILINE)


def escape_markdown_text(text: str) -> str:
    """Book text as chapter Markdown, with no `<` that could start a tag and no `&` that could start a reference."""
    return _TAG_START.sub("&lt;", _REFERENCE_START.sub("&amp;", text))


def escape_heading_mark(block: str) -> str:
    """A block of book text with no line that Markdown would read as a heading (IN-08).

    Only the first `#` of such a line is written as `&#35;`: `### PRICES` becomes `&#35;## PRICES`, which
    the reader shows as the book has it. A line that Markdown reads as text already, such as `#1 rule` or
    `####### seven marks`, keeps every character.
    """
    return _HEADING_MARK.sub("&#35;", block)


def unescape_markdown_text(text: str) -> str:
    """The book text again, for a place that shows text as it is, such as a chapter title in `_meta.json`.

    The `#` of a heading mark goes first, and then `&lt;`: `escape_markdown_text` writes every `&` of a
    `&lt;` or a `&#35;` in the book text as `&amp;`.
    """
    text = _HEADING_MARK_WRITTEN.sub("#", text)
    return text.replace("&lt;", "<").replace("&amp;", "&")
