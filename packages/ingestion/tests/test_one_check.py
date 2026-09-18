"""One command runs every check, and a workflow runs it on every push (TL-05).

Nothing ran automatically: there was no `.github/` folder at all, no ESLint, no Prettier, no rustfmt settings, no
clippy settings, no ruff settings that reached `.agent/skills`, and no one command. mypy was configured strict and
reported 41 errors; ruff, given a named rule set, reported 1,012; `cargo fmt --check` wanted 60 of the 70 Rust files;
clippy had 6 warnings. Every one of those is zero now, and this file fails when a check is taken back out.
"""

import json
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest
from conftest import REPO

ROOT_PACKAGE = REPO / "package.json"
DESKTOP_PACKAGE = REPO / "apps" / "desktop" / "package.json"
WORKFLOW = REPO / ".github" / "workflows" / "check.yml"
RUFF = REPO / "ruff.toml"
RUSTFMT = REPO / "rustfmt.toml"
ESLINT = REPO / "apps" / "desktop" / "eslint.config.js"
PYPROJECT = REPO / "packages" / "ingestion" / "pyproject.toml"

#: Every tool the one command must run, and the words that prove it is in there.
TOOLS = {
    "cargo fmt": "cargo fmt",
    "clippy": "cargo clippy",
    "cargo test": "cargo test",
    "tsc": "run tsc",
    "eslint": "run lint",
    "the frontend tests": "apps/desktop test",
    "ruff": "ruff check",
    "ruff format": "ruff format --check",
    "mypy": "mypy",
    "pytest": "pytest",
}


def scripts_of(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))["scripts"]


def the_whole_check() -> str:
    """Every command `npm run check` runs, joined, however many scripts it is spread over."""
    scripts = scripts_of(ROOT_PACKAGE)
    seen: list[str] = []

    def follow(name: str) -> None:
        line = scripts.get(name, "")
        seen.append(line)
        for part in re.findall(r"npm run ([a-z:]+)", line):
            if part not in ("check",):
                follow(part)

    follow("check")
    return " && ".join(seen)


# ---------------------------------------------------------------------------
# One command
# ---------------------------------------------------------------------------


def test_there_is_one_command_that_runs_every_check():
    assert "check" in scripts_of(ROOT_PACKAGE), "the repository must have `npm run check`"


@pytest.mark.parametrize("tool", sorted(TOOLS))
def test_the_one_command_runs(tool: str):
    """A check that the one command forgets is a check nobody runs."""
    assert TOOLS[tool] in the_whole_check(), f"`npm run check` does not run {tool}"


def test_the_one_command_stops_at_the_first_failure():
    """`&&` between the parts, never `;`, or a red check would be hidden by a green one after it."""
    line = scripts_of(ROOT_PACKAGE)["check"]
    assert ";" not in line, line
    assert "&&" in line, line


def test_clippy_refuses_a_warning():
    """Without `-D warnings` clippy prints its findings and stops with 0, which every script reads as a pass."""
    assert "-D warnings" in the_whole_check()


def test_the_frontend_has_a_lint_script():
    assert scripts_of(DESKTOP_PACKAGE).get("lint") == "eslint ."


# ---------------------------------------------------------------------------
# The settings each tool reads
# ---------------------------------------------------------------------------


def test_every_tool_has_its_settings_written_down():
    """There were none: no ESLint, no Prettier, no rustfmt and no clippy settings, and ruff's did not reach far."""
    for path in (RUFF, RUSTFMT, ESLINT, WORKFLOW):
        assert path.is_file(), f"{path.relative_to(REPO).as_posix()} is not there"


def test_ruff_reads_its_settings_from_the_root():
    """They lived in `packages/ingestion/pyproject.toml`, which ruff never reads for `.agent/skills` (TL-05).

    Measured: the scripts were checked at ruff's own 88 columns, and 292 lines were called too long when only 39 of
    them are longer than the 120 this repository writes to.
    """
    assert "line-length = 120" in RUFF.read_text(encoding="utf-8")
    assert "[tool.ruff]" not in PYPROJECT.read_text(encoding="utf-8")


def test_every_rule_ruff_does_not_run_says_why():
    """A rule turned off with no reason is a rule nobody can argue with later."""
    text = RUFF.read_text(encoding="utf-8")
    inside = text.split("ignore = [", 1)[1].split("]", 1)[0]
    turned_off = re.findall(r'"([A-Z]+\d*)"', inside)
    assert turned_off, "the ignore list is empty; this test guards the reasons beside it"
    for rule in turned_off:
        before = inside.split(f'"{rule}"')[0].rstrip().splitlines()
        assert before and before[-1].strip().startswith("#"), f"{rule} is turned off with no reason above it"


