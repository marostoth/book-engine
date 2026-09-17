# Ingestion & Content Pipeline

Local-first, deterministic book ingestion pipeline for EPUB and PDF formats.

## Features
- Hierarchical TOC extraction to `_meta.json`
- Backmatter endnote relocation to inline Markdown footnotes `[^n]`
- Embedded asset/image extraction to `vault/books/<book-id>/assets/`
- Deterministic paragraph anchoring (`^p-001`)
- Zero-hallucination salience scoring & extractive Cloze deck generation
- A new import of a book that the vault already has stops before it writes anything, unless `--force` is given; the reader's own files in `vault/notes/<book-id>/` are never written over
- A book id (`--book-id`) has 1 to 255 characters from a-z, 0-9, `-` and `_`, and does not start with `-`; an import with another id stops before it writes anything, so a book never lands outside the vault (SEC-03)
