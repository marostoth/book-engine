"""Every package the code imports is a package the lists ask for, and no tool of the work is a part of the import.

`pyproject.toml` used to ask for pytest as a thing the import needs, so a computer that only wanted to read books got
the test runner as well. At the same time it asked for no Pillow, and `tests/test_figure_cards.py` opens a picture
with it: a computer that installed exactly what the lists named could not run the tests at all. Neither list was
compared with the code, so neither was true (IN-11).

These tests read every `import` line of the package with `ast`, which needs no package to be installed, and compare
what they find with the two lists of `pyproject.toml`.
"""

import ast
import importlib.metadata
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

PACKAGE = Path(__file__).resolve().parents[1]
REPO = PACKAGE.parents[1]

# Folders of Python that this repository owns, and whether what they import is a part of the import of a book.
CODE_OF_THE_IMPORT = PACKAGE / "ingest"
CODE_OF_THE_WORK = [PACKAGE / "tests", REPO / ".agent" / "skills"]

# A module of this repository is never a package to install.
OUR_OWN = {"ingest", "tests", "conftest"}

# The name a package is imported by is not always the name it is installed by. This computer is asked first
# (`importlib.metadata.packages_distributions`), and these are the answers for a computer that lacks the package.
ANOTHER_NAME = {
    "bs4": "beautifulsoup4",
    "PIL": "pillow",
    "fitz": "pymupdf",
    "yaml": "pyyaml",
}

# A tool that the work needs, which the import of a book must never drag in.
TOOLS_OF_THE_WORK = {"pytest", "pillow", "mypy", "ruff"}


def lists_of_the_package() -> dict[str, list[str]]:
    """The two lists of `pyproject.toml`: what the import needs, and what the work on it needs."""
    project = tomllib.loads((PACKAGE / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    groups = {"dependencies": list(project["dependencies"])}
    for name, group in project.get("optional-dependencies", {}).items():
        groups[name] = list(group)
    return groups


def names_in(asked: list[str]) -> set[str]:
    """The name of every package in one list of `pyproject.toml`."""
    return {canonicalize_name(Requirement(line).name) for line in asked}


def imported_by(folder: Path) -> dict[str, list[str]]:
    """Every package from outside this repository that the folder imports, with the files that import it."""
    outside: dict[str, list[str]] = {}
    for path in sorted(folder.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        found: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                found.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                found.add(node.module.split(".")[0])
        for top in found:
            if top not in sys.stdlib_module_names and top not in OUR_OWN:
                outside.setdefault(top, []).append(path.name)
    return outside


def could_be_called(module: str) -> set[str]:
    """The names this module could be installed by: what this computer says, else the written answer."""
    from_here = importlib.metadata.packages_distributions().get(module)
    if from_here:
        return {canonicalize_name(name) for name in from_here}
    return {canonicalize_name(ANOTHER_NAME.get(module, module))}


def test_the_import_of_a_book_asks_for_every_package_it_imports():
    asked = names_in(lists_of_the_package()["dependencies"])
    missing = [
        f"{module} (imported by ingest/{', ingest/'.join(files)})"
        for module, files in sorted(imported_by(CODE_OF_THE_IMPORT).items())
        if not could_be_called(module) & asked
    ]
    assert missing == [], f"`dependencies` of pyproject.toml names none of these: {missing}"


def test_the_work_on_the_package_asks_for_every_package_it_imports():
    lists = lists_of_the_package()
    asked = names_in(lists["dependencies"]) | names_in(lists.get("dev", []))
    missing = []
    for folder in CODE_OF_THE_WORK:
        if not folder.exists():
            continue
        for module, files in sorted(imported_by(folder).items()):
            if not could_be_called(module) & asked:
                missing.append(f"{module} (imported by {folder.name}/{', '.join(files)})")
    assert missing == [], f"Neither list of pyproject.toml names these: {missing}"


def test_no_tool_of_the_work_is_a_part_of_the_import():
    asked = names_in(lists_of_the_package()["dependencies"])
    tools = sorted(asked & {canonicalize_name(name) for name in TOOLS_OF_THE_WORK})
    assert tools == [], f"A computer that only imports books does not need {tools}: move them to the `dev` group"


def test_the_work_on_the_package_asks_for_its_tools():
    asked = names_in(lists_of_the_package().get("dev", []))
    missing = sorted({canonicalize_name(name) for name in TOOLS_OF_THE_WORK} - asked)
    assert missing == [], f"The `dev` group of pyproject.toml names no {missing}"


def test_git_keeps_no_file_that_a_build_writes():
    """The folder a build writes about the package is not in git, and .gitignore keeps it out."""
    assert "*.egg-info/" in (REPO / ".gitignore").read_text(encoding="utf-8").splitlines()

    try:
        listed = subprocess.run(
            ["git", "ls-files", "--", "*.egg-info/*"],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:  # no git here, so there is nothing to say
        pytest.skip(f"git could not list the files of this repository: {error}")

    assert listed.stdout.strip() == "", f"git still keeps what a build writes:\n{listed.stdout}"
