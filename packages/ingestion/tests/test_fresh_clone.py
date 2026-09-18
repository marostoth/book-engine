"""A fresh clone starts with the README steps (TL-06).

`npm install` at the root installed 3 packages and left the 274 of `apps/desktop` uninstalled, because the root was
not a workspace and had no postinstall step. Measured on a folder holding only the files git keeps: 19 of the
frontend tests failed, every one of them with `ERR_MODULE_NOT_FOUND`. The versions the README asked for were too
old for the code, and its own verification steps read a vault that a clone does not have.
"""

import json
import re
import shutil
import subprocess
import tomllib

import pytest
from conftest import REPO

ROOT_PACKAGE = REPO / "package.json"
ROOT_LOCK = REPO / "package-lock.json"
DESKTOP_PACKAGE = REPO / "apps" / "desktop" / "package.json"
CARGO = REPO / "apps" / "desktop" / "src-tauri" / "Cargo.toml"
README = REPO / "README.md"

#: `--experimental-strip-types`, which the frontend test command needs, arrived in this version of Node.
STRIP_TYPES_ARRIVED = (22, 6, 0)


def numbers_of(version: str) -> tuple[int, ...]:
    """The numbers of a version, however it is written: `>=22.6.0`, `1.88`, `22.6.0+`."""
    return tuple(int(part) for part in re.findall(r"\d+", version))


def at_least(version: tuple[int, ...], lowest: tuple[int, ...]) -> bool:
    filled = version + (0,) * (len(lowest) - len(version))
    return filled[: len(lowest)] >= lowest


def root_package() -> dict:
    return json.loads(ROOT_PACKAGE.read_text(encoding="utf-8"))


def readme_versions() -> dict:
    """What the README asks a new reader to install, by name."""
    found = {}
    for line in README.read_text(encoding="utf-8").splitlines():
        match = re.match(r"- \*\*(Node\.js|Rust & Cargo|Python)\*\*: `([^`]+)`", line.strip())
        if match:
            found[match.group(1)] = match.group(2)
    return found


def readme_verification_block() -> list[str]:
    """The commands of the README's verification section, in the order it gives them."""
    text = README.read_text(encoding="utf-8")
    start = text.index("### 3. Verification & Benchmarking Suite")
    section = text[start:].split("\n---", 1)[0]
    found: list[str] = []
    for block in section.split("```bash")[1:]:
        for line in block.split("```", 1)[0].splitlines():
            if line.strip() and not line.strip().startswith("#"):
                found.append(line.strip())
    return found


def git_says(*arguments: str) -> str:
    if shutil.which("git") is None:
        pytest.skip("git is not on this computer")
    done = subprocess.run(["git", *arguments], cwd=str(REPO), capture_output=True, text=True, check=False)
    if done.returncode != 0:
        pytest.skip(f"git could not answer: {done.stderr.strip()}")
    return done.stdout


# ---------------------------------------------------------------------------
# One install
# ---------------------------------------------------------------------------


def test_one_npm_install_reaches_the_frontend():
    """The root install gave 3 packages and `apps/desktop` needs 274, so nothing the app runs on was installed."""
    assert root_package().get("workspaces") == ["apps/desktop"]


def test_the_repository_keeps_one_lock_file():
    """Two lock files is one too many: npm keeps a single one at the root of a workspace, and the second went stale."""
    tracked = git_says("ls-files", "--", "*package-lock.json").split()
    assert tracked == ["package-lock.json"], tracked


def test_the_one_lock_file_holds_what_the_frontend_needs():
    """A lock file that names none of the frontend packages would install none of them."""
    locked = json.loads(ROOT_LOCK.read_text(encoding="utf-8"))["packages"]
    asked = json.loads(DESKTOP_PACKAGE.read_text(encoding="utf-8"))
    names = set(asked["dependencies"]) | set(asked["devDependencies"])
    installed = {place.split("node_modules/")[-1] for place in locked if place}

    missing = sorted(names - installed)
    assert not missing, f"the lock file installs none of: {missing}"
    assert "apps/desktop" in locked, "the lock file does not know apps/desktop as a workspace"


