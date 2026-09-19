# Decision records

Why this program is built the way it is. One decision per file, in
[MADR 4.0.0](https://adr.github.io/madr/) format, named `NNNN-title-with-dashes.md`.

**These are recorded after the fact.** The program was built first and these were written on 2026-09-19 by
reading the code, not by minuting a meeting. So each one states what the repository can be checked against,
and says plainly where the reasoning is reconstructed rather than remembered. An ADR that invents a rationale
is worse than no ADR, because it reads exactly as true as one that does not.

What belongs here, and what does not:

| Question | Where it is answered |
| :--- | :--- |
| Why is it built this way? | here |
| What is it now? | `ARCHITECTURE.md` |
| What must I not break? | `AGENTS.md`, and `docs/rules/` for one area |
| What was once wrong with it? | `docs/review/2026-09-14-findings.md` |
| What may I copy, and under what licence? | `LICENSES.md` |

## The records

| # | Decision | Status |
| :--- | :--- | :--- |
| [0001](0001-the-vault-is-the-only-permanent-record.md) | A folder of Markdown files is the only permanent record | accepted |
| [0002](0002-practice-items-are-extractive-only.md) | Practice items are extractive only, never generated | accepted |
| [0003](0003-python-imports-books-rust-runs-the-app.md) | Python imports books, Rust runs the app | accepted |
| [0004](0004-fsrs-5-schedules-reviews.md) | FSRS-5 schedules reviews | accepted |
| [0005](0005-search-is-sqlite-fts5-in-a-throwaway-cache.md) | Search is SQLite FTS5 in a throwaway cache | accepted |
| [0006](0006-tauri-v2-is-the-desktop-shell.md) | Tauri v2 is the desktop shell | accepted |

## Adding one

Copy the shape of any file here: frontmatter with `status`, `date` and `decision-makers`, then **Context and
Problem Statement**, **Decision Drivers**, **Considered Options**, **Decision Outcome**, **Consequences** and
**Confirmation**. Number it one higher than the last. Add its row above.

Write the **Confirmation** section last and make it real: name the test, the file or the command that would
fail if the decision were quietly reversed. A decision nothing checks is a decision that drifts, which is
the fault the whole `docs/review/` register is about.

`tests/test_the_decisions_are_readable.py` fails when a record is misnumbered, when its frontmatter will not
parse, when a required section is missing, or when this table and the folder disagree.
