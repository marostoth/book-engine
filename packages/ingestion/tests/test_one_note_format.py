"""One note format, written in one place and read the same way in two languages (RD-08).

The notes pane writes a saved quote as `> "the sentence" (#^p-001)`, with an empty `- Reflection: ` line under it
for the reader's own thought. That format is written once, in `quoteBlock` (`lib/notesQuote.ts`), and read TWICE:

- `note_text_and_anchor` in `src-tauri/src/vault/notes.rs`, which answers inside the app;
- `noteLine` in `src/lib/noteLine.ts`, which answers in browser dev mode through `notesAggregator.ts`.

Before this, all three disagreed and nothing compared them. Rust showed `> "the sentence" (#`, TypeScript showed
`> "the sentence" (#)`, and both showed a bare `Reflection:` for the empty prompt. Each reader stripped only `-`,
`*` and the bullet character, so the blockquote marker stayed, and each cleaned up the leftover bracket its own
wrong way. Neither had a test at all, so neither could be caught by running anything.

A test inside one language can only ever check that language. This file is the only place the three can be compared,
so it holds the rule that they must agree: the same markers, the same quote pairs, the same label, the same written
lines and the same expected answers. A fix in Rust that is not mirrored in TypeScript fails here.
"""

import re

from conftest import REPO

NOTES_RS = REPO / "apps/desktop/src-tauri/src/vault/notes.rs"
NOTES_RS_TESTS = REPO / "apps/desktop/src-tauri/src/vault/notes_tests.rs"
NOTE_LINE_TS = REPO / "apps/desktop/src/lib/noteLine.ts"
NOTE_LINE_TS_TESTS = REPO / "apps/desktop/src/lib/noteLine.test.ts"
QUOTE_WRITER_TS = REPO / "apps/desktop/src/lib/notesQuote.ts"

#: The constants both readers must define the same way.
SHARED_IN_READERS = ("LINE_MARKERS", "QUOTE_PAIRS", "REFLECTION_LABEL")

#: The constants both test files must agree on, so neither is checking its own private idea of the format.
SHARED_IN_TESTS = ("WRITTEN_QUOTE_LINE", "WRITTEN_PROMPT_LINE", "QUOTE_SHOWS", "QUOTE_ANCHOR")


#: Every string or character literal of either language: a Rust raw string, then a double-quoted one, then a
#: single-quoted one. Each alternative allows the OTHER quote character inside it, which is the whole difficulty:
#: the lists being compared hold `'"'` and `"'"`, and one pattern that excluded both quote characters matched from
#: one literal's closing quote to the next one's opening quote, so it read the separators as the values. The first
#: version of this file did exactly that, and reported the markers as `[', ', '), (']`.
LITERAL = re.compile(
    r"""r\#"(?P<raw>.*?)"\#"""  # r#"..."#
    r"""|"(?P<double>(?:\\.|[^"\\])*)\""""  # "..."
    r"""|'(?P<single>(?:\\.|[^'\\])*)'""",  # '...'
    re.S,
)

#: The escapes both languages write, and the character each one means.
PLAIN_ESCAPES = {"\\n": "\n", "\\t": "\t", "\\r": "\r", "\\'": "'", '\\"': '"', "\\\\": "\\"}


def one_alphabet(text: str) -> str:
    r"""One literal's value, with Rust's `\u{2022}`, TypeScript's `\u2022` and both languages' escapes resolved.

    Without this, the same character reads as three different strings and two files that agree look as if they do
    not.
    """
    text = re.sub(r"\\u\{([0-9a-fA-F]+)\}", lambda m: chr(int(m.group(1), 16)), text)
    text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    for escape, means in PLAIN_ESCAPES.items():
        text = text.replace(escape, means)
    return text


