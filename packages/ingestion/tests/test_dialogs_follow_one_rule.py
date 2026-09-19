"""Every dialog of the reader answers the keyboard the same way, and every button has a name (RD-07).

The app had 14 hand-built dialogs and 14 different answers to the keyboard:

* 8 of them ignored Escape: the chapter gate and the 7 windows you type into.
* 5 of the 6 that answered it listened on `window`, so one Escape closed every open dialog at once.
* Not one said `role="dialog"`, so a screen reader never told the reader a dialog had opened.
* Not one held the focus, so Tab walked out of the dialog and into the page behind it.
* 34 of its 224 buttons had no name at all, so a screen reader could only say "button".
* The selection menu opened on `mouseup` and nothing else, so a passage picked with the keyboard could not be
  highlighted, noted or quoted.

`hooks/useDialog.ts` is that one rule now. This file is the guard: a NEW dialog that does not use the rule fails here,
even though nobody wrote a test for it.

A reader that finds nothing looks the same as a repository with no faults, so every reader here prints and checks a
case whose answer is known. The button reader had two faults of its own before it was trusted:

1. `<button[^>]*>` stopped at the `>` of `onClick={() => ...}`, so the attributes ran into the body and the words of
   the className were read as the button's name. That hid the one nameless button of OmniSearchModal. It is the same
   `[^>]*` fault as LC-03.
2. Taking `{expr}` out whole made `{saving ? "Saving..." : "Save"}` look like an empty body, so 7 named buttons were
   reported as nameless.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SRC = REPO / "apps" / "desktop" / "src"

# The mark of a modal window: it covers the whole page.
OVERLAY = "fixed inset-0"
# The one rule every dialog uses, and the props it hands back for the panel.
THE_RULE = "useDialog"
PANEL_PROPS = "{...panelProps}"
# The hook's own file, which holds the rule instead of using it.
RULE_FILE = "hooks/useDialog.ts"
# A dialog must not listen for keys on the window: two open dialogs then both answer one Escape.
OWN_WINDOW_LISTENER = 'window.addEventListener("keydown"'


def sources() -> list[Path]:
    """Every component and hook of the app. Tests and the browser stand-in of `lib/api/dev/` are left out.

    The path to compare is the one under `src`, never the whole path: the repository itself lives in `C:/dev`, so a
    search for `/dev/` in the whole path threw away every file of the app and both readers went blind.
    """
    return sorted(
        path
        for path in [*SRC.rglob("*.tsx"), *SRC.rglob("*.ts")]
        if ".test." not in path.name and not path.relative_to(SRC).as_posix().startswith("lib/api/dev/")
    )


def dialogs() -> list[Path]:
    """Every file that draws a window over the whole page and can be open or shut."""
    found = []
    for path in sources():
        text = path.read_text(encoding="utf-8")
        if OVERLAY in text and "isOpen" in text:
            found.append(path)
    return found


# ----------------------------------------------------------------------------------------------- the button reader


def tag_end(text: str, start: int) -> int:
    """The index just past the `>` that closes the tag opening at `start`.

    A `>` inside a string or inside a `{...}` expression does not end the tag. `onClick={() => x}` holds one, and
    reading it as the end put the whole className into the button's body.
    """
    quote: str | None = None
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if quote is not None:
            if char == quote:
                quote = None
        elif char in "\"'`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        elif char == ">" and depth == 0:
            return index + 1
    return -1


def buttons(text: str) -> list[tuple[int, str, str]]:
    """Every `<button>` of a file, as (line, attributes, body). A self-closing button has an empty body."""
    found = []
    for opening in re.finditer(r"<button\b", text):
        end = tag_end(text, opening.start())
        if end < 0:
            continue
        attrs = text[opening.end() : end - 1]
        if attrs.rstrip().endswith("/"):
            body = ""
        else:
            close = text.find("</button>", end)
            body = text[end:close] if close >= 0 else ""
        found.append((text[: opening.start()].count("\n") + 1, attrs, body))
    return found


WORD = re.compile(r"[A-Za-z]{2,}")
EXPRESSION = re.compile(r"\{[^{}]*\}")
STRING_IN_EXPR = re.compile(r"""'([^'\\]*)'|"([^"\\]*)\"""")
NAMES_IT = ("aria-label", "title=", "aria-labelledby")


