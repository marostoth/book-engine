"""Quiz (scenario) cards ask which sentence comes right after a passage, and the audit checks every option (LE-06).

The old cards asked for "the analytically valid conclusion", but every wrong option was a true sentence of the same
chapter, the right option was never D, and a wrong option could be a near-copy of the right one.
"""

from __future__ import annotations

import importlib.util
import re
from difflib import SequenceMatcher
from pathlib import Path

import pytest
from ingest import scenarios
from ingest.salience import format_practice_deck_markdown, split_sentences
from ingest.scenarios import generate_chapter_scenario_cards

REPO = Path(__file__).resolve().parents[3]
QUESTION = "Which sentence comes right after this passage in the book?"
RATIONALE = 'Right after this passage, the book says: "'

MILL_TOWN = [
    "A mill in a river town needs a steady flow of grain from the farms around it. "
    "The miller buys grain in autumn and stores it in dry lofts. "
    "Therefore the price of flour stays level through the winter months.",
    "Farmers who live far from the river pay more to carry their grain to the mill. "
    "Carts and roads cost money, and the cost grows with every mile. "
    "Distant farms therefore keep a smaller share of the price of their grain.",
    "Bakers in the town buy flour every week and sell bread every morning. "
    "A baker who buys in bulk pays less for each sack of flour. "
    "The largest bakeries can therefore sell a loaf for less than the small ones.",
    "When a dry summer ruins the harvest, the miller has less grain to grind. "
    "Buyers then compete for the flour that is left in the lofts. "
    "The price of bread rises until fewer people can buy it.",
    "Some towns build a second mill to break the power of the first. "
    "Two mills must compete for the same grain and the same bakers. "
    "The farmers then get a better price, and bread becomes cheaper.",
    "Merchants who carry flour by boat can reach towns that have no mill. "
    "Water transport costs far less than a cart on a muddy road. "
    "River trade therefore spreads the benefits of one mill to many towns.",
]


def chapter(paragraphs: list[str]) -> str:
    """Chapter Markdown as the importer writes it: paragraphs with anchors, a blank line between them."""
    return "\n\n".join(f"{text} ^p-{number:03d}" for number, text in enumerate(paragraphs, start=1))


def passage_of(card) -> str:
    lines = card.scenario.split("\n")
    assert len(lines) == 2 and lines[1].startswith('"') and lines[1].endswith('"'), card.scenario
    return lines[1][1:-1]


def right_option(card) -> str:
    rights = [option.text for option in card.options if option.is_correct]
    assert len(rights) == 1
    return rights[0]


def wrong_options(card) -> list[str]:
    return [option.text for option in card.options if not option.is_correct]


def alike(first: str, second: str) -> float:
    return SequenceMatcher(None, first.lower(), second.lower(), autojunk=False).ratio()


def test_a_card_asks_which_sentence_comes_right_after_its_passage():
    paragraphs = MILL_TOWN
    cards = generate_chapter_scenario_cards(chapter(paragraphs), "ch-01", max_items=3)

    assert len(cards) == 3
    for card in cards:
        assert card.scenario.split("\n")[0] == QUESTION
        paragraph = next(text for text in paragraphs if passage_of(card) in text)
        assert f"{passage_of(card)} {right_option(card)}" == paragraph, "the right option ends the passage's paragraph"
        for wrong in wrong_options(card):
            assert wrong not in paragraph
        assert card.rationale == f'{RATIONALE}{right_option(card)}"'


def test_a_paragraph_of_one_sentence_makes_no_card():
    single = chapter([sentence for text in MILL_TOWN for sentence in split_sentences(text)])

    assert generate_chapter_scenario_cards(single, "ch-01", max_items=3) == []


def test_the_right_option_is_spread_over_a_to_d():
    text = chapter(MILL_TOWN)
    places = {"A": 0, "B": 0, "C": 0, "D": 0}
    first_cards = {"A": 0, "B": 0, "C": 0, "D": 0}
    total = 0
    for number in range(1, 41):
        cards = generate_chapter_scenario_cards(text, f"ch-{number:02d}", max_items=3)
        for index, card in enumerate(cards):
            key = next(option.key for option in card.options if option.is_correct)
            places[key] += 1
            total += 1
            if index == 0:
                first_cards[key] += 1

    assert total == 120
    for key, count in places.items():
        assert count >= total // 10, f"the right option is {key} in only {count} of {total} cards: {places}"
    assert first_cards["A"] < 40, f"the first card of every chapter has its right option at A: {first_cards}"


