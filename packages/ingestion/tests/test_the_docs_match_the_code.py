"""The lists in the documents are the lists in the code (TL-07).

`ARCHITECTURE.md` grew from 70 KB to 240 KB in four days and nobody compared any of it with the code. When it
was finally measured, seven claims were wrong at once:

- Four separate command tables between them **invented six backend commands** (`get_deck_stats`,
  `get_review_heatmap`, `get_retention_metrics`, `load_all_book_notes`, `export_summary` and `list_books`) and
  **missed nine that exist**. Five of the six had been deleted by LC-03, and the code says so in a comment.
- Two headings pointed at `src-tauri/src/db.rs`, which has been the folder `db/` for a long time.
- "Split View shows the pristine publisher PDF page" described a pane that does not exist; the button opens
  the notes pane, and the app ships no PDF viewer.
- The audit was said to verify topic files "cryptographically" and to do "unreferenced asset cleanup". It
  hashes only book binaries against the ledger, and it checks that a referenced asset exists; it removes
  nothing.
- Three documents credited `@floating-ui/react` for two components, months after RD-09 uninstalled it.

None of that needed a person to notice it. Every one is a list in a document that disagrees with a list in the
code, so these tests read both lists and compare them. What they cannot check is prose, which is why the
manifest now holds one short line per file instead of a paragraph of history: a small claim is a claim that
can be wrong in fewer ways.

`test_what_the_docs_promise.py` is the neighbour of this file: it holds the documents to what the build really
installs. This one holds them to what the code really contains.
"""

import re
import subprocess

import pytest
from conftest import REPO

#: The documents a reader or an agent takes as the description of this app. The skill files joined them when
#: 38 rules moved out of `AGENTS.md` into `.claude/skills/`: they carry the same claims about the same files,
#: so a path or a promise that goes stale in one of them is worth exactly as much as one in the README.
DOCUMENTS = (
    "README.md",
    "AGENTS.md",
    "ARCHITECTURE.md",
    *sorted(str(p.relative_to(REPO)).replace("\\", "/") for p in (REPO / ".claude" / "skills").glob("*/SKILL.md")),
)

ARCHITECTURE = REPO / "ARCHITECTURE.md"
LIB_RS = REPO / "apps" / "desktop" / "src-tauri" / "src" / "lib.rs"

#: The fence of the As-Built Directory Manifest: the tree is the first fenced block after that heading.
MANIFEST_HEADING = "## 2. As-Built Directory Manifest"

#: A manifest comment says what a file is for, in one line. The longest one today is 118 characters, so the
#: cap is the measured number rounded up to the next ten, not a guess (see `a-guard-limit-must-be-measured`).
COMMENT_CAP = 120

#: The names in the tree that stand for something a checkout does not have: a book id, a Windows folder, or a
#: build folder that exists only while an import runs.
PLACEHOLDERS = ("<book-id>", "%APPDATA%", "vault/.import")

#: A branch line of the tree. A file name never holds a `#`, so the first `#` starts the comment however few
#: spaces sit in front of it.
BRANCH = re.compile(r"^(?P<indent>[│├└─ ]*)(?:├── |└── )(?P<rest>.*)$")

#: A row of the command table: `| `name` | `signature` | text |`.
TABLE_ROW = re.compile(r"^\|\s*`([a-z_][a-z_0-9]*)`\s*\|")

#: The block that registers every command with Tauri. This is the only list that decides what exists.
HANDLER = re.compile(r"generate_handler!\[(.*?)\]", re.DOTALL)

#: A source file the manifest is expected to name. A test is left out: it sits beside the file it tests.
SOURCE_SUFFIX = (".rs", ".ts", ".tsx", ".py", ".mjs", ".ps1")
IS_TEST = re.compile(
    r"(?:^|/)(?:conftest\.py|tests\.rs|test_[^/]+\.py|[^/]+_tests\.rs|[^/]+\.test\.(?:[jt]sx?|mjs|cjs))$"
)

#: Something in backticks that looks like a path, so a document naming a file that is gone fails here. A bare
#: file name (`Cargo.toml`) is left out, because it is ambiguous and lives in several folders.
PATH_IN_TEXT = re.compile(r"`((?:[\w.@-]+/)+[\w.@-]*)`")

