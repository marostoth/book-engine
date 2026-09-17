# Ingestion & Content Pipeline

Local-first, deterministic book ingestion pipeline for EPUB and PDF formats.

## Features
- Hierarchical TOC extraction to `_meta.json`
- Backmatter endnote relocation to inline Markdown footnotes `[^n]`
- Embedded asset/image extraction to `vault/books/<book-id>/assets/`
- Deterministic paragraph anchoring (`^p-001`)
- Zero-hallucination salience scoring & extractive Cloze deck generation
- A new import of a book that the vault already has stops before it writes anything, unless `--force` is given; the reader's own files in `vault/notes/<book-id>/` are kept
- A new import that gives chapters or paragraphs other numbers moves the reader's bookmark, reading time, notes, highlights and citations to the same text, and names a place whose text is gone (IN-04)
- A book id (`--book-id`) has 1 to 255 characters from a-z, 0-9, `-` and `_`, and does not start with `-`; an import with another id stops before it writes anything, so a book never lands outside the vault (SEC-03)
- A book id comes from the file name: letters with marks become plain letters, and a name in another script gets a short code; a file whose book id belongs to a book from another file stops, even with `--force`, and the stop names the two ways on (IN-03)
- The text of an EPUB book is read with `\n` line endings, and every file that the import writes has `\n` line endings, also on Windows, so a book made on Windows keeps every paragraph and its anchor; a note is one footnote line (IN-06)
- An EPUB import writes every text that the book shows, in any layout: preformatted text with its lines and spaces, figures and their captions, boxes, definition lists, and a `<br>` as a line break; only a link to a note becomes a footnote, and the header and license that Project Gutenberg adds are left out (IN-02)
