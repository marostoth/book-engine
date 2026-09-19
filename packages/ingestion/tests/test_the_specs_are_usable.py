"""The specs stay findable, numbered and free of technology (`docs/specs/`).

A spec says what a person should be able to do, **before** the feature is built. This repository had none:
15 phases were built and every one of them was argued about in code, where arguing is expensive. The folder
follows the Spec-Driven Development loop of spec-kit (https://github.com/github/spec-kit): `spec.md` says
what, `plan.md` says how, `tasks.md` says in what order, and the commits do it.

Two faults are worth guarding, and both have already happened in this repository:

1. **A folder of documents that no guard reads.** `docs/rules/` and `docs/decisions/` were each left off
   `DOCUMENT_FOLDERS` in `test_the_docs_match_the_code.py`, and the second time the commit message already
   claimed the cover existed. `docs/specs/` went on that list in the same commit as this file.
2. **A box ticked before the work was done.** The first draft of `tasks.md` in this very folder was written
   with all 24 tasks already ticked, and nothing had been built. So a spec that calls itself implemented
   must have no open task, and a spec that does not must have one.

The third check here is the one spec-kit is strict about: `spec.md` names no language, library or file. A
spec that names a file can only be agreed with. A spec that describes what a reader sees can be argued with,
and arguing is the whole point of writing it first.
"""

import re
from pathlib import Path

from conftest import REPO

SPECS = REPO / "docs" / "specs"
README = SPECS / "README.md"
AGENTS = REPO / "AGENTS.md"

#: `NNNN-title-with-dashes`, the feature folder name.
FOLDER = re.compile(r"^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)$")

#: The three files of the loop. A folder missing one of them is a step nobody took.
LOOP = ("spec.md", "plan.md", "tasks.md")

#: What a spec may call itself. `implemented` is checked against the task list, not taken on trust.
STATUSES = {"draft", "planned", "implemented"}

#: The headings spec-kit marks mandatory, plus the two subheadings that carry the numbered requirements.
REQUIRED = (
    "## User Scenarios & Testing *(mandatory)*",
    "## Requirements *(mandatory)*",
    "### Functional Requirements",
    "## Success Criteria *(mandatory)*",
    "### Measurable Outcomes",
)

#: Words that name a language, a library, a tool or a file type. None of them belongs in a spec: every one
#: of them is a decision, and a decision belongs in `plan.md` where it can be weighed against alternatives.
TECHNOLOGY = (
    "rust",
    "react",
    "tauri",
    "typescript",
    "javascript",
    "sqlite",
    "python",
    "vitest",
    "pytest",
    "cargo",
    "npm",
    "fts5",
    "tiptap",
    "prosemirror",
    "serde",
    "tokio",
    "clippy",
    "eslint",
)

#: A backticked word with a slash in it, which in this repository is always a file or a folder.
PATH_IN_TEXT = re.compile(r"`((?:[\w.@-]+/)+[\w.@-]*)`")

#: A file name with an extension, backticked or not.
FILE_NAME = re.compile(r"\b[\w.-]+\.(?:rs|ts|tsx|py|json|toml|md|mjs|cjs|css|html)\b")

#: A row of the README table: `| [0001](0001-slug/spec.md) | title | status | finding |`.
TABLE_ROW = re.compile(r"^\|\s*\[(\d{4})\]\((\d{4}-[a-z0-9-]+)/spec\.md\)\s*\|([^|]*)\|([^|]*)\|", re.MULTILINE)

#: A task line: `- [ ] **T001** ...` or `- [x] **T001** ...`.
TASK = re.compile(r"^- \[([ x])\] \*\*T(\d{3})\*\*", re.MULTILINE)

#: A numbered requirement or success criterion: `- **FR-001**:` and `- **SC-001**:`.
NUMBERED = re.compile(r"^- \*\*([A-Z]{2})-(\d{3})\*\*:", re.MULTILINE)


def features() -> list[Path]:
    return sorted(p for p in SPECS.iterdir() if p.is_dir())


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def title_of(path: Path) -> str:
    for line in read(path).splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise AssertionError(f"{path} has no `# ` title")


def status_of(folder: Path) -> str:
    for line in read(folder / "spec.md").splitlines():
        if line.startswith("**Status:**"):
            return line.removeprefix("**Status:**").strip()
    raise AssertionError(f"{folder.name}/spec.md has no `**Status:**` line")


