"""Every dependency of this repository carries a licence this repository has read (SEC-06).

The program is AGPL-3.0-or-later (`LICENSE`), because `ebooklib` is AGPL and nothing else, and handing this
to one friend counts the same as publishing it. `LICENSES.md` is the measured position, and this file is
what keeps that page true: it reads all three ecosystems again on every check and fails when a new
dependency arrives with a licence that page does not name.

Nothing here is recalled. Each licence comes from the installed package itself: the metadata `pip` wrote, the
`license` field of an installed `package.json`, and `cargo metadata`. A package whose licence cannot be read is
a failure, never a guess and never a silent pass.

Every "nothing bad was found" test in this file is paired with a count, because a reader that finds nothing
reports the same clean answer as a repository with nothing wrong in it.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tomllib
from importlib import metadata
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
PYPROJECT = REPO / "packages" / "ingestion" / "pyproject.toml"
CARGO_TOML = REPO / "apps" / "desktop" / "src-tauri" / "Cargo.toml"
TAURI_CONF = REPO / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"
RUST_SRC = REPO / "apps" / "desktop" / "src-tauri" / "src"
NODE_MODULES = REPO / "node_modules"
LICENCE_PAGE = REPO / "LICENSES.md"

# The one target this app builds for. Without it, cargo resolves the Android and macOS crates too, which are
# neither downloaded here nor in this build, and `--offline` stops on the first one it cannot fetch.
TARGET = "x86_64-pc-windows-msvc"

# A licence that lets a closed program use the code and hand it on, asking only for the notice to travel.
PERMISSIVE = {
    "0BSD",
    "Apache-2.0",
    "Apache-2.0 WITH LLVM-exception",
    "BlueOak-1.0.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BSL-1.0",
    "CC-BY-4.0",
    "CC0-1.0",
    "CDLA-Permissive-2.0",
    "ISC",
    "MIT",
    "MIT-0",
    "MIT-CMU",
    "MITNFA",
    "NCSA",
    "OpenSSL",
    "PSF-2.0",
    "Python-2.0",
    "Unicode-3.0",
    "Unicode-DFS-2016",
    "Unlicense",
    "WTFPL",
    "Zlib",
    # Older classifier wording, which `pip` still stores for packages that have not moved to an SPDX field.
    "MIT License",
    "BSD License",
    "Apache Software License",
    "3-Clause BSD License",
    "ISC License (ISCL)",
    "Python Software Foundation License",
    "The Unlicense (Unlicense)",
}

# This repository's own licence. Not permissive, and allowed on purpose: `book-engine-desktop` is read twice
# by the scans below, once as an npm workspace and once as a crate, and it must not be the one package whose
# licence this file refuses to accept.
OURS = "AGPL-3.0-or-later"

# The AGPL text as `ebooklib` installs it. Measured from the file itself, never taken from anywhere else:
# the sha256 of the 34520 bytes with every carriage return dropped, so git's CRLF cannot change it.
AGPL_SHA256 = "57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6"

# Every dependency that is NOT permissive, with the licence it declares. All of them sit happily inside an
# AGPL program; they are here because the check has to know each one by name. `LICENSES.md` explains them. A
# name may leave this list; a new one may only be added together with its row on that page, on purpose.
KNOWN: dict[str, str] = {
    # AGPL. `ebooklib` is why this whole repository is AGPL - see LICENSES.md.
    "ebooklib": "AGPL, and nothing else. There is no commercial licence to buy. It reads AND writes EPUB.",
    "pymupdf": "Dual licensed: AGPL, or the Artifex commercial licence.",
    "pymupdf4llm": "Dual licensed: AGPL, or the Artifex commercial licence. It pulls in the other two.",
    "pymupdf-layout": "Dual licensed: AGPL, or the Artifex commercial licence. Not declared; pymupdf4llm asks.",
    # MPL-2.0. File-level copyleft, and it sits inside the AGPL without trouble. None of them is changed here.
    "cssparser": "MPL-2.0, in the installer, via dom_query and selectors.",
    "cssparser-macros": "MPL-2.0, a proc-macro, so it runs while compiling and is not in the installer.",
    "dtoa-short": "MPL-2.0, in the installer, via cssparser.",
    "option-ext": "MPL-2.0, in the installer, via dirs-sys.",
    "selectors": "MPL-2.0, in the installer, via dom_query.",
    "pathspec": "MPL-2.0, a tool for working on the code only, via mypy.",
}

# Floors, not exact counts. A dependency added or removed must not fail this file for a harmless reason, but a
# reader that has stopped finding things must. Each number is well under what the reader printed on 2026-09-19:
# 22 Python runtime, 16 Python dev, 361 npm, 281 crates.
FEWEST_PYTHON = 18
FEWEST_NPM = 250
FEWEST_CRATES = 200


# ---------------------------------------------------------------- reading a licence expression


def is_permissive(text: str) -> bool:
    """True when at least one arm of the expression is made only of licences on the list above.

    Cargo's OLD syntax writes OR as a slash: `MIT/Apache-2.0`, `Apache-2.0 / MIT`. A reader that knows only the
    word OR calls 22 plainly permissive crates copyleft, which is what the first version of this reader did.
    """
    cleaned = text.replace("(", " ").replace(")", " ").replace("/", " OR ")
    for arm in cleaned.split(" OR "):
        parts = [p.strip() for p in arm.split(" AND ") if p.strip()]
        if parts and all(p in PERMISSIVE for p in parts):
            return True
    return False


def is_allowed(text: str) -> bool:
    """Permissive, or this repository's own licence. Anything else must be in KNOWN and on the page."""
    return text == OURS or is_permissive(text)


