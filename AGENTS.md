# Agent Directives: Local Book Engine & Reader

**This file loads in every session, so it holds only what every task needs.** The rules for one area load
with that area. Each rule below is one line: what to do, what it cost to learn, and the test that fails when
it is broken. The full story of a rule is in `docs/review/2026-09-14-findings.md` under the id at its end.

**Why it is built this way is in `docs/decisions/`**, one record per decision: the plain-file vault,
extractive-only practice, Python importing while Rust runs, FSRS-5, FTS5 in a throwaway cache, Tauri. Each
says what was chosen, what was not, and what it cost.

**Before you touch one of these areas, open its page and follow every rule on it.**

| When you touch | Read | Holds |
| :--- | :--- | :--- |
| `packages/ingestion/`, `.agent/skills/` | `docs/rules/ingestion.md` | 18 rules: EPUB and PDF parsing, chapter shape, anchors, cards, the ledger, moving the reader's files |
| `apps/desktop/src/` | `docs/rules/frontend.md` | 12 rules: chapter documents, highlights, dialogs, memoization, settings contexts |
| `apps/desktop/src-tauri/` | `docs/rules/backend.md` | 6 rules: byte versus character slicing, stable hashes, concurrency, line endings |
| bringing new books in | `docs/rules/import-books.md` | the inbox procedure and what each result means |
| a health check of the whole system | `docs/rules/health-audit.md` | the 12-vector audit and how to read it |

**This repository is agent-neutral: this file is canonical, `CLAUDE.md` and `GEMINI.md` point at it, and
nothing an agent needs is kept in a folder only one vendor reads.** Those pages are the only copy of each
rule. `.claude/skills/<name>/SKILL.md` holds none of its own; it is a pointer that lets Claude Code open the
right page by itself. Any other agent reaches the same page from the table above.

`tests/test_the_skills_load.py` fails when a rule page is missing, when a pointer names a page that is not
there, when a skill's frontmatter will not parse, when a `paths:` pattern matches no file, or when a rule is
in two places at once.

---

## 1. Non-Negotiable Operational Guardrails

1. **Markdown Vault is Ground Truth:**
   - The user's Markdown vault (`vault/`) is the sole permanent record.
   - SQLite (`index.db`) is strictly an ephemeral query accelerator in the OS application data folder. Never in `vault/`.
   - If `index.db` is deleted, the system MUST be capable of rebuilding the entire index purely from the vault files.

2. **Zero-Hallucination & Verbatim Practice Standard:**
   - Practice items (Cloze, Scrambled Clauses, Q&A) MUST be 100% extractive.
   - Every answer key must be programmatically verified as an exact character substring of the cited chapter.
   - Generative synthesis or speculative questioning without source grounding is forbidden.

3. **Single-Chapter Rendering:**
   - Never load multi-chapter books simultaneously in the frontend.
   - Render ONLY one chapter at a time in TipTap/ProseMirror to keep the DOM small.

4. **Stable Highlight Anchoring:**
   - Do NOT use absolute character-count offsets or volatile DOM ranges.
   - Store highlights using the W3C Text Quote Selector standard: `exact`, `prefix` and `suffix`.

---

## 2. Technology & Language Standards

### Rust (Tauri v2 Backend)
- **Tooling:** Tauri v2, `rusqlite` with FTS5 (bundled SQLite), `tokio`, `serde`, `thiserror`, `anyhow`, `chrono`, `sha2`.
- **Nothing Watches the Vault:** there is no file system watcher, and `notify` is in neither `Cargo.toml` nor `Cargo.lock`. `index_vault` runs when the window opens and when the reader clicks **Rescan library** at the bottom of the book list (`lib/libraryRescan.ts`), so a book imported while the app is open shows after one click, not by itself. A watcher is not free here: the app writes into the vault constantly itself, so it would have to tell its own writes from the reader's or index in a loop. `tests/test_what_the_docs_promise.py` fails when a document promises one (SI-05, DS-13).