def test_no_wrong_option_is_a_near_copy_of_the_right_option():
    paragraphs = [
        "Grain that is stored in damp lofts spoils before the winter ends. "
        "Therefore a miller who keeps dry lofts can sell flour when other mills have none.",
        "Carts and roads cost money, and the cost grows with every mile from the river.",
        "A miller who keeps dry lofts can sell flour when the other mills have none.",
        "Bakers who buy flour in bulk pay less for each sack than the small bakers do.",
        "Two mills must compete for the same grain and for the same bakers in the town.",
        "River boats carry flour to the towns that have no mill of their own.",
        "A dry summer leaves the miller with less grain to grind and to sell.",
    ]
    cards = generate_chapter_scenario_cards(chapter(paragraphs), "ch-01", max_items=1)

    assert len(cards) == 1
    right = right_option(cards[0])
    assert alike(right, paragraphs[2]) >= 0.65, "the test chapter must hold a near-copy of the right option"
    for wrong in wrong_options(cards[0]):
        assert alike(right, wrong) < 0.65, f"{wrong!r} is a near-copy of the right option {right!r}"


def test_no_wrong_option_comes_from_the_paragraph_right_after_the_passage():
    paragraphs = [
        "Grain that is stored in damp lofts spoils before the winter ends. "
        "Therefore a miller who keeps dry lofts can sell flour through the whole winter.",
        "Dry lofts cost the miller more to build, but they keep his grain and flour sound in winter.",
        "Carts and roads cost money, and the cost grows with every mile from the river.",
        "Bakers who buy flour in bulk pay less for each sack than the small bakers do.",
        "Two mills must compete for the same grain and for the same bakers in the town.",
        "River boats carry flour to the towns that have no mill of their own.",
        "A dry summer leaves the miller with less grain to grind and to sell.",
    ]
    cards = generate_chapter_scenario_cards(chapter(paragraphs), "ch-01", max_items=1)

    assert len(cards) == 1
    assert alike(right_option(cards[0]), paragraphs[1]) < 0.65, "the next paragraph must be no near-copy"
    assert paragraphs[1] not in wrong_options(cards[0]), "a sentence right after the passage is a wrong option"


def test_a_piece_of_text_that_ends_like_no_sentence_is_no_option():
    paragraphs = [
        "A mill in a river town needs a steady flow of grain from the farms around it. "
        "The miller buys grain in autumn and stores it in dry lofts. "
        "It means that when the farmers sell their grain to the mill,",
        *MILL_TOWN[1:],
        "The mills along the river and the farms that send them grain are shown in this map: "
        "![Mills on the river](assets/fig-01.png)",
    ]
    cards = generate_chapter_scenario_cards(chapter(paragraphs), "ch-01", max_items=3)

    assert cards
    for made in cards:
        for option in made.options:
            assert re.search(r"[.!?][\"'”’)\]]*$", option.text), f"{option.text!r} does not end like a sentence"


def test_a_sentence_that_is_not_text_of_the_chapter_goes_into_no_card(monkeypatch: pytest.MonkeyPatch):
    real_split = scenarios.split_sentences

    def changed_split(text: str) -> list[str]:
        return [sentence.replace("flour", "flower") for sentence in real_split(text)]

    monkeypatch.setattr(scenarios, "split_sentences", changed_split)
    cards = generate_chapter_scenario_cards(chapter(MILL_TOWN), "ch-01", max_items=3)

    assert cards, "the sentences that the change leaves as they are still make cards"
    for made in cards:
        assert "flower" not in made.scenario
        assert all("flower" not in option.text for option in made.options), made.options


# --- The audit (.agent/skills/audit-practice.py) ----------------------------------------------------------------


def audit_module():
    spec = importlib.util.spec_from_file_location("audit_practice", REPO / ".agent" / "skills" / "audit-practice.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PASSAGE = (
    "A mill in a river town needs a steady flow of grain from the farms around it. "
    "The miller buys grain in autumn and stores it in dry lofts."
)
NEXT = "Therefore the price of flour stays level through the winter months."
NEAR_COPY = "The price of flour therefore stays level through all the winter months."


