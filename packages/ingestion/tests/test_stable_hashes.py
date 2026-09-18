"""A hash this app saves must give the same answer for ever, and be named after the algorithm it uses (SI-06).

The index saves a hash of every chapter it wrote and skips that chapter next time when the text still gives the
same answer. That hash came from `std::collections::hash_map::DefaultHasher`, which promises nothing about its
output: the standard library may change it in any release. The day it changed, every chapter of every book would
be read and written again, in silence.

The function was also called `md5_hash`, and it was not MD5. A name that says an algorithm is a promise a reader
relies on without checking, so these tests hold both halves: no saved hash comes from a hasher with no guarantee,
and no function is named after an algorithm it does not use.

The Rust side pins the numbers themselves: `db/content_hash_tests.rs` asserts the published SHA-256 of "abc" and
of the empty string, so a change to the algorithm cannot pass quietly.
"""

import re

from conftest import REPO

RUST = REPO / "apps" / "desktop" / "src-tauri" / "src"

#: A hasher whose output the standard library may change between releases. Fine for a HashMap in memory, never for
#: a value that is written down and compared on a later run.
UNSTABLE = "DefaultHasher"

#: An algorithm a function name can promise, and what its body must hold to keep that promise.
ALGORITHMS = {
    "md5": ("Md5", "md5"),
    "sha1": ("Sha1", "sha1"),
    "sha256": ("Sha256", "sha256"),
    "sha512": ("Sha512", "sha512"),
    "blake3": ("blake3", "Blake3"),
    "crc32": ("crc32", "Crc32"),
    "xxhash": ("xxh", "Xxh", "XxHash"),
}


def rust_files() -> list:
    return sorted(RUST.rglob("*.rs"))


def without_comments(text: str) -> str:
    """The code of a Rust file, with its `//`, `///` and `//!` lines left out.

    A comment must stay free to name `DefaultHasher` in order to say why it is not used, and the fix for this very
    finding does exactly that.
    """
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("//"))


def functions_of(code: str) -> list[tuple[str, str]]:
    """Each `fn name` of some Rust code, with the text after its signature, up to the next `fn`.

    It is a rough cut, not a parser. It only has to reach far enough to see which hasher a function builds, and a
    cut that reaches too far can only make this test stricter, never quieter.

    The body starts after the opening brace, never at `fn`, because a function's own name is not proof of
    anything. The first version of this test started at `fn`, and `fn md5_hash` then "proved" it used md5 by
    holding the word md5 in its own name. It passed on exactly the fault it was written for.
    """
    starts = [(match.group(1), match.start()) for match in re.finditer(r"\bfn\s+(\w+)\s*[(<]", code)]
    found = []
    for index, (name, start) in enumerate(starts):
        end = starts[index + 1][1] if index + 1 < len(starts) else len(code)
        brace = code.find("{", start)
        body_starts = brace + 1 if 0 <= brace < end else start + len(name) + 3
        found.append((name, code[body_starts:end]))
    return found


def test_no_saved_hash_comes_from_a_hasher_with_no_guarantee():
    """`DefaultHasher` is documented as free to change. Nothing that is written down may depend on it."""
    guilty = []
    for path in rust_files():
        if UNSTABLE in without_comments(path.read_text(encoding="utf-8")):
            guilty.append(path.relative_to(REPO).as_posix())
    assert not guilty, (
        f"{guilty} use {UNSTABLE}. Its output may change in any Rust release, so a value saved with it is read "
        f"back as different text and the work is done again for nothing. Use SHA-256 (`sha2`), which this crate "
        f"already has (SI-06)."
    )


def test_a_hash_function_is_named_after_the_algorithm_it_really_uses():
    """`md5_hash` was not MD5 for as long as it existed, and a reader has no reason to check such a name."""
    broken = []
    for path in rust_files():
        code = without_comments(path.read_text(encoding="utf-8"))
        for name, body in functions_of(code):
            for algorithm, proof in ALGORITHMS.items():
                if algorithm in name.lower() and not any(word in body for word in proof):
                    broken.append(f"{path.relative_to(REPO).as_posix()}: fn {name}")
    assert not broken, (
        f"these functions are named after an algorithm their body does not use: {broken}. Rename the function or "
        f"use what it says (SI-06)."
    )


def test_the_index_saves_a_hash_that_is_pinned_by_a_published_number():
    """A rule against the wrong hasher is not enough; something has to hold the right one still."""
    tests = (RUST / "db" / "content_hash_tests.rs").read_text(encoding="utf-8")
    # The SHA-256 of "abc", from FIPS 180-4 appendix B.1.
    assert "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" in tests, (
        "no test pins the hash to a number published outside this repository, so a change to the algorithm could "
        "pass with every test still green (SI-06)"
    )
