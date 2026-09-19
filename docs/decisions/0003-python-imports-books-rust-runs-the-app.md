---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# Python imports books, Rust runs the app

## Context and Problem Statement

Turning an EPUB or a PDF into clean, anchored Markdown is hard: multi-column layout, endnotes, vector
figures, fonts that name their own characters wrongly. Reading that Markdown in a desktop window is a
different job with different needs. Should both be written in one language?

## Decision Drivers

* PDF layout extraction is the hardest part and the one most dependent on existing libraries.
* The reader window must open a chapter instantly and stay responsive while indexing.
* An import runs rarely, by hand, and may take minutes; nobody is watching a progress bar.
* Two languages cost a second toolchain, a second test runner and a second dependency list.

## Considered Options

* Python for the import, Rust for the app
* Rust for both
* Python for both, with a web UI

## Decision Outcome

Chosen option: **Python for the import, Rust for the app**, because the libraries that do the hard part exist
only in Python, and the part that must be fast has no such dependency.

`packages/ingestion` needs `pymupdf`, `pymupdf4llm` and `ebooklib`. There is no PDF or EPUB crate in
`apps/desktop/src-tauri/Cargo.toml`, and nothing in the Rust ecosystem does layout-aware PDF-to-Markdown at
the quality these do. The app itself only ever reads Markdown the import has already written, so it needs
none of that.

The two halves never run together. **The installer carries no Python at all**: `tauri.conf.json` has no
`resources` entry and no `externalBin`, and no Rust file starts a Python process. An import is something the
owner runs from a terminal against the vault; the shipped app only reads what is already there.

### Consequences

* Good, because each half uses the best tool for its job, and neither compromises for the other.
* Good, because the slow, fiddly half cannot slow the reader down: it is not in the app.
* Good, because the shipped binary is Rust only, with no Python runtime to bundle or to keep patched.
* Bad, because the repository carries two toolchains, two lock files and two test runners, and
  `npm run check` has to drive both.
* Bad, because a rule that spans the two, such as the note line format, is written twice and can drift. This
  really happened (RD-08), and the answer was a third test comparing the two implementations.
* Bad, because **the app cannot import a book**. A friend given only the installer gets an empty reader, and
  this has to be explained rather than fixed.
* Bad, because the licence position is set by the Python half: `ebooklib` is AGPL and nothing else, which is
  why the whole repository is AGPL-3.0-or-later.

### Confirmation

`tests/test_licenses_stay_known.py::test_the_installer_carries_no_python` fails if `tauri.conf.json` gains a
`resources` entry or an `externalBin`, or if a Rust file starts a Python process. `npm run check` runs both
toolchains in one command. `tests/test_one_note_format.py` holds the Rust and TypeScript halves of the one
format that crosses the boundary to the same answers.

## More Information

`LICENSES.md` records what this costs in licence terms and why the installer's contents matter.
`docs/rules/ingestion.md` holds the rules for the Python half. RD-08 and SEC-06 in
`docs/review/2026-09-14-findings.md` are the two findings this decision produced.
