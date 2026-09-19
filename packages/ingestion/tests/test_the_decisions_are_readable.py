"""The decision records stay findable, numbered and honest (`docs/decisions/`).

Six decisions shaped this program and none of them was written down: why the vault is plain Markdown, why
practice cards are extractive only, why the import is Python while the app is Rust, why FSRS-5, why SQLite
FTS5 in a throwaway cache, and why Tauri. `ARCHITECTURE.md` says what the program **is**, `AGENTS.md` says
what not to break, and `docs/review/` says what was once wrong. None of them answers "why this and not the
other thing", which is the question that decides whether a future change is an improvement or a mistake.

They are written in [MADR 4.0.0](https://adr.github.io/madr/) and recorded **after the fact**, by reading
the code. That is the honest way to do it late, and it has one failure mode worth guarding: an ADR that
invents a rationale reads exactly as true as one that does not. So these tests hold the shape and the
links, and every claim inside a record is held by the same path and false-claim guards as the other
documents, because `docs/decisions/*.md` is in `DOCUMENTS` in `test_the_docs_match_the_code.py`.

What is checked here: the numbering has no gaps and no duplicates, the file name matches the title, the
frontmatter parses and carries a status the format allows, each record has the sections a reader needs, the
README table and the folder agree, and `AGENTS.md` names the folder so an agent that reads only that file
still finds it.
"""

import re
from pathlib import Path

import yaml
from conftest import REPO

DECISIONS = REPO / "docs" / "decisions"
README = DECISIONS / "README.md"
AGENTS = REPO / "AGENTS.md"

#: `NNNN-title-with-dashes.md`, the MADR file name.
FILENAME = re.compile(r"^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$")

#: The statuses MADR 4.0.0 names, plus the superseded form.
STATUSES = {"proposed", "rejected", "accepted", "deprecated"}
SUPERSEDED = re.compile(r"^superseded by ADR-\d{4}$")

#: The sections every record here carries. MADR marks the last three optional; they are required in this
#: repository, because a decision with no consequences written down is a decision nobody can weigh later,
#: and one with no confirmation is one nothing would notice being reversed.
REQUIRED = (
    "## Context and Problem Statement",
    "## Decision Drivers",
    "## Considered Options",
    "## Decision Outcome",
    "### Consequences",
    "### Confirmation",
)

#: A row of the README table: `| [0001](0001-....md) | title | status |`. MULTILINE, because `findall`
#: without it anchors `^` to the start of the whole file and finds nothing at all — which the sight check
#: above caught on the first run.
TABLE_ROW = re.compile(r"^\|\s*\[(\d{4})\]\((\d{4}-[a-z0-9-]+\.md)\)\s*\|([^|]*)\|([^|]*)\|", re.MULTILINE)


def records() -> list[Path]:
    return sorted(p for p in DECISIONS.glob("*.md") if p.name != "README.md")


