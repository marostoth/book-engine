"""A frontend test that fails must say so in seconds, not in minutes.

When `assert.equal` fails, `node:assert` builds a diff of both sides. When one side is a page element, that diff
walks into the objects React keeps on the element, and one failure took 187 seconds to report. `assert.ok(element
=== null, "...")` compares the same thing and prints only the message. `DipStream.test.tsx` says why where it does
this. The guard reads how a compare is written: an element held in a variable first is not seen.
"""

import re
from pathlib import Path

from test_frontend_stays_tidy import SRC, under_src, without_comments

#: The asserts that build a diff of both sides when they fail.
COMPARES = re.compile(r"\bassert\.(equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|notDeepEqual)\(")

#: An argument that is a page element: it ends in a call that finds one, or it is the focused element or the body.
ELEMENT = re.compile(
    r"\b((query|get|find)(All)?By\w+|querySelector(All)?|getElementById|closest)\([^()]*(\([^()]*\)[^()]*)*\)$"
    r"|\bdocument\.(activeElement|body)$"
)


def arguments(code: str, opening: int) -> list[str]:
    """The top-level arguments of the call whose `(` is at `opening`: commas inside brackets or quotes do not split."""
    found: list[str] = []
    part: list[str] = []
    depth = 0
    quote = ""
    index = opening + 1
    while index < len(code):
        character = code[index]
        if quote:
            part.append(character)
            if character == "\\" and index + 1 < len(code):
                part.append(code[index + 1])
                index += 2
                continue
            if character == quote:
                quote = ""
        elif character in "\"'`":
            quote = character
            part.append(character)
        elif character in "([{":
            depth += 1
            part.append(character)
        elif character in ")]}" and depth == 0:
            found.append("".join(part).strip())
            return found
        elif character in ")]}":
            depth -= 1
            part.append(character)
        elif character == "," and depth == 0:
            found.append("".join(part).strip())
            part = []
        else:
            part.append(character)
        index += 1
    return found


def element_compares(text: str) -> list[str]:
    """Every compare that has a page element as one of its two sides, as `line: the element`. Comments do not count."""
    code = without_comments(text)
    found = []
    for call in COMPARES.finditer(code):
        for side in arguments(code, call.end() - 1)[:2]:
            if ELEMENT.search(side):
                found.append(f"{code.count(chr(10), 0, call.start()) + 1}: {' '.join(side.split())}")
    return found


def frontend_tests() -> list[Path]:
    return sorted(path for path in SRC.rglob("*.test.ts*") if path.suffix in {".ts", ".tsx"})


def test_the_reader_sees_an_element_compare_it_is_shown():
    """The guard below is worth having only while it still finds what it looks for."""
    caught = element_compares(
        'assert.equal(screen.queryByText("Loading"), null, "still loading");\n'
        "assert.equal(\n"
        '  screen.queryByRole("button", { name: /Rescan/ }),\n'
        "  null,\n"
        '  "a message, with a comma"\n'
        ");\n"
        'assert.deepEqual(null, document.querySelector("img"));\n'
        'assert.notEqual(within(panel).getByText("x"), null);\n'
        "assert.equal(document.activeElement, opener);\n"
    )
    assert caught == [
        '1: screen.queryByText("Loading")',
        '2: screen.queryByRole("button", { name: /Rescan/ })',
        '7: document.querySelector("img")',
        '8: within(panel).getByText("x")',
        "9: document.activeElement",
    ]

    allowed = element_compares(
        'assert.ok(screen.queryByText("Loading") === null, "still loading");\n'
        'assert.equal(showing(screen.queryByText(/menu/)), false, "the menu is up");\n'
        'assert.equal(screen.getByTestId("wpm").textContent, "400");\n'
        'assert.equal(document.querySelectorAll("mark").length, 1);\n'
        "assert.equal(document.activeElement === opener, true);\n"
        '// assert.equal(screen.queryByText("Loading"), null);\n'
    )
    assert allowed == [], "a yes or no, a text, a count and a comment are not page elements"


def test_no_frontend_test_compares_a_page_element_with_assert_equal():
    """Write `assert.ok(element === null, "...")`. A failure then prints the message, not React's whole state."""
    tests = frontend_tests()
    assert len(tests) > 50, f"only {len(tests)} frontend test files found, so this test reads almost nothing"
    found = [
        f"{under_src(path)}:{place}" for path in tests for place in element_compares(path.read_text(encoding="utf-8"))
    ]
    assert not found, f"these compare a page element, and a failure takes minutes to report: {found}"