def keep_only_strings(match: re.Match[str]) -> str:
    """A {expr} is heard only as the strings it can print. `{saving ? "Saving" : "Save"}` can say either."""
    return " ".join(part for found in STRING_IN_EXPR.finditer(match.group(0)) for part in found.groups() if part)


def without_tags(body: str) -> str:
    """The body with every tag taken out, by the same scanner, so an arrow function cannot end a tag early."""
    kept = []
    index = 0
    while index < len(body):
        if body[index] == "<":
            end = tag_end(body, index)
            if end > 0:
                index = end
                continue
        kept.append(body[index])
        index += 1
    return "".join(kept)


def spoken_text(body: str) -> str:
    """The words of a button body. Tags and comments go; a {expr} keeps the strings it can print."""
    body = re.sub(r"\{/\*.*?\*/\}", "", body, flags=re.S)
    return " ".join(WORD.findall(EXPRESSION.sub(keep_only_strings, without_tags(body))))


def how_it_sounds(attrs: str, body: str) -> str:
    """One of: labelled, named, NAMELESS, unknown.

    `unknown` is the honest answer for a body like `{fam}` or `{citationPlace(file, anchor)}`: it does print words at
    run time and this reader cannot know which. Only a body with no words and no expression at all is NAMELESS.

    An expression inside a tag does not count. `<div className={knob} />` prints no words, and a switch built from one
    is as nameless as a bare icon.
    """
    if any(mark in attrs for mark in NAMES_IT):
        return "labelled"
    if spoken_text(body):
        return "named"
    outside_tags = without_tags(re.sub(r"\{/\*.*?\*/\}", "", body, flags=re.S))
    if EXPRESSION.search(outside_tags):
        return "unknown"
    return "NAMELESS"


def nameless_buttons() -> list[str]:
    """Every button of the app whose body holds only elements and punctuation, so it has no name at all."""
    found = []
    for path in sources():
        if path.suffix != ".tsx":
            continue
        text = path.read_text(encoding="utf-8")
        for line, attrs, body in buttons(text):
            if how_it_sounds(attrs, body) == "NAMELESS":
                found.append(f"{path.relative_to(SRC).as_posix()}:{line}")
    return found


# -------------------------------------------------------------------------------------------------------- the rule


def test_the_dialog_reader_finds_every_dialog_of_the_app():
    """A reader that finds no dialog would report a perfect app. 14 were counted by hand."""
    found = {path.relative_to(SRC).as_posix() for path in dialogs()}
    assert len(found) >= 14, f"the dialog reader found only {len(found)}: {sorted(found)}"
    for expected in (
        "components/GatekeeperModal.tsx",
        "components/NotesDrawer.tsx",
        "components/analytical/TermModal.tsx",
        "components/syntopicon/ControversyModal.tsx",
    ):
        assert expected in found, f"the dialog reader missed {expected}"


def test_every_dialog_uses_the_one_rule():
    """A dialog that answers the keyboard its own way is the fault RD-07 is about."""
    missing = [
        path.relative_to(SRC).as_posix() for path in dialogs() if THE_RULE not in path.read_text(encoding="utf-8")
    ]
    assert not missing, f"these dialogs do not use {THE_RULE} of {RULE_FILE}: {missing}"


def test_every_dialog_puts_the_rule_on_its_panel():
    """Calling the rule is not enough: the props it hands back must reach the panel, or nothing is wired."""
    missing = [
        path.relative_to(SRC).as_posix() for path in dialogs() if PANEL_PROPS not in path.read_text(encoding="utf-8")
    ]
    assert not missing, f"these dialogs never spread {PANEL_PROPS} onto their panel: {missing}"


def test_no_dialog_listens_for_keys_on_the_window():
    """5 dialogs did, so one Escape closed the notes drawer and the practice window together."""
    guilty = [
        path.relative_to(SRC).as_posix()
        for path in dialogs()
        if OWN_WINDOW_LISTENER in path.read_text(encoding="utf-8")
    ]
    assert not guilty, f"these dialogs still watch the window, so Escape reaches every open dialog: {guilty}"


def test_the_rule_itself_exists_and_says_what_it_gives_back():
    rule = (SRC / RULE_FILE).read_text(encoding="utf-8")
    for promise in ('role: "dialog"', "aria-modal", "Escape", "Tab"):
        assert promise in rule, f"{RULE_FILE} never mentions {promise}"


# ------------------------------------------------------------------------------------------------ button names


def test_no_button_of_the_app_is_nameless():
    """34 of the app's 224 buttons had no name at all: a screen reader could only say "button"."""
    found = nameless_buttons()
    assert not found, f"{len(found)} buttons have no name a screen reader can say: {found}"