def frontmatter(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines and lines[0] == "---", f"{path.name} does not open with `---` on its first line"
    end = next((i for i in range(1, len(lines)) if lines[i] == "---"), None)
    assert end is not None, f"{path.name} never closes its frontmatter"
    data = yaml.safe_load("\n".join(lines[1:end]))
    assert isinstance(data, dict), f"{path.name} frontmatter is not a mapping: {data!r}"
    return data


def title_of(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise AssertionError(f"{path.name} has no `# ` title")


def test_the_readers_of_this_file_find_something():
    """Each check compares two lists, and two empty lists agree about nothing."""
    found = records()
    assert len(found) >= 6, f"only {len(found)} decision records were found in {DECISIONS}"
    assert README.exists(), f"{README} is missing, so nothing indexes the records"

    assert FILENAME.match("0001-the-vault-is-the-only-permanent-record.md"), "the name reader rejects a real name"
    assert not FILENAME.match("1-short.md"), "the name reader accepts a number that is not four digits"
    assert not FILENAME.match("0001-Title-With-Capitals.md"), "the name reader accepts capitals"

    rows = TABLE_ROW.findall(README.read_text(encoding="utf-8"))
    assert len(rows) >= 6, f"the README table reader found {len(rows)} rows"


def test_every_record_is_named_the_way_the_format_says():
    for path in records():
        assert FILENAME.match(path.name), (
            f"{path.name} is not `NNNN-title-with-dashes.md`. Four digits, then the title in lower case with "
            f"dashes, so the records sort in the order they were made."
        )


def test_the_numbering_has_no_gaps_and_no_duplicates():
    numbers = [int(FILENAME.match(p.name).group(1)) for p in records()]
    assert numbers == sorted(numbers), "the records do not sort by number"
    duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
    assert not duplicates, f"two records share a number: {duplicates}"
    assert numbers == list(range(1, len(numbers) + 1)), (
        f"the numbers are {numbers}; they must run from 1 with no gap, so a missing record is visible"
    )


def test_the_file_name_matches_the_title():
    """A record renamed but not retitled sends a reader to the wrong page from the table."""
    for path in records():
        slug = FILENAME.match(path.name).group(2)
        words = [w for w in re.findall(r"[a-z0-9]+", title_of(path).lower()) if len(w) > 3]
        missing = [w for w in words if w not in slug]
        assert len(missing) <= len(words) // 2, (
            f"{path.name} is titled {title_of(path)!r}, which shares little with its file name. Rename the "
            f"file, or retitle it, so a reader of the table lands where they expect."
        )


def test_every_record_declares_a_status_the_format_allows():
    for path in records():
        data = frontmatter(path)
        status = str(data.get("status") or "").strip()
        assert status in STATUSES or SUPERSEDED.match(status), (
            f"{path.name} has status {status!r}. MADR allows {sorted(STATUSES)} or 'superseded by ADR-NNNN'."
        )
        assert data.get("date"), f"{path.name} has no `date`, so nobody knows when it was last weighed"
        assert data.get("decision-makers"), f"{path.name} does not say who decided"


def test_every_record_holds_the_sections_a_reader_needs():
    for path in records():
        text = path.read_text(encoding="utf-8")
        missing = [head for head in REQUIRED if head not in text]
        assert not missing, (
            f"{path.name} is missing {missing}. `Consequences` and `Confirmation` are optional in MADR and "
            f"required here: a decision with no consequences cannot be weighed later, and one with no "
            f"confirmation is one nothing would notice being reversed."
        )


def test_every_record_says_how_it_would_be_caught_being_reversed():
    """A Confirmation section that names no test, file or command is a heading, not a check."""
    for path in records():
        text = path.read_text(encoding="utf-8")
        section = text.split("### Confirmation", 1)[1].split("\n## ", 1)[0]
        assert re.search(r"`[\w./-]+\.(py|rs|ts|tsx|json|md)`|`npm run [\w:]+`", section), (
            f"{path.name}: its Confirmation section names no test file, source file or command. Name the "
            f"thing that would fail if this decision were quietly reversed."
        )


def test_the_readme_table_and_the_folder_agree():
    rows = TABLE_ROW.findall(README.read_text(encoding="utf-8"))
    listed = {name for _, name, _, _ in rows}
    on_disk = {p.name for p in records()}
    assert listed == on_disk, (
        f"the README table and the folder disagree. Only in the table: {sorted(listed - on_disk)}. "
        f"Only on disk: {sorted(on_disk - listed)}."
    )
    for number, name, _, status in rows:
        assert name.startswith(number), f"the table links {number} to {name}"
        declared = str(frontmatter(DECISIONS / name).get("status")).strip()
        assert status.strip() == declared, (
            f"the README table says {name} is {status.strip()!r} and the record itself says {declared!r}"
        )


def test_agents_md_points_every_agent_at_the_decisions():
    """A record only Claude Code can find is a record Gemini has lost; AGENTS.md is what every agent reads."""
    text = AGENTS.read_text(encoding="utf-8")
    assert "docs/decisions/" in text, (
        "AGENTS.md never names `docs/decisions/`, so an agent asking why the program is built this way has "
        "no way to find out. This repository is agent-neutral: AGENTS.md is the one file all of them read."
    )
