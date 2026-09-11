# Ingestion & Content Pipeline

Local-first, deterministic book ingestion pipeline for EPUB and PDF formats.

## Features
- Hierarchical TOC extraction to `_meta.json`
- Backmatter endnote relocation to inline Markdown footnotes `[^n]`
- Embedded asset/image extraction to `vault/books/<book-id>/assets/`
- Deterministic paragraph anchoring (`^p-001`)
- Zero-hallucination salience scoring & extractive Cloze deck generation
