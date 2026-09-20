"""The drop-cap repair may not invent a word (CQ-08).

A designer draws the first letter of a chapter large, across two or three lines. A text reader hands that letter
back on its own, and `heal_drop_caps` puts it where it belongs. It used to put it there on a guess, and the guesses
reached the reader: **52 paragraph starts in one real book carry a word that book does not contain**, on 17
different capitals — `A` 19 times, `P` 7, `F` 6, `N` 3, and eleven more.

**This function had no test of any kind.** That is why this file exists, and why it starts with the damage rather
than with the repair.

The rule now: a letter goes back only when the chapter's own words prove which letter it was. When they do not, the
text is left exactly as it came. A drop cap left broken is one wrong word. A drop cap invented is two, because the
capital has to be taken from somewhere.
"""

from __future__ import annotations

import ast

from conftest import REPO
from ingest.pdf_sanitizer import heal_drop_caps

SANITIZER = REPO / "packages" / "ingestion" / "ingest" / "pdf_sanitizer.py"

#: The names the old rule carried a list for, each with its first letter already taken off, which is the shape the
#: code held them in. A rule that needs a list of names to spare is a rule saying it eats the ones not on the list.
SPARED_STEMS = ("exas", "ondon", "ork", "merica", "ngland", "rance", "alifornia")


# ---------------------------------------------------------------------------
# The damage that was found in the real book
# ---------------------------------------------------------------------------


def test_a_stray_capital_is_not_glued_to_the_word_the():
    """The book writes `the` 5,682 times and has never written `Cthe`. It holds four of these."""
    chapter = (
        "C the market moved against him that morning.\n\n"
        "The market is the only thing that matters. The market does not care who is watching. "
        "The trader watches the market, and the market watches back.\n"
    )

    healed = heal_drop_caps(chapter)

    assert "Cthe" not in healed, "a word the book has never written was put into it"
    assert healed.startswith("C the market moved against him"), "the line is left exactly as it came"


def test_the_word_a_at_a_paragraph_start_is_left_alone():
    """`A` opened 19 of the 52 damaged paragraphs. It is a word, not a drop cap."""
    chapter = (
        "A long time ago the market was quiet.\n\n"
        "A trader waits for a long move. The long move is what pays, and a long wait is the price of it.\n"
    )

    healed = heal_drop_caps(chapter)

    assert "Along" not in healed
    assert healed.startswith("A long time ago")


def test_the_word_i_at_a_paragraph_start_is_left_alone():
    chapter = (
        "I think the trade is a good one.\n\n"
        "I think about the market all day. You think about the market. We all think about the market.\n"
    )

    healed = heal_drop_caps(chapter)

    assert "Ithink" not in healed
    assert healed.startswith("I think the trade")


# ---------------------------------------------------------------------------
# The repair still works where the chapter proves it
# ---------------------------------------------------------------------------


def test_a_drop_cap_a_space_from_its_word_is_still_put_back():
    """`T he market` is a real drop cap: the chapter writes `the` often and `he` almost never."""
    chapter = (
        "T he market opens at nine.\n\n"
        "The market is the place. The market is the price. The market is the point of all of it.\n"
    )

    healed = heal_drop_caps(chapter)

    assert healed.startswith("The market opens at nine.")


def test_a_drop_cap_alone_on_its_own_line_is_still_put_back():
    chapter = (
        "M\n\narkets move on news.\n\n"
        "Markets are not kind. Markets are not cruel. Markets are only markets, and they owe nobody.\n"
    )

    healed = heal_drop_caps(chapter)

    assert healed.startswith("Markets move on news.")
    assert "M\n\narkets" not in healed, "the letter is still sitting on a line of its own"


def test_a_displaced_drop_cap_moves_back_when_both_words_are_proved():
    """The shape the third rule was written for: the capital landed on a word in line two.

    Two words are wrong here, so two have to be proved. The chapter says `Jim` and never `im`, and it says
    `interest` and never `Jinterest`.
    """
    chapter = (
        "im Kelvin had an Jinterest in the tape from his first day on the floor.\n\n"
        "Jim Kelvin traded for thirty years. Jim Kelvin never once raised his voice. "
        "The interest never left him, and interest is what keeps a trader at the screen.\n"
    )

    healed = heal_drop_caps(chapter)

    assert healed.startswith("Jim Kelvin had an interest in the tape")
    assert "Jinterest" not in healed