def without_comments(source: str) -> str:
    """Rust or TypeScript source with its `/* ... */` blocks and its whole-line `//` comments taken out.

    This has to happen before any literal is read. An apostrophe in prose — "a chapter's notes" — opens what looks
    like a single-quoted literal and swallows everything up to the next apostrophe. That is why the first version of
    the case reader found nothing at all in a file full of cases: every one of them was inside a literal that started
    in a doc comment.

    Only whole-line `//` comments go, never a trailing one, because a `//` inside a string would take the rest of a
    real line with it.
    """
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return "\n".join(line for line in source.splitlines() if not line.lstrip().startswith("//"))


def literals_of(source: str) -> list[str]:
    """Every string or character literal in some Rust or TypeScript source, in order, values resolved."""
    return [
        one_alphabet(next(value for value in found.groups() if value is not None))
        for found in LITERAL.finditer(without_comments(source))
    ]


def characters_of(value: str) -> list[str]:
    """Every character a Rust `['a', 'b']` or TypeScript `["a", "b"]` list holds, in order."""
    return [found for found in literals_of(value) if len(found) == 1]


def constant_in(path, name: str) -> str:
    """The right-hand side of `const NAME ... = <value>;` in a Rust or TypeScript file."""
    text = path.read_text(encoding="utf-8")
    found = re.search(rf"\b(?:const|let)\s+{re.escape(name)}\b[^=]*=\s*(.+?);\s*$", text, re.M | re.S)
    assert found, f"{path.name} does not define {name}"
    return found.group(1).strip()


def string_constant_in(path, name: str) -> str:
    """The text of a string constant, with Rust's `r#"..."#` and either language's quotes taken off."""
    value = constant_in(path, name)
    for pattern in (r'^r#"(.*)"#$', r'^"(.*)"$', r"^'(.*)'$"):
        found = re.match(pattern, value, re.S)
        if found:
            return one_alphabet(found.group(1))
    raise AssertionError(f"{path.name}'s {name} is not a plain string constant: {value}")


def test_all_five_files_are_there():
    """Prove the reader can find what it compares, before any agreement it reports means anything."""
    for path in (NOTES_RS, NOTES_RS_TESTS, NOTE_LINE_TS, NOTE_LINE_TS_TESTS, QUOTE_WRITER_TS):
        assert path.is_file(), f"{path} is missing, so this test compares nothing"
        assert path.stat().st_size > 200, f"{path} is too small to hold what this test reads"


def test_the_reader_can_pull_a_constant_out_of_each_language():
    """The extraction itself must be shown to work, or an empty answer would read as agreement."""
    rust = characters_of(constant_in(NOTES_RS, "LINE_MARKERS"))
    typescript = characters_of(constant_in(NOTE_LINE_TS, "LINE_MARKERS"))

    assert len(rust) >= 4, f"the Rust marker list read as {rust}; the reader is broken, not the code"
    assert len(typescript) >= 4, f"the TypeScript marker list read as {typescript}; the reader is broken"
    assert ">" in rust and ">" in typescript, (
        "the blockquote marker is the whole point of RD-08, and neither list may be read without it"
    )


def test_both_readers_strip_the_same_markers():
    rust = characters_of(constant_in(NOTES_RS, "LINE_MARKERS"))
    typescript = characters_of(constant_in(NOTE_LINE_TS, "LINE_MARKERS"))

    assert rust == typescript, (
        f"the app strips {rust} and browser dev mode strips {typescript}. The same note would read differently in "
        f"the two, which is how RD-08 stayed hidden: each was wrong its own way."
    )


def test_both_readers_know_the_same_quote_pairs():
    rust = characters_of(constant_in(NOTES_RS, "QUOTE_PAIRS"))
    typescript = characters_of(constant_in(NOTE_LINE_TS, "QUOTE_PAIRS"))

    assert rust == typescript, f"Rust knows the pairs {rust}, TypeScript knows {typescript}"
    assert '"' in rust, "the straight double quote is what the pane itself writes around a quote"
    assert "\u201c" in rust, "a book's own curly quotes must come off too"