#: The documents write a path from whichever root reads best: `db/indexer.rs` and `vault/text_file.rs` are
#: inside the Rust source, `lib/citations.ts` is inside the window source. A path counts as real when it is
#: found under any of these. Spelling one out in full is still welcome; it just is not required.
SEARCH_ROOTS = (
    "",
    "apps/desktop/src-tauri/src",
    "apps/desktop/src",
    "apps/desktop",
    "packages/ingestion",
    "packages/ingestion/tests",
)

#: Extensions that make a backticked word a file reference wherever it sits.
FILE_SUFFIX = (
    ".rs",
    ".ts",
    ".tsx",
    ".py",
    ".mjs",
    ".cjs",
    ".ps1",
    ".json",
    ".jsonl",
    ".md",
    ".toml",
    ".lock",
    ".html",
    ".css",
    ".yml",
    ".yaml",
    ".xhtml",
    ".epub",
    ".pdf",
    ".db",
    ".ico",
    ".png",
    ".svg",
    ".exe",
)

#: Folders that make a backticked word a path even with no extension, such as `apps/desktop/src/lib/api/dev/`.
REPO_FOLDERS = ("apps/", "packages/", "scripts/", ".agent/", "docs/", "vault/", "inbox/", ".github/")

#: Folder names a build or a tool makes. They are correct for a document to name and absent from a fresh
#: clone, so a path holding one of them as a whole segment is not checked. `gen/` and `target/` are both
#: git-ignored (TL-08), and a document that names them, as the build instructions do, is right to.
GENERATED = {"target", "gen", "node_modules", "dist", "__pycache__", ".venv"}

#: Folders that hold the reader's own data, not files of this repository. git keeps five placeholder files
#: between them, so `vault/preferences.json` and `vault/syntopicon/` are real on the owner's machine and on
#: no fresh clone. The first run of this test in CI failed for exactly that, which is the fault it exists to
#: catch, one level up: a check that passes only where the checker sits.
#:
#: A path under these that ends in a source extension is NOT data. `vault/text_file.rs` is how the documents
#: write `apps/desktop/src-tauri/src/vault/text_file.rs`, and that one is still held to the disk.
RUNTIME_DATA = ("vault/", "inbox/")

#: A review id, such as `IN-05`. The manifest may not carry one: that history lives in docs/review/.
REVIEW_ID = re.compile(r"\b[A-Z]{2,3}-\d{2}\b")

#: A word shortly before a banned claim that turns it into a denial. Saying "there is no publisher PDF pane"
#: is the other half of this fix, so a document must stay free to say it.
DENIALS = ("no", "not", "never", "nothing", "without", "neither", "cannot", "ships")


def read(name: str) -> str:
    return (REPO / name).read_text(encoding="utf-8")


def registered_commands() -> list[str]:
    """Every command name inside `generate_handler![...]`, which is the whole backend interface."""
    block = HANDLER.search(LIB_RS.read_text(encoding="utf-8"))
    assert block, f"{LIB_RS.name} has no `generate_handler![...]` block; the reader below cannot work"
    return [name.strip() for name in block.group(1).split(",") if name.strip()]


def documented_commands() -> list[str]:
    """Every command named in the first column of the command table of `ARCHITECTURE.md`."""
    inside = False
    found: list[str] = []
    for line in ARCHITECTURE.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            inside = line.startswith("## 6. Backend commands")
            continue
        if inside:
            row = TABLE_ROW.match(line)
            if row:
                found.append(row.group(1))
    return found


def manifest_lines() -> list[str]:
    """The lines of the tree inside the fence that follows the manifest heading."""
    lines = ARCHITECTURE.read_text(encoding="utf-8").splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith(MANIFEST_HEADING)), None)
    assert start is not None, f"ARCHITECTURE.md has no '{MANIFEST_HEADING}' heading"
    opened = next((i for i in range(start, len(lines)) if lines[i].startswith("```")), None)
    assert opened is not None, "the manifest heading is followed by no fenced block"
    closed = next((i for i in range(opened + 1, len(lines)) if lines[i].startswith("```")), None)
    assert closed is not None, "the manifest's fenced block is never closed"
    return lines[opened + 1 : closed]