# ---------------------------------------------------------------------------
# The versions
# ---------------------------------------------------------------------------


def test_the_node_the_readme_asks_for_can_run_the_frontend_tests():
    """The README said 18.0+, and the test command uses a flag that arrived in 22.6.0. The floor is higher than the
    flag, because 22.6.0 cannot read every test file; test_one_check.py holds that measurement (TL-05)."""
    test_command = json.loads(DESKTOP_PACKAGE.read_text(encoding="utf-8"))["scripts"]["test"]
    assert "--experimental-strip-types" in test_command, "this test guards a flag the command no longer uses"

    asked = numbers_of(readme_versions()["Node.js"])
    assert at_least(asked, STRIP_TYPES_ARRIVED), f"the README asks for Node {asked}, too old for the test command"


def test_the_root_package_says_the_same_node_as_the_readme():
    """`engines` is what npm itself reads, so a reader is told by the tool as well as by the page."""
    declared = root_package()["engines"]["node"]
    assert at_least(numbers_of(declared), STRIP_TYPES_ARRIVED)
    assert numbers_of(declared) == numbers_of(readme_versions()["Node.js"])


def test_the_backend_says_the_oldest_rust_it_can_be_built_with():
    """Nothing said it, so cargo failed somewhere inside a dependency instead of naming the toolchain."""
    package = tomllib.loads(CARGO.read_text(encoding="utf-8"))["package"]
    assert "rust-version" in package, "Cargo.toml must say the oldest Rust that can build this"
    # Tauri 2.11.5 asks for 1.77.2 and other crates of the same build ask for more, so the floor is above tauri's.
    assert at_least(numbers_of(package["rust-version"]), (1, 78))


def test_the_readme_says_the_same_rust_as_cargo():
    """The README said 1.75+, which is below tauri's own 1.77.2 and far below what the build really needs."""
    package = tomllib.loads(CARGO.read_text(encoding="utf-8"))["package"]
    assert numbers_of(readme_versions()["Rust & Cargo"]) == numbers_of(package["rust-version"])


def test_the_readme_says_the_same_python_as_the_import():
    project = tomllib.loads((REPO / "packages" / "ingestion" / "pyproject.toml").read_text(encoding="utf-8"))
    assert numbers_of(readme_versions()["Python"]) == numbers_of(project["project"]["requires-python"])


# ---------------------------------------------------------------------------
# The verification steps
# ---------------------------------------------------------------------------


def test_a_clone_gets_no_book():
    """The vault of a clone is empty, which is why the steps below must make a book before they check one."""
    kept = [name for name in git_says("ls-files", "--", "vault/books").split() if not name.endswith(".gitkeep")]
    assert kept == [], f"git keeps book files: {kept[:5]}"


def test_the_readme_makes_a_book_before_it_checks_one():
    """The checks used to come first and read an empty vault, and named two books that are in no clone."""
    commands = readme_verification_block()
    makes = next(i for i, line in enumerate(commands) if "sample_generator" in line)
    checks = [i for i, line in enumerate(commands) if "audit-anchors" in line or "audit-practice" in line]
    assert checks, "the README runs no audit at all"
    assert all(makes < check for check in checks), commands


def test_every_command_of_the_verification_block_is_there():
    """The README named `vault/books/sample` and `vault/books/wealth-of-nations`, two folders no clone has."""
    for command in readme_verification_block():
        for word in command.split():
            if word.endswith(".py") or word.startswith(("vault/", "packages/")):
                assert (REPO / word).exists(), f"{command!r} names {word}, which is not in the repository"


def test_the_sample_book_command_the_readme_gives_is_the_one_that_exists():
    """It is `python -m ingest.sample_generator --vault vault`, and nothing documented it before."""
    source = (REPO / "packages" / "ingestion" / "ingest" / "sample_generator.py").read_text(encoding="utf-8")
    assert 'sys.argv[1] == "--vault"' in source
    assert any("ingest.sample_generator --vault vault" in line for line in readme_verification_block())