def test_both_readers_use_the_same_reflection_label():
    rust = string_constant_in(NOTES_RS, "REFLECTION_LABEL")
    typescript = string_constant_in(NOTE_LINE_TS, "REFLECTION_LABEL")

    assert rust == typescript == "reflection:", (
        f"Rust drops {rust!r} and TypeScript drops {typescript!r}; the pane writes `- Reflection: `"
    )


def test_both_test_files_hold_the_same_written_lines_and_answers():
    """Neither test file may check its own private idea of the format."""
    for name in SHARED_IN_TESTS:
        rust = string_constant_in(NOTES_RS_TESTS, name)
        typescript = string_constant_in(NOTE_LINE_TS_TESTS, name)
        assert rust == typescript, f"{name} is {rust!r} in the Rust tests and {typescript!r} in the TypeScript tests"


def test_the_writer_still_writes_the_line_both_readers_are_tested_on():
    """A reader tested on a format nothing writes is tested on nothing.

    `quoteBlock` builds the line from a template, so this reads the template and checks it produces the tested line
    for a known quote and anchor, rather than trusting that it does.
    """
    writer = QUOTE_WRITER_TS.read_text(encoding="utf-8")
    found = re.search(r"return\s+`([^`]+)`;", writer)
    assert found, "quoteBlock no longer returns one template string, so this test cannot read what it writes"

    built = found.group(1)
    built = built.replace("${quote.quote}", "Price is the great communicator.")
    built = built.replace("${anchor}", " (#^p-001)")
    built = built.replace("\\n", "\n")

    lines = [line for line in built.split("\n") if line.strip()]
    expected = [
        string_constant_in(NOTES_RS_TESTS, "WRITTEN_QUOTE_LINE"),
        string_constant_in(NOTES_RS_TESTS, "WRITTEN_PROMPT_LINE"),
    ]
    assert lines == expected, f"quoteBlock writes {lines}, and both readers are tested on {expected}"


def test_the_expected_answer_holds_no_markdown():
    """The whole finding in one line: what the drawer shows must not be Markdown."""
    shows = string_constant_in(NOTES_RS_TESTS, "QUOTE_SHOWS")

    for leftover in (">", "(", ")", "#", "^", '"'):
        assert leftover not in shows, f"the expected answer {shows!r} still holds {leftover!r}"
    assert shows, "an empty expected answer would pass every check above and prove nothing"


def test_every_note_line_one_test_file_tries_is_tried_by_the_other():
    """The cases must match, not only the constants.

    A case added on one side and not the other is how two readers drift apart while both look tested. Only literals
    that look like a note line are compared: a marker, an anchor, or a quote mark. Assertion messages differ between
    the two languages on purpose and are not cases.
    """

    def note_lines_in(path) -> set[str]:
        found = set()
        for value in literals_of(path.read_text(encoding="utf-8")):
            # A bare newline is the separator a test splits on, not a case. Everything else that is blank IS a case:
            # `""` and `"   "` are both in each file's "nothing to show" list.
            if len(value) >= 120 or value == "\n":
                continue
            looks_like_a_line = (
                value.strip().startswith((">", "-", "*", "•")) or "^p-" in value or value.strip() in {"", "   "}
            )
            if looks_like_a_line:
                found.add(value)
        return found

    rust = note_lines_in(NOTES_RS_TESTS)
    typescript = note_lines_in(NOTE_LINE_TS_TESTS)

    assert len(rust) > 10, f"only {len(rust)} note lines read out of the Rust tests; the reader is broken"
    assert len(typescript) > 10, f"only {len(typescript)} read out of the TypeScript tests; the reader is broken"

    only_rust = sorted(rust - typescript)
    only_typescript = sorted(typescript - rust)
    assert not only_rust and not only_typescript, (
        "these note lines are tried in one language and not the other:\n"
        + "".join(f"  only Rust      : {line!r}\n" for line in only_rust)
        + "".join(f"  only TypeScript: {line!r}\n" for line in only_typescript)
    )
