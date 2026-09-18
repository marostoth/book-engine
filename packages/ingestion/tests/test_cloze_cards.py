"""Cloze (fill-in) cards leave out a real term, never show the answer or marks, and cover every chapter (LE-07).

The old rules also left out small words ("It is by", from "by means of"), bare numbers and labels ("9-1"), and terms
that the rest of the sentence still showed. They made cards from tables and HTML, showed Markdown and footnote marks,
and made no card for a chapter without a bold term or a definition.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest
from ingest.salience import format_practice_deck_markdown, generate_chapter_practice_cards, split_sentences

REPO = Path(__file__).resolve().parents[3]
BLANK = re.compile(r"\{\{c1::(.*?)\}\}")
# The small words of the sentences below that an old card left out.
SMALL_WORDS = {"a", "by", "for", "if", "is", "it", "no", "the", "this", "while"}


def chapter(paragraphs: list[str]) -> str:
    """Chapter Markdown as the importer writes it: paragraphs with anchors, a blank line between them."""
    return "\n\n".join(f"{text} ^p-{number:03d}" for number, text in enumerate(paragraphs, start=1))


def cards_of(paragraphs: list[str]):
    return generate_chapter_practice_cards("ch-01", chapter(paragraphs), min_items=5, max_items=8)


def outside_blank(card) -> str:
    return BLANK.sub(" ", card.cloze_text)


@pytest.mark.parametrize(
    "sentence",
    [
        "It is by means of water transport that a market grows beyond its own town.",
        "This means that a miller must store his grain in dry lofts.",
        "While this is by no means a rule, most mills stand beside a river.",
        "A **For** sign hangs over the door of every mill in the town.",
    ],
)
def test_an_answer_of_only_small_words_makes_no_card(sentence: str):
    for card in cards_of([sentence]):
        words = re.findall(r"[A-Za-z]+", card.answer_key)
        assert any(word.lower() not in SMALL_WORDS for word in words), f"the answer is only small words: {card}"


def test_an_answer_neither_starts_nor_ends_with_a_small_word():
    cards = cards_of(
        [
            "A long voyage by sea means a lower price for the grain that the ship carries.",
            "If the harvest is considered poor, the price of flour rises in every town.",
        ]
    )

    for card in cards:
        words = re.findall(r"[A-Za-z]+", card.answer_key)
        assert words[0].lower() not in SMALL_WORDS and words[-1].lower() not in SMALL_WORDS, card


def test_a_number_or_a_label_is_no_answer():
    cards = cards_of(
        [
            "FIGURE **9-1** shows the grain trade of a river town in one year.",
            "Prices rose sharply in **1776** after the harvest failed in the north.",
            "See **Table 13.2** for the price of flour in each town on the river.",
        ]
    )

    assert [card.answer_key for card in cards] == []


def test_a_leading_article_stays_outside_the_blank():
    cards = cards_of(["The division of labour is defined as the split of work into separate tasks."])

    assert [card.cloze_text for card in cards] == [
        "The {{c1::division of labour}} is defined as the split of work into separate tasks."
    ]


def test_the_prompt_shows_the_answer_only_as_its_one_blank():
    cards = cards_of(
        [
            "The **grain trade** grew fast, and the grain trade soon reached every town on the river.",
            "A **mill** grinds the grain of a town, and a **mill** also stores its flour for winter.",
            "A **flour merchant** carries sacks of flour from the mills to the bakers of the town.",
        ]
    )

    assert cards, "the merchant sentence makes a card"
    for card in cards:
        assert len(BLANK.findall(card.cloze_text)) == 1, card.cloze_text
        assert not re.search(r"(?i)(?<!\w)" + re.escape(card.answer_key) + r"(?!\w)", outside_blank(card)), card


def test_the_prompt_shows_no_markdown_or_footnote_marks():
    cards = cards_of(
        [
            "In a river town, the **grain market** is defined as the place where _millers_ and farmers meet.[^1]",
        ]
    )

    assert [card.cloze_text for card in cards] == [
        "In a river town, the {{c1::grain market}} is defined as the place where millers and farmers meet."
    ]
    assert cards[0].exact_source == (
        "In a river town, the **grain market** is defined as the place where _millers_ and farmers meet.[^1]"
    ), "the exact source keeps the text of the book"


@pytest.mark.parametrize(
    "block",
    [
        "|**Town**|**Mills**|\n|---|---|\n|Riverton|4|",
        "A **flour merchant** buys from the mills<br>and sells to the bakers.",
        "Bakers buy **flour in bulk** to pay less for each sack.<sup>3</sup>",
        "See the [**grain map**](maps/grain.png) of the river towns for the routes.",
        "THE **GRAIN TRADE** OF THE RIVER TOWNS.",
        "The **grain trade** of the river towns and their mills",
        "The {**grain trade**} of the river towns grew every year.",
        "The **grain trade** of the river towns grew by \ufffd every year.",
    ],
)
def test_a_table_html_a_link_a_heading_or_a_cut_sentence_makes_no_card(block: str):
    assert cards_of([block]) == []


def test_a_bold_answer_is_the_text_of_one_pair_of_bold_marks():
    cards = cards_of(["The **4** kinds of mill, **wind** and **water**, grind the grain of the town."])

    assert cards, "the sentence makes a card"
    for card in cards:
        assert f"**{card.answer_key}**" in card.exact_source, card


REPEATED_TERM_CHAPTER = [
    "Every spring the river trade brings new farmers to the town.",
    "Boats carry grain downstream, and carts carry it to the flour mill.",
    "Merchants say that the river trade pays better than the road trade.",
    "The flour mill grinds grain for every baker in the valley.",
    "When the water is low, the river trade stops for many weeks.",
]


def test_a_chapter_without_a_marked_term_gets_one_card_for_a_repeated_term():
    cards = cards_of(REPEATED_TERM_CHAPTER)

    assert [card.answer_key for card in cards] == ["river trade"]
    card = cards[0]
    assert card.cloze_text.count("{{c1::river trade}}") == 1
    assert card.exact_source in REPEATED_TERM_CHAPTER
    assert card.anchor_id == f"^p-{REPEATED_TERM_CHAPTER.index(card.exact_source) + 1:03d}"


def test_a_term_that_a_line_break_splits_gives_way_to_the_next_term():
    marked = cards_of(["The **river\ntrade** grows, and the **flour mill** grinds more grain for the town."])
    repeated = cards_of(
        [
            "Every spring the river\ntrade brings new farmers to the flour mill.",
            "Merchants say that the river\ntrade pays better than the road.",
            "When the water is low, the river\ntrade stops, and the flour mill waits.",
        ]
    )

    assert [card.answer_key for card in marked] == ["flour mill"]
    assert [card.answer_key for card in repeated] == ["flour mill"]


def test_one_word_alone_is_no_repeated_term():
    cards = cards_of(
        [
            "Grain comes to the town by boat in the autumn.",
            "The miller weighs the grain before he grinds it.",
            "Bakers pay for grain with the bread that they sell.",
        ]
    )

    assert cards == []


def test_every_card_is_text_of_the_chapter_byte_for_byte():
    paragraphs = [
        "Farmers  bring their grain to the **flour mill** in the autumn of each year.",
        "The **river boat**\ncarries flour to the towns that have no mill of their own.",
    ]
    text = chapter(paragraphs)
    cards = generate_chapter_practice_cards("ch-01", text)

    assert sorted(card.answer_key for card in cards) == ["flour mill", "river boat"]
    for card in cards:
        assert card.answer_key in text
        assert card.exact_source in text.replace("\n", " "), "a line break inside a paragraph counts as a space"
        assert "\n" not in card.exact_source and "\n" not in card.cloze_text
    assert "Farmers  bring" in cards[[card.answer_key for card in cards].index("flour mill")].exact_source


def test_exact_sentences_split_like_split_sentences():
    text = "Mills grind  grain. Bakers use flour, e.g. for bread and cakes.  The town eats well!"

    sentences = importlib.import_module("ingest.cloze").exact_sentences(text)

    assert [" ".join(sentence.split()) for sentence in sentences] == split_sentences(text)
    assert all(sentence in text for sentence in sentences)
    assert sentences[0] == "Mills grind  grain."


# --- The audit (.agent/skills/audit-practice.py) ----------------------------------------------------------------


def audit_module():
    spec = importlib.util.spec_from_file_location("audit_practice", REPO / ".agent" / "skills" / "audit-practice.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


AUDIT_CHAPTER = [
    "The division of labour is defined as the split of work into separate tasks.",
    "It is by means of water transport that a market grows beyond its own town.",
    "In a river town, the **grain market** is defined as the place where _millers_ and farmers meet.[^1]",
    "The **grain trade** grew fast, and the grain trade soon reached every town on the river.",
    "Farmers  bring their grain to the **flour mill** in the autumn of each year.",
]


def cloze_card(prompt: str, answer: str, source: str) -> str:
    """A cloze card in the deck format."""
    return (
        "### card-ch-01-001\n"
        "- **Chapter:** ch-01\n"
        "- **Anchor:** ^p-001\n"
        f"- **Cloze:** {prompt}\n"
        f"- **Answer Key:** `{answer}`\n"
        f"- **Exact Source:** {source}\n"
    )


def audit(tmp_path: Path, deck: str):
    books = tmp_path / "vault" / "books"
    (books / "b1").mkdir(parents=True)
    (books / "b1" / "ch-01.md").write_text(chapter(AUDIT_CHAPTER), encoding="utf-8")
    notes = tmp_path / "vault" / "notes" / "b1"
    notes.mkdir(parents=True)
    (notes / "practice-deck.md").write_text(deck, encoding="utf-8")
    return audit_module().audit_book_practice_deck(notes / "practice-deck.md", books)


def test_the_audit_accepts_the_cloze_cards_that_the_importer_writes(tmp_path: Path):
    cards = generate_chapter_practice_cards("ch-01", chapter(AUDIT_CHAPTER))
    result = audit(tmp_path, format_practice_deck_markdown("Mill Town", cards, []))

    assert (result.mismatches, result.errors) == (0, [])
    assert result.cloze_count == len(cards) == 3, "no card for 'It is by' and for the grain trade shown twice"


@pytest.mark.parametrize(
    "prompt, answer, source",
    [
        (
            "{{c1::It is by}} means of water transport that a market grows beyond its own town.",
            "It is by",
            AUDIT_CHAPTER[1],
        ),
        (
            "{{c1::The division of labour}} is defined as the split of work into separate tasks.",
            "The division of labour",
            AUDIT_CHAPTER[0],
        ),
    ],
)
def test_the_audit_refuses_an_answer_that_is_no_term(tmp_path: Path, prompt: str, answer: str, source: str):
    result = audit(tmp_path, cloze_card(prompt, answer, source))

    assert result.mismatches == 1, result.errors
    assert any(f"The answer '{answer}' is" in error for error in result.errors), result.errors


def test_the_audit_refuses_a_prompt_that_shows_marks(tmp_path: Path):
    prompt = "In a river town, the {{c1::grain market}} is defined as the place where _millers_ and farmers meet.[^1]"
    result = audit(tmp_path, cloze_card(prompt, "grain market", AUDIT_CHAPTER[2]))

    assert result.mismatches == 1, result.errors
    assert any("shows Markdown, footnote, table or HTML marks" in error for error in result.errors), result.errors


def test_the_audit_refuses_a_prompt_that_shows_the_answer_outside_the_blank(tmp_path: Path):
    prompt = "The {{c1::grain trade}} grew fast, and the grain trade soon reached every town on the river."
    result = audit(tmp_path, cloze_card(prompt, "grain trade", AUDIT_CHAPTER[3]))

    assert result.mismatches == 1, result.errors
    assert any("shows the answer outside the blank" in error for error in result.errors), result.errors


def test_the_audit_refuses_a_prompt_with_two_blanks(tmp_path: Path):
    prompt = "The {{c1::grain trade}} grew fast, and the {{c1::grain trade}} soon reached every town on the river."
    result = audit(tmp_path, cloze_card(prompt, "grain trade", AUDIT_CHAPTER[3]))

    assert result.mismatches == 1, result.errors
    assert any("must have one blank" in error for error in result.errors), result.errors


def test_the_audit_refuses_an_exact_source_that_matches_only_when_spaces_are_ignored(tmp_path: Path):
    source = "Farmers bring their grain to the **flour mill** in the autumn of each year."
    prompt = "Farmers bring their grain to the {{c1::flour mill}} in the autumn of each year."
    result = audit(tmp_path, cloze_card(prompt, "flour mill", source))

    assert result.mismatches == 1, result.errors
    assert any("is not text of ch-01.md#^p-001 byte for byte" in error for error in result.errors), result.errors


def test_the_audit_refuses_a_prompt_that_is_not_its_exact_source(tmp_path: Path):
    prompt = "Farmers sell their grain to the {{c1::flour mill}} in the autumn of each year."
    result = audit(tmp_path, cloze_card(prompt, "flour mill", AUDIT_CHAPTER[4]))

    assert result.mismatches == 1, result.errors
    assert any("does not show its exact source" in error for error in result.errors), result.errors


def test_the_audit_and_the_importer_use_the_same_cloze_rules():
    module = audit_module()
    cloze = importlib.import_module("ingest.cloze")

    assert module.STOPWORDS == cloze.STOPWORDS
    assert (module.MIN_ANSWER_CHARS, module.MAX_ANSWER_CHARS) == (cloze.MIN_ANSWER_CHARS, cloze.MAX_ANSWER_CHARS)
    for answer in [
        "grain trade",
        "It is by",
        "The mill",
        "9-1",
        "Table 13.2",
        "mill,",
        "grain  trade",
        "_mill_",
        "M period",
    ]:
        assert module.answer_problem(answer) == cloze.answer_problem(answer), answer
    text = "A **mill**[^2] grinds\ngrain &amp; stores  flour."
    assert module.shown_text(text) == cloze.shown_text(text)
    assert module.exact_chapter_text("a\r\nb\n\nc") == cloze.exact_text("a\r\nb\n\nc") == "a b\n\nc"
