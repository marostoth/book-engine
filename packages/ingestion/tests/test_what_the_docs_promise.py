"""The documents do not promise a vault watcher, because there is none (SI-05).

Three documents said this app watches the vault folder and re-indexes a book the moment it changes:

- `README.md` named a "vault watcher" in the repository tree.
- `AGENTS.md` named "`notify` crate for file watching" as a tool of the Rust backend.
- `ARCHITECTURE.md` drew "(File System Watcher / Async Read-Write)" between the vault and the app.

None of it was ever built. `notify` is in neither `Cargo.toml` nor `Cargo.lock`, and no code opens a watcher. The
same `**Tooling:**` line also named `sqlx`, which this backend has never used either: it uses `rusqlite`.

What the app really does is run `index_vault` twice: when the window opens, and again when the reader clicks
"Rescan library" in the book list (`updateSearch`, `src/lib/searchIndex.ts`; DS-13, SI-02). So a book imported or
edited while the app is open does show, after one click.

These tests hold both halves still. The first says no document may promise a watcher while no watcher exists. The
second says the documents must name the button that does the work instead. The third is the wider rule the first
two are one case of: the line whose whole job is to name the crates of the Rust backend may name only crates that
`Cargo.lock` really has.
"""

import json
import re

from conftest import REPO

#: The documents a reader or an agent takes as the description of this app.
DOCUMENTS = ("README.md", "AGENTS.md", "ARCHITECTURE.md")

#: Ways a document can promise that something watches the vault by itself. Matched without case.
WATCHER_WORDS = (
    "vault watcher",
    "file system watcher",
    "filesystem watcher",
    "file watcher",
    "file watching",
    "watches the vault",
    "watching the vault",
)

#: The crate that would do the watching. A document may name it only when the build has it.
WATCHER_CRATE = "notify"

#: A word just before the watcher words that turns a promise into a denial, such as "there is no file system
#: watcher". A document must be free to say that, because saying it is half of this fix.
DENIALS = ("no", "not", "never", "nothing", "without", "neither")

#: What the documents must name instead: the button that brings the book list and search up to date.
THE_BUTTON = "Rescan library"

CARGO_TOML = REPO / "apps" / "desktop" / "src-tauri" / "Cargo.toml"
CARGO_LOCK = REPO / "apps" / "desktop" / "src-tauri" / "Cargo.lock"

DESKTOP_PACKAGE_JSON = REPO / "apps" / "desktop" / "package.json"

#: Names on the TypeScript `**Tooling:**` line that are a way of working, not a package to install. Every
#: other name there must be a dependency of `apps/desktop/package.json`.
NOT_PACKAGES = {
    "react",  # named as "React 18+", the framework, whose package is `react`
    "prosemirror",  # named as "TipTap 3 / ProseMirror", which ships inside the TipTap packages
    "jsdom",  # the vitest environment, a dev dependency of vitest itself
}

#: An npm package name never ends in a file extension, so `apps/desktop/package.json` on that line is a
#: pointer to a file and not a package to install.
A_FILE_NAME = re.compile(r"\.[a-z]{1,5}$")

#: The shape of a crate name: lower case letters, digits, hyphens and underscores. A path (`vault/notes.rs`), a
#: module (`tokio::task::spawn_blocking`) and a file name (`Cargo.toml`) are all left out by it.
CRATE_NAME = re.compile(r"^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$")


def locked_crates() -> set[str]:
    """Every crate name in `Cargo.lock`, which is every crate the backend really builds with."""
    return set(re.findall(r'^name = "(.+)"$', CARGO_LOCK.read_text(encoding="utf-8"), flags=re.MULTILINE))


def rust_tooling_line() -> str:
    """The `**Tooling:**` line of the "Rust (Tauri v2 Backend)" section of `AGENTS.md`."""
    text = (REPO / "AGENTS.md").read_text(encoding="utf-8")
    section = re.search(r"^### Rust \(Tauri v2 Backend\)$(.*?)^### ", text, flags=re.MULTILINE | re.DOTALL)
    assert section, "AGENTS.md has no '### Rust (Tauri v2 Backend)' section"
    lines = [line for line in section.group(1).splitlines() if line.startswith("- **Tooling:**")]
    assert len(lines) == 1, f"the Rust section has {len(lines)} '**Tooling:**' lines; it needs exactly one"
    return lines[0]


def web_tooling_line() -> str:
    """The `**Tooling:**` line of the "TypeScript / Frontend" section of `AGENTS.md`."""
    text = (REPO / "AGENTS.md").read_text(encoding="utf-8")
    section = re.search(r"^### TypeScript / Frontend$(.*?)^(?:### |## )", text, flags=re.MULTILINE | re.DOTALL)
    assert section, "AGENTS.md has no '### TypeScript / Frontend' section"
    lines = [line for line in section.group(1).splitlines() if line.startswith("- **Tooling:**")]
    assert len(lines) == 1, f"the TypeScript section has {len(lines)} '**Tooling:**' lines; it needs exactly one"
    return lines[0]


