r"""Book text and vault files with one line ending, `\n` (IN-06).

A book file made on Windows can hold its text with Windows line endings, `\r\n`, and Python on Windows writes each `\n`
of a text file as `\r\n`. So the import wrote a line break inside a paragraph as `\r\r\n`, which reads back as a blank
line: the paragraph fell apart into pieces without an anchor. Every other vault file got `\r\n` line endings too, and
the app finds paragraphs and footnotes at `\n`.

So the import reads the text of a book with `\n` line endings only, and it writes every vault file with `\n` line
endings, also on Windows. `\r\n` and a lone `\r` become `\n`, as Python reads a text file and as a web browser reads a
page. The app reads chapters and notes by the same rule (`apps/desktop/src-tauri/src/vault/text_file.rs`).
"""

from __future__ import annotations

from pathlib import Path

from bs4 import BeautifulSoup


def normalize_line_endings(text: str) -> str:
    r"""`text` with `\n` line endings only: `\r\n` and a lone `\r` become `\n`."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def read_html(content: str | bytes) -> BeautifulSoup:
    r"""A document of an EPUB book, with `\n` line endings only in its text."""
    soup = BeautifulSoup(content, "html.parser")
    for text in soup.find_all(string=lambda text: "\r" in text):
        # The text keeps its kind, so a comment stays a comment
        text.replace_with(type(text)(normalize_line_endings(text)))
    return soup


def write_text_file(path: Path, text: str) -> None:
    r"""Writes a text file of the vault as UTF-8 with `\n` line endings, also on Windows."""
    path.write_text(text, encoding="utf-8", newline="\n")