### Python (Ingestion Pipeline)
- **Tooling:** Python 3.13+, `mypy` strict mode, `pytest`. The code itself needs only 3.11, where `tomllib` arrived, and mypy still checks it for 3.11. The floor is 3.13 because `requirements.lock` is made on 3.13 and `numpy==2.5.3` in it has no build for 3.11 (TL-05).
- **A Test Reads the Vault It Built:** never write `Path("vault")` or `Path(".agent/skills/...")` in a test. Both are read from the folder pytest was started in, and the first one is the reader's own books. Take the `vault_of_the_tests` fixture, `load_skill` for a script of `.agent/skills/`, or `tmp_path` for a vault of your own. A test that needs one of the reader's books is not a test: make the book it needs. `tests/test_vault_of_the_tests.py` fails on either path (TL-02).

### TypeScript / Frontend
- **Tooling:** React 18+, TipTap 3 / ProseMirror, Tailwind CSS, `lucide-react`, `markdown-it`. Tests run on `vitest`, in `jsdom`, with `@testing-library/react`. Name a package on this line only after `apps/desktop/package.json` has it. `tests/test_what_the_docs_promise.py` holds this line and the Rust one to the manifests, so keep the line a list of tooling and put an explanation in a bullet of its own.

### Every Language
- **A New Dependency Brings Its Licence:** this program is **AGPL-3.0-or-later**, because `ebooklib` is AGPL and nothing else, and handing it to one friend counts the same as publishing it. `LICENSE` is the licence text itself, never edited; `LICENSES.md` is the measured position, every line of it read from the installed package. A dependency whose licence is not permissive needs a row on that page and an entry in `KNOWN`, in the same commit. The installer carries no Python and cannot import a book, which is what that page tells a reader, so never add `externalBin`, a Python `resources` entry or a `Command::new("python")` without changing it. `tests/test_licenses_stay_known.py` reads all three ecosystems on every check (SEC-06).

---

## 3. Verification Protocol

Before you say a task is done:

1. `npm run check` from the root, exit 0.
2. `python .agent/skills/audit-anchors.py` when you changed anything an import writes.

---

## 4. Execution Rules