def test_the_button_reader_can_see_a_nameless_button():
    """A blind reader reports a perfect app. These answers are all known."""
    assert how_it_sounds("", '<X className="w-4" />') == "NAMELESS"
    assert how_it_sounds("", "\u2715") == "NAMELESS"
    assert how_it_sounds("", "Close") == "named"
    assert how_it_sounds(' aria-label="Close"', '<X className="w-4" />') == "labelled"
    # A switch whose whole body is the knob that slides. The expression sits inside the tag, so it prints no words.
    assert how_it_sounds(' role="switch"', '<div className={`knob ${on ? "x" : "y"}`} />') == "NAMELESS"
    # A label a variable prints, with brackets of its own around part of it. The brackets are not the name.
    assert how_it_sounds("", "<span>{level}</span> (<span>{title}</span>)") == "unknown"


def test_the_button_reader_is_not_fooled_by_an_arrow_function():
    """`onClick={() => a()}` holds a `>`. Reading it as the end of the tag hid a nameless button of the search window."""
    _, attrs, body = buttons('<button onClick={() => a("")} className="rounded-full text-muted"><X /></button>')[0]
    assert "className" in attrs, "the attributes stopped at the arrow function"
    assert how_it_sounds(attrs, body) == "NAMELESS", "the words of the className were read as the button's name"


def test_the_button_reader_hears_a_label_a_condition_chooses():
    """`{saving ? "Saving..." : "Save"}` names the button either way. Reading it as empty gave 7 false faults."""
    _, attrs, body = buttons('<button type="submit">{saving ? "Saving..." : "Save Inquiry"}</button>')[0]
    assert how_it_sounds(attrs, body) == "named"
    _, attrs, body = buttons("<button onClick={x}>{fam}</button>")[0]
    assert how_it_sounds(attrs, body) == "unknown", "a name this reader cannot work out must not be called a fault"


def test_the_button_reader_reads_every_button_of_the_app():
    """Over two hundred buttons were counted by hand. A reader that finds ten is broken."""
    total = sum(len(buttons(path.read_text(encoding="utf-8"))) for path in sources() if path.suffix == ".tsx")
    assert total >= 200, f"the button reader found only {total} buttons in the whole app"


# --------------------------------------------------------------------------------- highlighting with the keyboard


SELECTION = SRC / "components" / "reader" / "useReaderSelection.ts"


def test_the_selection_menu_opens_for_the_keyboard_too():
    """It opened on `mouseup` and nothing else, so a passage picked with Shift and the arrows could not be used.

    The keyboard is watched on the document, not on the chapter element. A chapter is not something you type in, so
    nothing inside it holds the focus, and a key never passes through it.
    """
    text = SELECTION.read_text(encoding="utf-8")
    assert "handleMouseUp" in text, "the selection reader cannot see the mouse handler it is comparing against"
    assert 'document.addEventListener("keyup"' in text, "nothing watches the keyboard for a change of selection"
    assert "MOVES_THE_CARET" in text, "nothing says which keys can change what is selected"


def test_the_keyboard_selection_is_held_to_the_chapter():
    """The keyboard is watched on the whole document, so a passage picked in a dialog must not raise this menu."""
    text = SELECTION.read_text(encoding="utf-8")
    assert "mustHoldChapter" in text, "the keyboard path never checks that the selection holds part of the chapter"


def test_the_reader_hands_the_menu_a_way_to_close():
    """A handler nothing calls is the same as no handler."""
    reader = (SRC / "components" / "Reader.tsx").read_text(encoding="utf-8")
    assert "onMouseUp={handleMouseUp}" in reader, "the reader lost its mouse selection, so this test proves nothing"
    assert "onDismiss={closeSelectionMenu}" in reader, "Escape has nothing to call on the selection menu"


def test_the_selection_menu_names_itself_and_can_be_left():
    """A menu a screen reader cannot name, and that Escape cannot close, is a trap."""
    menu = (SRC / "components" / "SelectionMenu.tsx").read_text(encoding="utf-8")
    assert "aria-label" in menu, "the selection menu has no name"
    assert "onDismiss" in menu, "nothing closes the selection menu from the keyboard"
    # The call, not the name: the import line keeps the name even when nothing calls it.
    assert "aDialogIsOpen()" in menu, "the menu answers the keyboard even while a dialog covers the page"