def card(question: str = QUESTION + f'\n"{PASSAGE}"', options: list[tuple[str, str]] | None = None) -> str:
    """A quiz card in the deck format. Each option is (mark, text), with the mark "x" for the right one."""
    options = options or [
        (" ", "Buyers then compete for the flour that is left in the lofts."),
        (" ", "A baker who buys in bulk pays less for each sack of flour."),
        ("x", NEXT),
        (" ", "Water transport costs far less than a cart on a muddy road."),
    ]
    lines = [
        "### Scenario: sc-ch-01-001",
        "- **Chapter:** ch-01",
        "- **Anchor:** ^p-001",
        f"**Scenario:** {question}",
    ]
    lines += [f"- [{mark}] ({chr(ord('A') + index)}) {text}" for index, (mark, text) in enumerate(options)]
    lines.append(f'> **Rationale:** {RATIONALE}{NEXT}"')
    return "\n".join(lines) + "\n"


def audit(tmp_path: Path, deck: str):
    books = tmp_path / "vault" / "books"
    (books / "b1").mkdir(parents=True)
    (books / "b1" / "ch-01.md").write_text(chapter([*MILL_TOWN, NEAR_COPY]), encoding="utf-8")
    notes = tmp_path / "vault" / "notes" / "b1"
    notes.mkdir(parents=True)
    (notes / "practice-deck.md").write_text(deck, encoding="utf-8")
    return audit_module().audit_book_practice_deck(notes / "practice-deck.md", books)


def test_the_audit_accepts_a_card_that_asks_what_comes_next(tmp_path: Path):
    result = audit(tmp_path, card())

    assert (result.total, result.mismatches, result.errors) == (1, 0, [])


def test_the_audit_refuses_the_old_question(tmp_path: Path):
    old = (
        f'Consider the following excerpt from this section:\n"{PASSAGE}"\n\n'
        "Which of the following statements represents the analytically valid conclusion?"
    )
    result = audit(tmp_path, card(question=old))

    assert result.mismatches == 1, result.errors
    assert any("question" in error for error in result.errors), result.errors


def test_the_audit_refuses_an_option_that_is_not_text_of_the_chapter(tmp_path: Path):
    options = [
        (" ", "Buyers then compete for the flour that is left in the lofts."),
        (" ", "A baker who buys in bulk pays less for each sack of flour."),
        ("x", NEXT),
        (" ", "Water transport costs nothing at all on a calm river."),
    ]
    result = audit(tmp_path, card(options=options))

    assert result.mismatches == 1, result.errors
    assert any("(D) is not text of ch-01.md" in error for error in result.errors), result.errors


def test_the_audit_refuses_a_right_option_that_does_not_come_right_after_the_passage(tmp_path: Path):
    options = [
        (" ", "Buyers then compete for the flour that is left in the lofts."),
        ("x", "A baker who buys in bulk pays less for each sack of flour."),
        (" ", NEXT),
        (" ", "Water transport costs far less than a cart on a muddy road."),
    ]
    result = audit(tmp_path, card(options=options))

    assert result.mismatches == 1, result.errors
    assert any("does not come right after the passage" in error for error in result.errors), result.errors


def test_the_audit_refuses_two_options_that_say_much_the_same(tmp_path: Path):
    options = [
        (" ", NEAR_COPY),
        (" ", "A baker who buys in bulk pays less for each sack of flour."),
        ("x", NEXT),
        (" ", "Water transport costs far less than a cart on a muddy road."),
    ]
    result = audit(tmp_path, card(options=options))

    assert result.mismatches == 1, result.errors
    assert any("(A) and (C) say much the same thing" in error for error in result.errors), result.errors


def test_a_deck_that_the_importer_writes_passes_the_audit(tmp_path: Path):
    cards = generate_chapter_scenario_cards(chapter([*MILL_TOWN, NEAR_COPY]), "ch-01", max_items=3)
    result = audit(tmp_path, format_practice_deck_markdown("Mill Town", [], cards))

    assert result.scenario_count == 3
    assert (result.mismatches, result.errors) == (0, [])


def test_the_audit_and_the_importer_use_the_same_question_and_near_copy_rule():
    module = audit_module()

    assert module.NEXT_SENTENCE_QUESTION == scenarios.NEXT_SENTENCE_QUESTION == QUESTION
    assert module.NEAR_COPY_RATIO == scenarios.NEAR_COPY_RATIO