def manifest_entries() -> list[tuple[str, str, bool]]:
    """(repository path, comment, is a folder) for every entry of the tree."""
    stack: dict[int, str] = {}
    out: list[tuple[str, str, bool]] = []
    for raw in manifest_lines():
        match = BRANCH.match(raw)
        if not match:
            continue
        name, _, comment = match.group("rest").partition("#")
        name, comment = name.strip(), comment.strip()
        if not name:
            continue
        depth = len(match.group("indent")) // 4
        parent = stack.get(depth - 1, "")
        path = f"{parent}/{name.rstrip('/')}" if parent else name.rstrip("/")
        stack[depth] = path
        for deeper in [d for d in list(stack) if d > depth]:
            del stack[deeper]
        out.append((path, comment, name.endswith("/")))
    return out


def tracked_sources() -> list[str]:
    """Every source file git tracks, leaving out the vault, node_modules and the tests."""
    done = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True)
    return [
        line
        for line in done.stdout.splitlines()
        if line.endswith(SOURCE_SUFFIX)
        and not line.startswith("vault/")
        and "/node_modules/" not in line
        and not IS_TEST.search(line)
    ]


def is_placeholder(path: str) -> bool:
    return any(mark in path for mark in PLACEHOLDERS)


def is_runtime_data(word: str) -> bool:
    """Whether the path is the reader's own data, which a fresh clone and CI do not have."""
    return word.startswith(RUNTIME_DATA) and not word.endswith(SOURCE_SUFFIX)


def looks_like_a_path(word: str) -> bool:
    """Whether a backticked word with a slash in it is a file or folder this repository should have."""
    if is_placeholder(word) or "*" in word or "::" in word or word.startswith(("http", "//")):
        return False
    if any(part in GENERATED for part in word.split("/")) or is_runtime_data(word):
        return False
    return word.endswith(FILE_SUFFIX) or word.startswith(REPO_FOLDERS)


def found_somewhere(word: str) -> bool:
    """Whether the path exists under any of the roots the documents write paths from."""
    return any((REPO / root / word).exists() for root in SEARCH_ROOTS)


def denies(line: str, words: str) -> bool:
    """Whether a line says the thing is NOT there, so a document stays free to deny it plainly.

    It reads the sentence the words sit in, not a fixed window of words before them, because a denial can
    open a sentence that runs on: "The audit never verifies a topic file cryptographically."
    """
    low = line.lower()
    at = low.find(words)
    if at < 0:
        return False
    sentence_start = max(low.rfind(mark, 0, at) for mark in (". ", "; ", ": ", "! ", "? "))
    before = re.findall(r"[a-z]+", low[max(0, sentence_start) : at])
    return any(word in DENIALS for word in before)


# --------------------------------------------------------------------------------------------------------
# Sight checks. Without these, a reader that found nothing would pass every test below in silence.
# --------------------------------------------------------------------------------------------------------


def test_the_readers_of_this_file_all_find_something():
    """Each list below is compared with another list, so two empty lists would agree and prove nothing."""
    registered = registered_commands()
    assert len(registered) > 30, f"only {len(registered)} registered commands were read from {LIB_RS.name}"
    assert "search_vault" in registered, "the handler reader did not find `search_vault`"

    documented = documented_commands()
    assert len(documented) > 30, f"only {len(documented)} commands were read from the table of ARCHITECTURE.md"
    assert "search_vault" in documented, "the table reader did not find `search_vault`"

    entries = manifest_entries()
    assert len(entries) > 250, f"only {len(entries)} entries were read from the manifest tree"
    assert any(path == "apps/desktop/src/App.tsx" for path, _, _ in entries), (
        "the manifest reader did not find `apps/desktop/src/App.tsx`, so it is not reading the tree"
    )

    sources = tracked_sources()
    assert len(sources) > 200, f"only {len(sources)} tracked source files were read from git"
    assert not any(IS_TEST.search(path) for path in sources), "the test filter let a test file through"
    assert IS_TEST.search("apps/desktop/src/lib/bionic.test.ts"), "the test filter does not know a vitest file"
    assert IS_TEST.search("packages/ingestion/tests/test_packaging.py"), "the test filter does not know a pytest file"
    assert IS_TEST.search("apps/desktop/src-tauri/src/db/search_tests.rs"), "the test filter does not know a Rust test"
    assert not IS_TEST.search(".agent/skills/test-index-rebuild.py"), (
        "the test filter called a verification harness a test; it is a script that is run by hand"
    )