def test_the_readers_of_this_file_find_something():
    """Each check below compares two lists, and two empty lists agree about nothing."""
    found = features()
    assert found, f"no feature folder was found in {SPECS}, so every check below passes by saying nothing"
    assert README.exists(), f"{README} is missing, so nothing indexes the specs"

    assert FOLDER.match("0001-the-vocabulary-bank"), "the folder reader rejects a real folder name"
    assert not FOLDER.match("1-short"), "the folder reader accepts a number that is not four digits"
    assert not FOLDER.match("0001-Title-With-Capitals"), "the folder reader accepts capitals"

    rows = TABLE_ROW.findall(read(README))
    assert rows, "the README table reader found no rows, so the table check means nothing"

    tasks = TASK.findall(read(found[0] / "tasks.md"))
    assert tasks, f"the task reader found no task in {found[0].name}/tasks.md"

    numbered = NUMBERED.findall(read(found[0] / "spec.md"))
    assert numbered, f"the requirement reader found no `- **FR-001**:` line in {found[0].name}/spec.md"

    assert TECHNOLOGY, "the technology list is empty, so the spec check forbids nothing"
    assert PATH_IN_TEXT.findall("see `docs/specs/README.md` now"), "the path reader misses a real path"
    assert FILE_NAME.search("commands.rs holds it"), "the file-name reader misses a real file name"


def test_every_feature_folder_is_named_the_way_the_loop_says():
    for folder in features():
        assert FOLDER.match(folder.name), (
            f"{folder.name} is not `NNNN-title-with-dashes`. Four digits, then the title in lower case with "
            f"dashes, so the specs sort in the order they were asked for."
        )


def test_the_numbering_has_no_gaps_and_no_duplicates():
    numbers = [int(FOLDER.match(f.name).group(1)) for f in features()]
    duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
    assert not duplicates, f"two feature folders share a number: {duplicates}"
    assert numbers == list(range(1, len(numbers) + 1)), (
        f"the numbers are {numbers}; they must run from 1 with no gap, so a missing spec is visible"
    )


def test_every_feature_folder_holds_the_three_steps_of_the_loop():
    for folder in features():
        missing = [name for name in LOOP if not (folder / name).exists()]
        assert not missing, (
            f"{folder.name} is missing {missing}. The loop is specify, plan, tasks, implement; a folder "
            f"without all three is a step somebody skipped."
        )


def test_the_folder_name_matches_the_spec_title():
    """A folder renamed but not retitled sends a reader to the wrong page from the table."""
    for folder in features():
        slug = FOLDER.match(folder.name).group(2)
        words = [w for w in re.findall(r"[a-z0-9]+", title_of(folder / "spec.md").lower()) if len(w) > 3]
        missing = [w for w in words if w not in slug]
        assert len(missing) <= len(words) // 2, (
            f"{folder.name} holds a spec titled {title_of(folder / 'spec.md')!r}, which shares little with "
            f"the folder name. Rename the folder, or retitle the spec."
        )


def test_every_spec_declares_a_status_this_repository_allows():
    for folder in features():
        status = status_of(folder)
        assert status in STATUSES, f"{folder.name}/spec.md has status {status!r}; allowed: {sorted(STATUSES)}"


def test_every_spec_holds_the_headings_the_format_says_are_mandatory():
    for folder in features():
        text = read(folder / "spec.md")
        missing = [head for head in REQUIRED if head not in text]
        assert not missing, (
            f"{folder.name}/spec.md is missing {missing}. Without the scenarios there is nothing to test "
            f"against, and without the success criteria there is no way to say the feature is done."
        )


def test_the_requirements_and_the_criteria_are_numbered_from_one():
    """A gap in `FR-001, FR-002, FR-004` means a requirement was deleted and something still cites it."""
    for folder in features():
        found: dict[str, list[int]] = {}
        for prefix, number in NUMBERED.findall(read(folder / "spec.md")):
            found.setdefault(prefix, []).append(int(number))
        assert found, f"{folder.name}/spec.md numbers no requirement at all"
        for prefix, numbers in found.items():
            assert numbers == list(range(1, len(numbers) + 1)), (
                f"{folder.name}/spec.md numbers {prefix} as {numbers}; they must run from 1 with no gap"
            )