def test_the_permissive_reader_says_yes_and_no_to_the_right_things():
    """The sight check for every test below. A reader that says yes to everything finds nothing."""
    for good in ("MIT", "MIT/Apache-2.0", "Apache-2.0 / MIT", "Unlicense/MIT", "(MIT OR Apache-2.0) AND Unicode-3.0"):
        assert is_permissive(good), f"the reader called {good!r} not permissive, and it is"
    for bad in ("MPL-2.0", "AGPL-3.0", "UNKNOWN", "GPL-3.0 AND MIT", "MPL-2.0/GPL-2.0", "", "Other/Proprietary"):
        assert not is_permissive(bad), f"the reader called {bad!r} permissive, and it is not"
    # This repository's own licence is allowed without being permissive, and only in that exact spelling.
    assert is_allowed(OURS) and not is_permissive(OURS), "OURS must be allowed, and not called permissive"
    assert not is_allowed("AGPL-3.0"), "only the exact spelling this repository uses is allowed through"


# ---------------------------------------------------------------- Python


def _python_licence(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    expression = meta.get("License-Expression")
    if expression:
        return expression.strip()
    classifiers = [c for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    if classifiers:
        return " | ".join(c.split(" :: ")[-1] for c in classifiers)
    plain = (meta.get("License") or "").strip()
    if plain and "\n" not in plain and len(plain) < 200:
        return plain
    return "UNKNOWN"


def _python_packages() -> dict[str, str]:
    """Every installed package this repository's own dependencies reach, and the licence each one declares."""
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    project = data["project"]
    seeds = list(project.get("dependencies", []))
    for group in project.get("optional-dependencies", {}).values():
        seeds += list(group)

    found: dict[str, str] = {}
    queue = [re.split(r"[<>=!~\[]", s)[0].strip() for s in seeds]
    while queue:
        name = queue.pop()
        key = name.lower().replace("_", "-")
        if not key or key in found:
            continue
        try:
            dist = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            continue  # a package this Python does not need, such as tomli on 3.13
        found[key] = _python_licence(dist)
        for line in dist.requires or []:
            if "extra ==" in line:
                continue
            queue.append(re.split(r"[<>=!~\[; ]", line)[0].strip())
    return found


def test_the_reader_finds_the_python_packages():
    found = _python_packages()
    assert len(found) >= FEWEST_PYTHON, (
        f"only {len(found)} Python packages were found, so the licence test below proves nothing. "
        "Install the package first: pip install -e packages/ingestion[dev]"
    )


def test_every_python_package_is_permissive_or_is_on_the_licence_page():
    odd = {name: text for name, text in _python_packages().items() if not is_allowed(text)}
    surprises = {n: t for n, t in odd.items() if n not in KNOWN}
    assert not surprises, (
        "a Python package carries a licence this repository has not read:\n"
        + "\n".join(f"  {n}: {t}" for n, t in sorted(surprises.items()))
        + "\n\nRead what it asks for, add it to LICENSES.md and to KNOWN in this file, or drop the package."
    )


# ---------------------------------------------------------------- npm


def _npm_packages() -> dict[str, str]:
    """Every installed npm package. Workspaces hoist to the root, so one folder holds nearly all of them."""
    found: dict[str, str] = {}
    folders = []
    if NODE_MODULES.is_dir():
        for child in NODE_MODULES.iterdir():
            if child.name.startswith("."):
                continue
            folders += sorted(child.iterdir()) if child.name.startswith("@") else [child]
    for folder in folders:
        manifest = folder / "package.json"
        if not manifest.is_file():
            continue
        try:
            pkg = json.loads(manifest.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        name = pkg.get("name")
        if not name:
            continue
        value = pkg.get("license") or pkg.get("licenses")
        if isinstance(value, dict):
            value = value.get("type")
        elif isinstance(value, list):
            value = " OR ".join(str(v.get("type") if isinstance(v, dict) else v) for v in value)
        found[name] = str(value) if value else "UNKNOWN"
    return found


def test_the_reader_finds_the_npm_packages():
    found = _npm_packages()
    assert len(found) >= FEWEST_NPM, (
        f"only {len(found)} npm packages were found, so the licence test below proves nothing. Run `npm ci` first."
    )


def test_every_npm_package_is_permissive_or_is_on_the_licence_page():
    odd = {name: text for name, text in _npm_packages().items() if not is_allowed(text)}
    surprises = {n: t for n, t in odd.items() if n.lower() not in KNOWN}
    assert not surprises, (
        "an npm package carries a licence this repository has not read:\n"
        + "\n".join(f"  {n}: {t}" for n, t in sorted(surprises.items()))
        + "\n\nRead what it asks for, add it to LICENSES.md and to KNOWN in this file, or drop the package."
    )


# ---------------------------------------------------------------- Rust


def _crates() -> dict[str, str]:
    """Every crate in this build, from cargo's own answer."""
    done = subprocess.run(
        [
            "cargo",
            "metadata",
            "--offline",
            "--format-version",
            "1",
            "--filter-platform",
            TARGET,
            "--manifest-path",
            str(CARGO_TOML),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",  # cargo writes UTF-8; Windows would otherwise decode it as cp1252 and fail
        check=False,  # the message below says what to do; a raised CalledProcessError says nothing useful
    )
    if done.returncode != 0:
        # Never a skip. `npm run check` builds Rust before it runs these tests, and so does the workflow, so an
        # empty registry here means the check was run out of order, not that there is nothing to look at.
        pytest.fail(
            "cargo could not list the crates, so their licences were not read:\n"
            + (done.stderr or "")[-600:]
            + "\n\nRun `npm run check:rust` once first, which fetches the registry this reads."
        )
    meta = json.loads(done.stdout)
    in_build = {node["id"] for node in meta["resolve"]["nodes"]}
    out: dict[str, str] = {}
    for crate in meta["packages"]:
        if crate["id"] not in in_build:
            continue
        licence = crate.get("license") or (f"file: {crate['license_file']}" if crate.get("license_file") else "")
        out[crate["name"]] = licence or "UNKNOWN"
    return out


def test_the_reader_finds_the_crates():
    found = _crates()
    assert len(found) >= FEWEST_CRATES, (
        f"only {len(found)} crates were found, so the licence test below proves nothing."
    )


def test_every_crate_is_permissive_or_is_on_the_licence_page():
    odd = {name: text for name, text in _crates().items() if not is_allowed(text)}
    surprises = {n: t for n, t in odd.items() if n not in KNOWN}
    assert not surprises, (
        "a crate carries a licence this repository has not read:\n"
        + "\n".join(f"  {n}: {t}" for n, t in sorted(surprises.items()))
        + "\n\nRead what it asks for, add it to LICENSES.md and to KNOWN in this file, or drop the crate."
    )


# ---------------------------------------------------------------- this repository's own three manifests


def test_this_repository_names_its_own_licence_everywhere():
    """A package that says nothing is the one package whose licence the tests above cannot read."""
    said = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["project"].get("license")
    assert said == OURS, f"packages/ingestion/pyproject.toml says {said!r}"

    for manifest in (REPO / "package.json", REPO / "apps" / "desktop" / "package.json"):
        pkg = json.loads(manifest.read_text(encoding="utf-8"))
        assert pkg.get("license") == OURS, f"{manifest.name} says {pkg.get('license')!r}"

    cargo = tomllib.loads(CARGO_TOML.read_text(encoding="utf-8"))["package"]
    assert cargo.get("license") == OURS, f"Cargo.toml says {cargo.get('license')!r}"
    assert cargo.get("publish") is False, "Cargo.toml must say publish = false, so `cargo publish` refuses"


def test_the_licence_file_is_the_real_agpl_and_the_readme_points_at_it():
    """`LICENSE` is the AGPL text itself, byte for byte, never a paraphrase and never a summary.

    It was copied from the copy `ebooklib` installs. The document says it may be copied and not changed, so
    nothing of ours is added inside it: the copyright line and the explanation live in `LICENSES.md`. The
    hash is taken with the line endings made LF first, so git turning them into CRLF does not fail this.
    """
    raw = (REPO / "LICENSE").read_bytes()
    same = hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()
    assert same == AGPL_SHA256, (
        f"LICENSE is no longer the AGPL text as installed: sha256 {same}, expected {AGPL_SHA256}. If it "
        "was replaced on purpose, copy the new text in whole and put the new hash here."
    )
    text = raw.decode("utf-8")
    assert "GNU AFFERO GENERAL PUBLIC LICENSE" in text
    assert "13. Remote Network Interaction" in text, "section 13 is what makes this the AGPL, not the GPL"

    readme = (REPO / "README.md").read_text(encoding="utf-8")
    assert "(./LICENSE)" in readme and "(./LICENSES.md)" in readme, "the README must link both"
    page = LICENCE_PAGE.read_text(encoding="utf-8")
    assert "Copyright (C)" in page, "the copyright line belongs on the page: the licence text is untouched"


def test_the_licence_page_names_every_package_that_is_not_permissive():
    """The page and this file must not drift apart. The page is what a person reads before handing this over.

    The name has to be in one of the page's TABLE rows, not merely somewhere in the prose. Asking only that the
    name appears at all is too weak: `ebooklib` is discussed in a paragraph as well, so taking it out of the
    table changed nothing this test could see.
    """
    page = LICENCE_PAGE.read_text(encoding="utf-8")
    rows = [line for line in page.splitlines() if line.lstrip().startswith("|")]
    assert len(rows) > 10, f"only {len(rows)} table rows found in LICENSES.md, so this test proves nothing"
    missing = [name for name in KNOWN if not any(f"`{name}`" in row for row in rows)]
    assert not missing, (
        "LICENSES.md does not name: " + ", ".join(sorted(missing)) + ". Every copyleft dependency has to be "
        "explained on the page, not only listed in a test."
    )


# ---------------------------------------------------------------- what actually ships


def test_the_installer_carries_no_python():
    """The whole AGPL position rests on this. If Python ever ships, LICENSES.md becomes wrong in one step."""
    bundle = json.loads(TAURI_CONF.read_text(encoding="utf-8")).get("bundle", {})
    assert not bundle.get("externalBin"), (
        f"the installer now carries a program beside the app: {bundle.get('externalBin')}. If any of it is the "
        "Python import, the four AGPL packages ship with it and LICENSES.md is wrong."
    )
    for resource in bundle.get("resources") or []:
        assert not re.search(r"python|\.py\b|ingest", str(resource), re.IGNORECASE), (
            f"the installer now carries {resource!r}, which looks like the Python import. See LICENSES.md."
        )

    starts_python = []
    for path in sorted(RUST_SRC.rglob("*.rs")):
        body = path.read_text(encoding="utf-8")
        if re.search(r"""Command::new\(\s*["'][^"']*python""", body, re.IGNORECASE):
            starts_python.append(str(path.relative_to(REPO)).replace("\\", "/"))
    assert not starts_python, (
        "the app now starts Python: " + ", ".join(starts_python) + ". The AGPL packages would travel with it."
    )


def test_the_reader_of_the_rust_source_can_see_it():
    """The sight check for the test above: it must find the Rust files it claims to have read."""
    files = list(RUST_SRC.rglob("*.rs"))
    assert len(files) > 10, f"only {len(files)} Rust files found, so the test above proves nothing"
    assert sys.version_info >= (3, 13), "the repository is built on 3.13; the readers above assume it"
