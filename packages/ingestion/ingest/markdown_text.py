"""Book text in chapter Markdown (SEC-01).

The app reads the HTML that a chapter file holds: the reader shows it, and search leaves it out. The PDF import writes
some on purpose (`<sup>`, `<br>`). So the EPUB import writes a `<` of the book text that could start a tag as `&lt;`,
and a `&` that could start a character reference such as `&lt;` as `&amp;`. The reader then shows the text as the book
has it, search finds it as text, and every other character stays as it is.
"""

from __future__ import annotations

import re

# A `<` before a letter, `/`, `!` or `?` can start a tag, a comment or a declaration.
_TAG_START = re.compile(r"<(?=[A-Za-z/!?])")
# A `&` before a name or a number and `;` can start a character reference.
_REFERENCE_START = re.compile(r"&(?=#?[A-Za-z0-9]+;)")


def escape_markdown_text(text: str) -> str:
    """Book text as chapter Markdown, with no `<` that could start a tag and no `&` that could start a reference."""
    return _TAG_START.sub("&lt;", _REFERENCE_START.sub("&amp;", text))


def unescape_markdown_text(text: str) -> str:
    """The book text again, for a place that shows text as it is, such as a chapter title in `_meta.json`.

    `&lt;` goes first: `escape_markdown_text` writes every `&` of a `&lt;` in the book text as `&amp;`.
    """
    return text.replace("&lt;", "<").replace("&amp;", "&")