def test_the_path_reader_knows_a_path_from_prose():
    """This reader decides which backticked words the next test holds to the disk."""
    found = PATH_IN_TEXT.findall("see `apps/desktop/src/App.tsx` and `packages/ingestion/ingest/cloze.py`")
    assert found == ["apps/desktop/src/App.tsx", "packages/ingestion/ingest/cloze.py"]
    assert PATH_IN_TEXT.findall("a bare name `Cargo.toml` is not checked") == []

    assert looks_like_a_path("apps/desktop/src/App.tsx")
    assert looks_like_a_path("db/indexer.rs"), "a path written from the Rust source root is still a path"
    assert not looks_like_a_path("tokio::task::spawn_blocking"), "a module path is not a file"
    assert not looks_like_a_path("src/**/*.test.tsx"), "a glob names no one file"
    assert not looks_like_a_path("vault/books/<book-id>/_meta.json"), "a book id stands for any book"
    assert not looks_like_a_path("target/release/book-engine-desktop.exe"), "a build makes that one"
    assert not looks_like_a_path("apps/desktop/src-tauri/target"), "a generated folder with no trailing slash"
    assert not looks_like_a_path("apps/desktop/src-tauri/gen/"), "`gen/` is git-ignored (TL-08)"

    # git keeps five placeholder files under vault/ and inbox/ and nothing else, so these are real on the
    # owner's machine and on no fresh clone. Requiring them failed CI on the first run of this very test.
    assert not looks_like_a_path("vault/preferences.json"), "the app writes that one; a clone has no vault"
    assert not looks_like_a_path("vault/syntopicon/topics/"), "the reader's own topics, ignored by git"
    assert not looks_like_a_path("inbox/processed/some-book.epub"), "the reader's own book file"
    assert looks_like_a_path("vault/text_file.rs"), (
        "a Rust module under `src-tauri/src/vault/` is source, not vault data, and stays checked"
    )

    assert found_somewhere("apps/desktop/src/App.tsx"), "the root of the repository is searched"
    assert found_somewhere("db/indexer.rs"), "the Rust source root is searched"
    assert found_somewhere("lib/citations.ts"), "the window source root is searched"
    assert not found_somewhere("db.rs"), "the reader must still fail on the file that started this"


def test_the_denial_reader_lets_a_document_say_a_thing_is_not_there():
    """Half of this fix is the documents saying plainly that these features do not exist."""
    assert denies("There is no publisher PDF pane.", "publisher pdf")
    assert denies("The audit never verifies a topic file cryptographically.", "cryptographically")
    assert denies("Nothing does unreferenced asset cleanup here.", "unreferenced asset cleanup")

    assert not denies("It shows the pristine publisher PDF page beside the text.", "publisher pdf")
    assert not denies("Vector 10 cryptographically verifies all topic files.", "cryptographically")
    assert not denies(
        "Nothing watches the vault. Vector 10 cryptographically verifies every topic file.", "cryptographically"
    ), "a denial in an earlier sentence must not excuse a claim in a later one"


# --------------------------------------------------------------------------------------------------------
# The command table and the backend
# --------------------------------------------------------------------------------------------------------


def test_every_command_the_table_names_is_registered():
    """Six commands sat in those tables after the code had deleted them."""
    registered = set(registered_commands())
    invented = [name for name in documented_commands() if name not in registered]
    assert not invented, (
        f"the command table of ARCHITECTURE.md names {invented}, which `generate_handler![...]` in "
        f"{LIB_RS.name} does not register. Take the row out, or register the command (TL-07)."
    )


def test_every_registered_command_is_in_the_table():
    """Nine real commands were in none of the four tables, so the window could call what no page described."""
    documented = set(documented_commands())
    missing = [name for name in registered_commands() if name not in documented]
    assert not missing, (
        f"{LIB_RS.name} registers {missing}, and the command table of ARCHITECTURE.md does not name them. "
        f"Give each one a row in section 6 (TL-07)."
    )


def test_the_command_table_names_each_command_once():
    """There were four tables. One command in two of them would let them drift apart again."""
    documented = documented_commands()
    twice = sorted({name for name in documented if documented.count(name) > 1})
    assert not twice, f"the command table names {twice} more than once; there is one table and one row each"


# --------------------------------------------------------------------------------------------------------
# Paths named in the documents
# --------------------------------------------------------------------------------------------------------


