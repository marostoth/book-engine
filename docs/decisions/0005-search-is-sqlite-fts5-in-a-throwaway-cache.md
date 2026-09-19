---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# Search is SQLite FTS5 in a throwaway cache

## Context and Problem Statement

A reader types two letters into a search box and expects results before they finish the word, across every
paragraph of every book they own. The permanent record is a folder of Markdown files, which cannot be
searched at that speed. What holds the index, and what happens when it is wrong?

## Decision Drivers

* Search must feel instant while typing, on a normal laptop, offline.
* The index must never become a thing the reader can lose.
* Whatever holds it has to ship inside a desktop binary with no service to install.
* A wrong or stale index must have an answer simpler than debugging it.

## Considered Options

* SQLite FTS5 in a cache outside the vault, rebuilt from the Markdown
* A search library held in memory, rebuilt at every start
* An embedded search engine such as Tantivy, with its own index directory

## Decision Outcome

Chosen option: **SQLite FTS5 in a throwaway cache**, because it gives BM25 ranking and prefix search with no
extra dependency, it persists between starts so the app opens fast, and it can be deleted at any moment
without losing anything.

`rusqlite` is already a dependency with `features = ["bundled"]`, so SQLite compiles into the binary and
there is nothing to install. The index lives in `%APPDATA%\book-engine\app_cache\index.db`, never in
`vault/`. The same file also holds the copy of the study progress, which is rebuilt from the study log.

### Consequences

* Good, because no new dependency: the database was already there for the practice cards.
* Good, because "delete `index.db`" is a complete answer to any index problem, and costs the reader nothing.
* Good, because indexing is incremental: a chapter is re-read only when its content hash changes.
* Good, because each book is indexed in its own transaction, so one unreadable book cannot stop the rest.
* Bad, because the speed has to be measured rather than assumed. A two-letter prefix matches a large share
  of every paragraph in the vault, and that is the slow case.
* Bad, because two things now live in one cache file, so its schema version gates both search and study.
* Bad, because FTS5 tokenisation is a decision of its own (`porter unicode61`), and changing it means
  re-indexing everything.

### Confirmation

`.agent/skills/benchmark-fts.py` holds each kind of query to its own measured limit: a real word under
`WORD_LIMIT_MS = 15.0` ms and the broadest search the app allows, a two-letter prefix, under
`BROAD_LIMIT_MS = 120.0` ms. It runs against a copy of the index made with the SQLite backup API, never the
live one, and it fails when no broad query reaches 10% of the index, so it cannot pass by measuring nothing.
Vector 6 of `.agent/skills/audit-system.py` runs it. `tests/test_git_tracks_the_right_files.py` and vector
12 keep the database out of `vault/`.

## More Information

Three findings shaped this, all in `docs/review/2026-09-14-findings.md`. SI-04 found that every search
reopened the database and re-ran the whole schema setup, and that the benchmark had only ever measured
queries matching a handful of paragraphs. SI-02 found that one broken book stopped indexing for all of them.
SEC-01 found search snippets being put into the page as HTML, which is why a snippet is now plain text with
two private-use characters marking each hit.
