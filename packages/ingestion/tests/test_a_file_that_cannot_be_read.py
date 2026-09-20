"""A file that cannot be read must never look like a file with nothing in it (DS-16).

`Path::exists` is `fs::metadata(..).is_ok()`. The standard library's own documentation says a permission error
answers `false`. So a file that is locked, offline or not allowed reads as "nothing saved yet", and the next save
writes over it. That is the same loss DS-04 was fixed for, reached through the stat call instead of the parse.

The app already knew this twice over: `book_is_in_vault` counts anything but `NotFound` as present (LC-02), and
`is_taken` says `try_exists().unwrap_or(true)` with the comment "or when that cannot be told" (DS-12). Every other
place asked the question the unsafe way.

This test is the one that names the places. `file_is_there` holds the policy, and its own tests prove it; this
test proves that the places which decide "is something saved here?" all ask through it. A probe that may stay is
named below with the reason it is safe, so a new one cannot arrive without a reader seeing it.
"""

import re

from conftest import REPO

RUST = REPO / "apps" / "desktop" / "src-tauri" / "src"

#: The one safe way to ask. Its own file is allowed to probe the disk, because that is where the fix lives.
SAFE = "file_is_there"

#: Both ways of asking the disk directly. `try_exists` is watched as well, because asking it and then saying
#: `unwrap_or(false)` is the same fault with more words.
PROBES = r"\.(try_)?exists\(\)"

#: `(file, function)` where a probe may stay, and why. Anything else must ask through `file_is_there`.
ALLOWED = {
    (
        "vault/file_is_there.rs",
        "file_is_there",
    ): "this is the one safe way itself: it is where the disk is asked and an answer that could not be got is "
    "turned into `true`",
    (
        "vault/syntopicon.rs",
        "ensure_syntopicon_dirs",
    ): "`create_dir_all` makes the folder when it is not there and says `Ok` when it is, so a wrong answer here "
    "changes nothing",
    (
        "db/fsrs_parser.rs",
        "parse_scenario_section",
    ): "the card is refused either way, because the anchor is then looked for in a chapter that cannot be read. "
    "Asking first only lets the message name the real trouble: the chapter, not the anchor",
}


def rust_files() -> list:
    """Every Rust source file of the app that is not a test file."""
    return sorted(path for path in RUST.rglob("*.rs") if not path.name.endswith("_tests.rs"))


def without_comments_and_tests(text: str) -> str:
    """Rust code with its `//`, `///` and `//!` lines dropped, and with an inline `mod tests` block cut off.

    A comment must stay free to name `.exists()` in order to say why it is not used, and the fix for this very
    finding does that. A test is free to ask whether a file it just wrote is there: it is not deciding whether the
    reader saved anything.
    """
    lines = []
    for line in text.splitlines():
        if line.lstrip().startswith("//"):
            continue
        if re.match(r"\s*mod tests\s*\{", line):
            break
        lines.append(line)
    return "\n".join(lines)


def function_at(code: str, position: int) -> str:
    """The name of the last `fn` that starts before `position`, or `<file>` when there is none.

    A rough cut, not a parser. A call that lands under the wrong name only makes this test louder, never quieter:
    the name it prints will not be in `ALLOWED`, and the failure names the file and the line either way.
    """
    starts = [match for match in re.finditer(r"\bfn\s+(\w+)\s*[(<]", code) if match.start() < position]
    return starts[-1].group(1) if starts else "<file>"


def unsafe_calls() -> list[tuple[str, str, str]]:
    """Every direct probe of the disk in the app's own code, as `(file, function, line)`."""
    found = []
    for path in rust_files():
        code = without_comments_and_tests(path.read_text(encoding="utf-8"))
        for match in re.finditer(PROBES, code):
            name = function_at(code, match.start())
            line = code[: match.start()].count("\n") + 1
            found.append((path.relative_to(RUST).as_posix(), name, str(line)))
    return found


def test_the_places_that_ask_whether_something_is_saved_ask_the_safe_way():
    """`.exists()` answers "no" for a file it was not allowed to look at, and the caller then writes over it."""
    guilty = [call for call in unsafe_calls() if (call[0], call[1]) not in ALLOWED]
    assert not guilty, (
        f"{guilty} ask the disk directly. `.exists()` answers `false` for a file that is only locked, offline or not "
        f"allowed. The caller then reads that as 'nothing saved yet' and the next save writes over the file. "
        f"Ask `vault::{SAFE}::{SAFE}` instead: it treats an answer it could not get as 'the file is there', "
        f"exactly as `is_taken` and `book_is_in_vault` already do (DS-16)."
    )


def test_every_allowed_exists_call_is_still_there():
    """An allowance with nothing behind it is a note that has stopped being true. It must not sit unread."""
    asked = {(file, name) for file, name, _ in unsafe_calls()}
    stale = sorted(str(key) for key in ALLOWED if key not in asked)
    assert not stale, (
        f"{stale} are allowed to ask the disk directly and no longer do. Take the allowance out of ALLOWED, so "
        f"the list stays a list of real decisions (DS-16)."
    )


def test_the_comment_stripper_keeps_code_and_drops_prose():
    """The stripper is what makes the count above mean anything, so it is checked on its own."""
    code = without_comments_and_tests(
        "/// A comment may name .exists() to say why it is not used.\n"
        "fn a() { path.exists() }\n"
        "// .exists()\n"
        "mod tests {\n"
        "    fn b() { written.exists() }\n"
        "}\n"
    )
    assert code.count(".exists()") == 1, code
    assert "fn a()" in code
    assert "fn b()" not in code, "an inline test module must be cut off"