def test_every_path_the_documents_name_exists():
    """`src-tauri/src/db.rs` was named by two headings long after it became the folder `db/`."""
    gone: list[str] = []
    for name in DOCUMENTS:
        for number, line in enumerate(read(name).splitlines(), start=1):
            for path in PATH_IN_TEXT.findall(line):
                if looks_like_a_path(path) and not found_somewhere(path):
                    gone.append(f"{name}:{number} names `{path}`")
    assert not gone, (
        "these documents name a path that is on no disk here:\n  "
        + "\n  ".join(gone)
        + f"\nA path is looked for under each of {SEARCH_ROOTS}."
    )


# --------------------------------------------------------------------------------------------------------
# The As-Built Directory Manifest
# --------------------------------------------------------------------------------------------------------


def test_every_path_in_the_manifest_exists():
    for path, _, _ in manifest_entries():
        if is_placeholder(path) or is_runtime_data(path):
            continue
        assert (REPO / path).exists(), (
            f"the manifest names `{path}`, which is not on the disk. Take the line out, or add the file."
        )


def test_the_manifest_names_every_source_file_that_is_not_a_test():
    """It named 325 of 361 and no rule said which 36 were left out, so nobody could tell a gap from a choice."""
    listed = {path for path, _, _ in manifest_entries()}
    missing = sorted(path for path in tracked_sources() if path not in listed)
    assert not missing, (
        f"{len(missing)} tracked source files are missing from the As-Built Directory Manifest:\n  "
        + "\n  ".join(missing)
        + "\nGive each one a line saying what it is for. A test file needs no line: it sits beside what it tests."
    )


def test_the_manifest_holds_no_test_file():
    """The tree named 103 test files and left out 23, which is a list nobody could trust either way."""
    tests = sorted(path for path, _, is_dir in manifest_entries() if not is_dir and IS_TEST.search(path))
    assert not tests, (
        f"the manifest names {len(tests)} test files: {tests[:5]}. A test sits beside the file it tests, and "
        f'a line reading "Bionic tests" beside `bionic.test.ts` says nothing.'
    )


def test_a_manifest_comment_is_one_short_line_about_the_file():
    """131 of 391 lines retold a review finding, and one ran to 635 characters. That is what grew the file."""
    too_long: list[str] = []
    historical: list[str] = []
    for path, comment, _ in manifest_entries():
        if len(comment) > COMMENT_CAP:
            too_long.append(f"{path}  ({len(comment)} characters)")
        if REVIEW_ID.search(comment):
            historical.append(path)
    assert not too_long, (
        f"a manifest comment says what a file is for, in one line of at most {COMMENT_CAP} characters. "
        f"These are longer:\n  " + "\n  ".join(too_long)
    )
    assert not historical, (
        "a manifest comment names a review finding:\n  "
        + "\n  ".join(historical)
        + "\nWhat a file is for belongs here. What was once wrong with it belongs in docs/review/, and the "
        "rule it taught belongs in AGENTS.md."
    )


def test_the_manifest_has_one_line_for_one_entry():
    """A tree is only readable while every entry keeps its own line and its own comment."""
    seen: dict[str, int] = {}
    for path, _, _ in manifest_entries():
        seen[path] = seen.get(path, 0) + 1
    twice = sorted(path for path, count in seen.items() if count > 1)
    assert not twice, f"the manifest names these twice: {twice}"


# --------------------------------------------------------------------------------------------------------
# Claims that named a feature nobody built
# --------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "words, why",
    [
        ("publisher pdf", "the app ships no PDF viewer; the Split View button opens the notes pane"),
        ("pristine publisher", "the app ships no PDF viewer; a PDF book is Markdown and images in the vault"),
        ("cryptographically", "the only SHA-256 in the audit compares a book binary with `_ledger.json`"),
        ("unreferenced asset cleanup", "vector 2 checks a referenced asset exists; it removes nothing"),
        ("minimized console", "`scripts/create_desktop_shortcut.ps1` sets `WindowStyle = 1`, which is Normal"),
    ],
)
def test_no_document_repeats_a_claim_that_was_measured_false(words: str, why: str):
    """Each of these described a feature that was never built, and each survived for months (TL-07)."""
    for name in DOCUMENTS:
        for number, line in enumerate(read(name).splitlines(), start=1):
            if words in line.lower() and not denies(line, words):
                pytest.fail(f"{name}:{number} says {words!r} as a thing the app does, and {why}")