- **One Command Runs Every Check:** `npm run check` runs rustfmt, clippy, `cargo test`, `tsc`, ESLint, the frontend tests, ruff, `ruff format --check`, mypy and pytest, in that order, stopping at the first failure. `.github/workflows/check.yml` runs the same groups on every push. A check you add goes into `npm run check`, or nobody runs it. Settings live at the root: `ruff.toml`, `rustfmt.toml`, `rust-toolchain.toml`, `apps/desktop/eslint.config.js`; a rule you turn off carries its reason on the line above (TL-05).
- **A Green Check Here Must Be Green There:** a tool answers differently on two versions of itself. The workflow's first run installed Rust 1.88 against 1.98 here, and clippy reported 125 errors `npm run check` never showed. So the version a check runs on is named in the repository, not the workflow — `rust-toolchain.toml`, `engines.node`, `python-version` — and a rule that moves between releases is named too, in `[lints.clippy]` and ruff's `select`.
- **A Filesystem Guard Is Proved in a Fresh Clone:** a clone has the repository and nothing else. git keeps five placeholder files under `vault/` and `inbox/`; `gen/` and `target/` are ignored. A test that requires any of the rest passes here and fails in CI, and a test that skips on a tracked `.gitkeep` never skips at all. Clone the branch into a scratch folder and run it there before you trust it (TL-07, RD-09).
- **One Command Per Workflow Step:** a step of several lines reports only the exit code of its last line. The lock install stopped at `numpy==2.5.3` and the step still said success; the failure showed three steps later as `No module named ruff`. Join a step's commands with `&&`. `tests/test_one_check.py` fails when a step runs more than one line of its own (TL-05).
- **A Check That Read Nothing Is Not a Pass:** a check that found no book, no chapter, no deck or no ledger line reports that it checked nothing, and fails. Several used to report success instead, so an empty folder and a missing folder both looked healthy. When you add a check, count what it read and fail on zero (TL-04).
- **Never Trust a Check's Summary:** read the files a failed check names before you say what is wrong. This file used to forbid opening a file by hand and tell an agent to believe the audit instead, and that is how a batch of these bugs stayed hidden. A number in a document that no check enforces drifts, so the speeds are the measured ones: a word under **15 ms**, a two-letter prefix under 120 ms, held by `.agent/skills/benchmark-fts.py` on a copy of the index (SI-04).
- **Untracking a Vault File Almost Deleted Two of Them:** `git rm --cached` leaves the file on disk, and that is the trap — the deletion comes one step later. During TL-08, `git rm --cached` on a vault file then `git checkout main` made git remove both working copies, and only git history brought them back. **An ignored vault path git must stop tracking is removed on a branch made from the commit that tracks it, and that branch is merged, never checked out across.** Back the file up outside the repository first. The vault paths `.gitignore` keeps out are `vault/.import/`, `vault/books/`, `vault/notes/`, `vault/preferences.json` and `vault/syntopicon/`; `vault/_ledger.json` stays tracked, because only an import writes it. `tests/test_git_tracks_the_right_files.py` fails when an ignored vault path is not named here (TL-08, RD-08).
- **No Cloud Client Syncs This Repository:** git keeps 382 files; a working copy holds over 37,000 and 24 GB, almost all of it `apps/desktop/src-tauri/target`. A client uploads every one, holds files open while cargo replaces them, and marks folders read-only — which is why three pieces of this code retry a rename and one clears that mark before removing a folder. Keep the repository outside OneDrive, Dropbox, Google Drive and iCloud; it lives at `C:/dev/book-engine`. If it must sit in a synced folder, point `CARGO_TARGET_DIR` somewhere outside it first, because `target` is almost all of the bulk (TL-08, TL-09).
- **Git Keeps Nothing a Build or the App Writes:** `apps/desktop/src-tauri/gen/` is written by every `cargo build` and `vault/syntopicon/` by the app whenever a topic is saved. While git tracked them, `git status` showed a change nobody made after every build and every reading session, and a real change hid in that noise. `tests/test_git_tracks_the_right_files.py` fails when a tracked file matches one of those patterns, when an unbundled icon is tracked, or when a `.gitignore` rule names a file git still tracks (DS-14, TL-08).
- **Never Kill a Port Blind:** 5173 is Vite's default, so it is not only ours. `kill-port 5173` and `Get-NetTCPConnection | Stop-Process -Force` each stopped another project's dev server with no message. Both run `node scripts/free-dev-port.mjs` now: it stops a leftover `node` whose command line names this repository, and for anything else it prints what is there and exits non-zero (TL-08).
- **Process Hygiene:** never leave dev servers, Vite watchers or background test instances running after a task. Terminate background processes, or run builds headlessly.
- **Architecture Synchronization:** `ARCHITECTURE.md` says what the program **is**, never how it got that way. A new, moved, renamed or deleted source file needs its line in the As-Built Directory Manifest, saying what the file is **for**, in one sentence under 120 characters with no review id in it. A new backend command needs its row in the one command table. What was once wrong with a file belongs in `docs/review/`. `tests/test_the_docs_match_the_code.py` fails when a path named in a document does not exist, when the command table and `lib.rs` disagree either way, when a non-test source file is missing from the manifest, or when a comment breaks the one-line rule (TL-07).
- **A Fresh Clone Starts With the README:** `apps/desktop` is a workspace of the root `package.json`, so one `npm install` at the root installs the frontend too, and npm keeps one `package-lock.json`, at the root. The oldest Node and Rust the build can use live in `engines.node` and `rust-version`; change either and change the README's Prerequisites with it, or `tests/test_fresh_clone.py` fails. A verification step that reads the vault comes after `python -m ingest.sample_generator --vault vault`, because a clone's vault is empty (TL-06).
- **Modular File Rule:** a soft ceiling of about 300 lines a file. Past it, refactor out hooks, helpers or child components. Vector 12 of the audit measures it.