# ---------------------------------------------------------------------------
# The second scar: the word the capital was taken from
# ---------------------------------------------------------------------------


def test_a_place_name_keeps_its_capital_with_no_list_to_protect_it():
    """`a Texas broker` survives because `exas` is not a word this chapter uses, not because of a list."""
    chapter = (
        "rading floors were loud in those days, and a Texas broker shouted the loudest of them all.\n\n"
        "Trading is quieter now. Trading is screens and silence. Trading has lost its voice.\n"
    )

    healed = heal_drop_caps(chapter)

    assert "a Texas broker" in healed, "the capital was taken off a place name"
    assert healed.startswith("rading floors"), (
        "the paragraph is left broken on purpose. One wrong word is better than two, and mending this one "
        "would have cost Texas its T."
    )


def test_a_capital_is_not_taken_off_a_word_the_chapter_uses():
    """`ages` is a word and `pages` is a word, so the `P` of `Pages` is not free to take."""
    chapter = (
        "rinciples are what the book teaches, and of Pages there are a great many.\n\n"
        "Principles are simple to say. Principles are hard to hold. "
        "The pages are thin, the pages are many, and the ages have not changed a line of them.\n"
    )

    healed = heal_drop_caps(chapter)

    assert "of Pages there are a great many" in healed
    assert "of ages there" not in healed
    assert not healed.startswith("Principles are what"), "the P was moved off a word the chapter writes"


# ---------------------------------------------------------------------------
# Leaving the text alone
# ---------------------------------------------------------------------------


def test_a_chapter_with_no_drop_cap_comes_back_byte_for_byte():
    """The control. Without this, a repair that changed nothing and a repair that changed everything both pass."""
    chapter = (
        "# The Opening\n\n"
        "The market opened quietly. The market closed quietly. Nothing at all happened in between.\n\n"
        "A second paragraph says the same thing again, and it says it in very much the same words.\n"
    )

    assert heal_drop_caps(chapter) == chapter


def test_running_the_repair_twice_changes_nothing_more():
    chapter = (
        "T he market opens at nine.\n\n"
        "The market is the place. The market is the price. The market is the point of all of it.\n"
    )

    once = heal_drop_caps(chapter)

    assert heal_drop_caps(once) == once


# ---------------------------------------------------------------------------
# The list of names may not come back
# ---------------------------------------------------------------------------


def strings_outside_the_prose(source: str) -> set[str]:
    """Every string literal in Python source that is not a docstring.

    The docstrings have to go before anything is read. The repair's own docstring names all seven places the old
    list held, because that is what it is explaining, and a plain search would find them there and call the list
    alive. A guard that reads prose answers the wrong question.
    """
    tree = ast.parse(source)
    prose = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Module | ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
        and node.body
        and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, ast.Constant)
        and isinstance(node.body[0].value.value, str)
    }
    return {
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in prose
    }


def test_the_repair_keeps_no_list_of_names_to_spare():
    """The old rule spared seven place names by name. The 52 words it damaged were the ones not on the list."""
    kept = sorted(stem for stem in SPARED_STEMS if stem in strings_outside_the_prose(SANITIZER.read_text("utf-8")))

    assert not kept, (
        f"the repair is protecting these by name again: {kept}. A list of names cannot grow fast enough to hold "
        "every proper noun in a book. The chapter's own words are the guard, not a list."
    )


def test_the_guard_above_can_tell_prose_from_code():
    """The control for it. A guard that always passes is not a guard (see test_one_check.py)."""
    pretend = 'def f():\n    """A docstring naming exas and ondon."""\n    spare = ("ork",)\n    return spare\n'

    found = strings_outside_the_prose(pretend)

    assert "ork" in found, "a real list was missed"
    assert "exas" not in found and "ondon" not in found, "the docstring was read as code"