def test_no_spec_names_a_language_a_library_or_a_file():
    """spec-kit's one strict rule. A spec that names a file can only be agreed with, never argued with."""
    named: list[str] = []
    for folder in features():
        for number, line in enumerate(read(folder / "spec.md").splitlines(), start=1):
            where = f"{folder.name}/spec.md:{number}"
            lower = line.lower()
            for word in TECHNOLOGY:
                if re.search(rf"\b{word}\b", lower):
                    named.append(f"{where} names {word!r}")
            for path in PATH_IN_TEXT.findall(line):
                named.append(f"{where} names the path `{path}`")
            # A link to another document is how a spec cites what it does not repeat, so only the prose is read.
            for name in FILE_NAME.findall(re.sub(r"\[[^]]*\]\([^)]*\)", "", line)):
                named.append(f"{where} names the file {name!r}")
    assert not named, (
        "a spec says what a person should be able to do, and nothing about how:\n  "
        + "\n  ".join(named)
        + "\nMove every one of these into `plan.md`, where it can be weighed against the alternative."
    )


def test_every_plan_is_checked_against_the_rules_of_this_repository():
    """A plan with no Constitution Check is a plan nobody held against the rules it has to obey."""
    for folder in features():
        text = read(folder / "plan.md")
        assert "## Constitution Check" in text, (
            f"{folder.name}/plan.md has no `## Constitution Check`. spec-kit gates the plan on the project's "
            f"own rules; here those rules are `AGENTS.md` and `docs/rules/`."
        )
        cited = [p for p in PATH_IN_TEXT.findall(text) if p.startswith("docs/rules/")]
        assert cited or "AGENTS.md" in text, (
            f"{folder.name}/plan.md cites no rule at all. Name the rules this feature has to obey, or the "
            f"gate is a heading."
        )
        for path in cited:
            assert (REPO / path).exists(), f"{folder.name}/plan.md cites `{path}`, which is on no disk here"


def test_every_task_is_numbered_from_one_with_no_gaps():
    for folder in features():
        numbers = [int(n) for _, n in TASK.findall(read(folder / "tasks.md"))]
        assert numbers, f"{folder.name}/tasks.md holds no task"
        assert numbers == list(range(1, len(numbers) + 1)), (
            f"{folder.name}/tasks.md numbers its tasks {numbers}; they must run from 1 with no gap, so a "
            f"task that was dropped is visible"
        )


def test_a_spec_calls_itself_implemented_only_when_every_task_is_done():
    """The first draft of tasks.md here was written with all 24 boxes ticked and nothing built."""
    for folder in features():
        status = status_of(folder)
        boxes = [box for box, _ in TASK.findall(read(folder / "tasks.md"))]
        open_tasks = boxes.count(" ")
        if status == "implemented":
            assert open_tasks == 0, (
                f"{folder.name} calls itself implemented and leaves {open_tasks} of {len(boxes)} tasks open"
            )
        else:
            assert open_tasks > 0, (
                f"{folder.name} is {status!r} and every one of its {len(boxes)} tasks is ticked. Either the "
                f"work is done and the status should say so, or a box was ticked before the work."
            )


def test_the_readme_table_and_the_folders_agree():
    rows = TABLE_ROW.findall(read(README))
    listed = {name for _, name, _, _ in rows}
    on_disk = {f.name for f in features()}
    assert listed == on_disk, (
        f"the README table and the folders disagree. Only in the table: {sorted(listed - on_disk)}. "
        f"Only on disk: {sorted(on_disk - listed)}."
    )
    for number, name, _, status in rows:
        assert name.startswith(number), f"the table links {number} to {name}"
        declared = status_of(SPECS / name)
        assert status.strip() == declared, (
            f"the README table says {name} is {status.strip()!r} and its spec says {declared!r}"
        )


def test_agents_md_points_every_agent_at_the_specs():
    """A spec only Claude Code can find is a spec Gemini has lost; AGENTS.md is what every agent reads."""
    assert "docs/specs/" in read(AGENTS), (
        "AGENTS.md never names `docs/specs/`, so an agent about to build a feature has no way to learn that "
        "a spec comes first. This repository is agent-neutral: AGENTS.md is the one file all of them read."
    )