def test_ruff_names_its_rules_instead_of_taking_whatever_is_new():
    """Ruff's own list grows with every release, and this repository's one check would fail for a rule nobody here
    chose. The rules are named."""
    lines = RUFF.read_text(encoding="utf-8").splitlines()
    assert any(line.startswith("select = [") for line in lines), "ruff.toml must name its rules with `select`"


def test_rustfmt_is_set_to_the_width_this_repository_writes_to():
    """At rustfmt's own 100 the reformat touched 65 files and added 3,382 lines; at 120 it touched 60 and added
    1,947. The Rust here is written to 120."""
    assert "max_width = 120" in RUSTFMT.read_text(encoding="utf-8")


def test_every_react_rule_that_only_warns_says_why_and_names_who_owns_it():
    """A warning nobody has to act on is a warning nobody reads, so each one names the finding that owns it."""
    text = ESLINT.read_text(encoding="utf-8")
    warned = re.findall(r'"(react-hooks/[a-z-]+)": "warn"', text)
    assert len(warned) == 5, warned
    assert "TL-11" in text, "the rules that only warn must name the finding that owns them"


# ---------------------------------------------------------------------------
# The workflow
# ---------------------------------------------------------------------------


def test_the_workflow_runs_on_every_push_and_every_pull_request():
    text = WORKFLOW.read_text(encoding="utf-8")
    on = text.split("on:", 1)[1].split("concurrency:", 1)[0]
    assert "push:" in on and "pull_request:" in on, on


def test_the_workflow_runs_the_one_command_and_nothing_of_its_own():
    """A workflow that runs its own list of checks goes stale the day the one command changes."""
    text = WORKFLOW.read_text(encoding="utf-8")
    for part in ("npm run check:rust", "npm run check:web", "npm run check:python"):
        assert part in text, f"the workflow does not run {part}"


def test_the_workflow_asks_for_the_versions_the_readme_asks_for():
    """A runner on an older Node or Rust would go red for a reason that is not the code (TL-06)."""
    text = WORKFLOW.read_text(encoding="utf-8")
    node = json.loads(ROOT_PACKAGE.read_text(encoding="utf-8"))["engines"]["node"]
    rust = tomllib.loads((REPO / "apps" / "desktop" / "src-tauri" / "Cargo.toml").read_text(encoding="utf-8"))
    assert re.search(r'node-version:\s*"' + re.escape(node.lstrip(">=")) + '"', text), text[:0] or node
    assert f"rustup toolchain install {rust['package']['rust-version']}" in text


def test_the_workflow_makes_a_book_before_it_runs_a_check_that_reads_one():
    """A clone's vault is empty, so the audits would fail on nothing (TL-04, TL-06)."""
    text = WORKFLOW.read_text(encoding="utf-8")
    makes = text.index("ingest.sample_generator")
    for audit in ("audit-anchors.py", "audit-practice.py"):
        assert makes < text.index(audit), f"{audit} runs before the book is made"


def test_the_workflow_is_kept_by_git():
    """A workflow that git does not keep never runs."""
    if shutil.which("git") is None:
        pytest.skip("git is not on this computer")
    done = subprocess.run(
        ["git", "ls-files", "--", ".github/workflows"], cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if done.returncode != 0:
        pytest.skip("git could not answer")
    assert ".github/workflows/check.yml" in done.stdout


# ---------------------------------------------------------------------------
# The rules the agents read
# ---------------------------------------------------------------------------


def test_the_rules_name_the_one_command():
    rules = (REPO / "AGENTS.md").read_text(encoding="utf-8")
    assert "npm run check" in rules


# ---------------------------------------------------------------------------
# The checks themselves, on this repository, now
# ---------------------------------------------------------------------------


def run_here(*command: str) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=str(REPO), capture_output=True, text=True, check=False)


def test_ruff_is_happy_with_the_import_and_the_skills():
    """It found 1,012 problems the day this was written, and a green run is the only way to see the next one."""
    done = run_here(sys.executable, "-m", "ruff", "check", "packages/ingestion", ".agent/skills")
    assert done.returncode == 0, done.stdout


def test_the_type_checker_is_happy_with_the_import():
    """mypy found a real crash in `ingest/places.py`: a highlight whose chapter the new text does not have got
    nothing back, and the next line read `.chapter_file` off that nothing. Keeping the import typed is how the next
    one gets found."""
    done = run_here(sys.executable, "-m", "mypy", "--config-file", str(PYPROJECT), "packages/ingestion/ingest")
    assert done.returncode == 0, done.stdout