def installed_packages() -> set[str]:
    """Every package `apps/desktop/package.json` asks for, which is every package the window really builds with."""
    manifest = json.loads(DESKTOP_PACKAGE_JSON.read_text(encoding="utf-8"))
    return set(manifest.get("dependencies", {})) | set(manifest.get("devDependencies", {}))


def promises_a_watcher(line: str) -> str | None:
    """The watcher words a line promises, or None when it holds none or denies them."""
    low = line.lower()
    for words in WATCHER_WORDS:
        for hit in re.finditer(re.escape(words), low):
            before = re.findall(r"[a-z]+", low[: hit.start()])[-3:]
            if not any(word in DENIALS for word in before):
                return words
    return None


def test_the_promise_reader_knows_a_promise_from_a_denial():
    """Without this, a reader that answers None to everything would pass the test below on any document at all."""
    assert promises_a_watcher("Rust backend (Tauri v2, rusqlite/FTS5, vault watcher)") == "vault watcher"
    assert promises_a_watcher("`notify` crate for file watching.") == "file watching"
    assert promises_a_watcher("(File System Watcher / Async Read-Write)") == "file system watcher"
    assert promises_a_watcher("A watcher watches the vault and re-indexes it.") == "watches the vault"

    assert promises_a_watcher("Nothing watches the vault.") is None
    assert promises_a_watcher("There is no file system watcher.") is None
    assert promises_a_watcher("The app has never had a file watcher.") is None
    assert promises_a_watcher("The index is built when the window opens.") is None


def test_no_document_promises_a_vault_watcher():
    """A document may say something watches the vault only when a watcher is really built."""
    has_watcher = WATCHER_CRATE in CARGO_TOML.read_text(encoding="utf-8")
    for name in DOCUMENTS:
        for number, line in enumerate((REPO / name).read_text(encoding="utf-8").splitlines(), start=1):
            words = promises_a_watcher(line)
            assert words is None or has_watcher, (
                f"{name}:{number} promises a watcher ({words!r}), and nothing watches the vault. "
                f"Either add the `{WATCHER_CRATE}` crate to {CARGO_TOML.name} and build one, or say what the "
                f'app really does: it indexes when the window opens and again on "{THE_BUTTON}" (SI-05).'
            )


def test_the_documents_say_how_the_search_index_is_brought_up_to_date():
    """Saying no watcher exists is not enough. The documents must name the button that does the work."""
    for name in DOCUMENTS:
        names_it = THE_BUTTON in (REPO / name).read_text(encoding="utf-8")
        assert names_it, (
            f'{name} never names "{THE_BUTTON}". A reader whose new book is missing from search has no way to '
            f"learn what to click, and an agent has no way to learn that the index is not kept up by itself (SI-05)."
        )


def test_the_rust_tooling_line_names_only_crates_the_build_really_has():
    """`sqlx` and `notify` sat on that line for a year, and the build had neither."""
    locked = locked_crates()
    assert "rusqlite" in locked, f"{CARGO_LOCK} was not read as expected: it holds {len(locked)} crate names"

    line = rust_tooling_line()
    named = [word for word in re.findall(r"`([^`]+)`", line) if CRATE_NAME.match(word)]
    assert named, f"the Rust '**Tooling:**' line names no crate at all: {line!r}"

    missing = [word for word in named if word not in locked]
    assert not missing, (
        f"the Rust '**Tooling:**' line of AGENTS.md names {missing}, which {CARGO_LOCK.name} does not have. "
        f"Name a crate there only after `apps/desktop/src-tauri/Cargo.toml` has it (SI-05)."
    )


def test_the_web_tooling_line_names_only_packages_the_window_really_has():
    """`@floating-ui/react` sat on that line, and on two other pages, after RD-09 uninstalled it (TL-07)."""
    installed = installed_packages()
    assert "react" in installed, f"{DESKTOP_PACKAGE_JSON} was not read as expected: it holds {len(installed)} names"

    assert A_FILE_NAME.search("apps/desktop/package.json"), "the file-name reader does not know a file"
    assert not A_FILE_NAME.search("@testing-library/react"), "the file-name reader called a package a file"

    line = web_tooling_line()
    named = [
        word
        for word in re.findall(r"`([^`]+)`", line)
        if word.lower() not in NOT_PACKAGES and not A_FILE_NAME.search(word)
    ]
    assert named, f"the TypeScript '**Tooling:**' line names no package at all: {line!r}"

    missing = [word for word in named if word not in installed]
    assert not missing, (
        f"the TypeScript '**Tooling:**' line of AGENTS.md names {missing}, which "
        f"apps/desktop/package.json does not install. Name a package there only after the manifest has it, "
        f"and keep an explanation in a bullet of its own so this line stays a list (TL-07)."
    )
