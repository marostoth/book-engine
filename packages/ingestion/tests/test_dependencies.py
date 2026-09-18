"""The import runs with the exact package versions of `requirements.lock` (IN-05).

`pyproject.toml` gives each dependency with `>=` only, so pip can install a newer version of it. A new version of
pymupdf4llm or pymupdf-layout can change the Markdown of a book, and so its paragraphs and anchors. The lock gives the
exact version of every package that the import needs, and of every package that those packages need.

The lock covers the `dev` group of `pyproject.toml` as well, because pytest, Pillow, mypy and ruff are as much a part
of a working copy of this package as pymupdf is. A computer that had no Pillow could not run the tests at all (IN-11).
"""

import importlib.metadata
import tomllib
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

PACKAGE = Path(__file__).resolve().parents[1]
LOCK = PACKAGE / "requirements.lock"
INSTALL = "python -m pip install -r packages/ingestion/requirements.lock"


def locked() -> dict[str, Requirement]:
    """Every package in the lock, by its name."""
    packages: dict[str, Requirement] = {}
    for line in LOCK.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            requirement = Requirement(line)
            packages[canonicalize_name(requirement.name)] = requirement
    return packages


def version_of(requirement: Requirement) -> str:
    """The one exact version of a package in the lock."""
    specifiers = list(requirement.specifier)
    assert len(specifiers) == 1 and specifiers[0].operator == "==", f"{requirement} does not give one exact version"
    return specifiers[0].version


def needed_here(requirement: Requirement) -> bool:
    """Whether this computer needs the package: it has no marker, such as `sys_platform == "win32"`, or a true one."""
    return requirement.marker is None or requirement.marker.evaluate({"extra": ""})


def every_dependency() -> list[str]:
    """Every package `pyproject.toml` asks for: the ones the import needs, and the ones the work on it needs."""
    project = tomllib.loads((PACKAGE / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    asked = list(project["dependencies"])
    for group in project.get("optional-dependencies", {}).values():
        asked.extend(group)
    return asked


def test_every_dependency_of_the_package_has_one_exact_version_in_the_lock():
    lock = locked()

    for dependency in every_dependency():
        requirement = Requirement(dependency)
        name = canonicalize_name(requirement.name)
        assert name in lock, f"{name} is not in requirements.lock"
        assert requirement.specifier.contains(version_of(lock[name])), f"{lock[name]} does not match {dependency}"
    for requirement in lock.values():
        version_of(requirement)


def test_the_lock_has_every_package_that_a_locked_package_needs():
    lock = locked()
    missing = []
    for name, requirement in lock.items():
        if not needed_here(requirement):
            continue
        for needed in map(Requirement, importlib.metadata.requires(name) or []):
            if not needed_here(needed):
                continue
            found = lock.get(canonicalize_name(needed.name))
            if found is None:
                missing.append(f"{needed} (for {name})")
            elif not needed.specifier.contains(version_of(found), prereleases=True):
                missing.append(f"{needed} (for {name}), and the lock has {found}")
    assert missing == []


def test_the_installed_packages_have_the_versions_of_the_lock():
    other = []
    for name, requirement in locked().items():
        if not needed_here(requirement):
            continue
        try:
            installed = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            installed = "not installed"
        if installed != version_of(requirement):
            other.append(f"{name} {installed}, and the lock has {version_of(requirement)}")
    assert other == [], f"Install the versions of the lock: {INSTALL}"
