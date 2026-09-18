"""A page's own layout marks come off the text, and a cut word is made whole again (CQ-03).

Every test makes its own little page, so none of them needs a book.
"""

import re
from pathlib import Path

import pytest
from ingest.layout_stitcher import (
    finishes_a_sentence,
    is_figure_label,
    stitch_layout_blocks,
    the_words_prove_the_join,
)
from ingest.pdf_sanitizer import sanitize_pdf_markdown
from ingest.text_repair import (
    close_cut_words,
    drop_empty_headings,
    first_letter_back,
    letter_that_fits,
    repair_page_text,
    repairs_of,
    take_off_marks,
    words_of,
)

# --- the book's own highlight ---


def test_the_books_own_highlight_comes_off_and_the_words_stay():
    page = "#### **<mark>Reviewing and Extending the Concepts</mark>**"
    assert take_off_marks(page) == "#### **Reviewing and Extending the Concepts**"


def test_a_highlight_with_attributes_comes_off_too():
    assert take_off_marks('a <mark class="x">word</mark> here') == "a word here"


def test_no_chapter_may_arrive_already_highlighted():
    page = "# Title\n\nA <mark>word</mark> in a sentence.\n"
    assert "<mark" not in sanitize_pdf_markdown(page)


# --- a heading with no words ---


def test_a_heading_with_no_words_goes():
    page = "# Title\n\n######\n\nA paragraph.\n"
    out = drop_empty_headings(page)
    assert "######" not in out
    assert "# Title" in out and "A paragraph." in out


def test_a_heading_that_has_words_stays():
    page = "###### Key Terms\n"
    assert drop_empty_headings(page) == page


# --- a word a hyphen cut in two ---


@pytest.mark.parametrize(
    "cut, whole",
    [
        ("consumer- generated review systems", "consumer-generated review systems"),
        ("self- expression by helping", "self-expression by helping"),
        ("deep- pocketed competitors", "deep-pocketed competitors"),
        ("the best- packaged item", "the best-packaged item"),
    ],
)
def test_a_hyphen_and_a_space_close_into_one_word(cut, whole):
    assert close_cut_words(cut) == whole


@pytest.mark.parametrize(
    "kept",
    [
        "heat- and moisture-resistant",
        "two- to three-year",
        "customer- and market-driven",
        "Product- versus Market-Oriented",
    ],
)
def test_a_hyphen_that_waits_for_the_next_word_stays(kept):
    assert close_cut_words(kept) == kept


# --- a paragraph that lost its big first letter ---


def test_the_texts_own_words_say_which_letter_was_lost():
    # "Google" is used again and again; "oogle" is a stranger.
    counts = words_of("Google Google Google and the word oogle")
    assert letter_that_fits("oogle", counts) == "G"


def test_a_letter_that_no_word_proves_is_not_guessed():
    counts = words_of("nothing here helps at all")
    assert letter_that_fits("oogle", counts) == ""


def test_a_letter_is_not_guessed_when_two_of_them_fit():
    counts = words_of("was was has has a gap of as")
    assert letter_that_fits("as", counts) == ""


def test_a_first_letter_goes_back_only_at_the_start_of_a_paragraph():
    page = (
        "**GOOGLE: The Moon Shot Factory** oogle is wildly innovative.\n\n"
        "Google spends a lot. Google hires well. Google wins.\n"
    )
    out = first_letter_back(page)
    assert "** Google is wildly innovative." in out


def test_bold_words_in_the_middle_of_a_sentence_are_left_alone():
    page = "The **production concept** holds that buyers will favour products. The **product concept** holds more.\n"
    assert first_letter_back(page) == page


def test_only_a_paragraph_that_opens_with_bold_text_may_have_lost_a_letter():
    # The letter "G" would fit "oogle" here, but the bold run sits inside a sentence, so the
    # lowercase word after it is the sentence carrying on, not a paragraph missing its first letter.
    page = "Google is big. Google is bold. Google grows.\n\nWe asked the **team** oogle and moved on.\n"
    assert first_letter_back(page) == page


def test_a_stem_the_text_uses_more_often_than_the_whole_word_is_left_alone():
    # The text uses "ing" three times and "wing" twice, so "ing" is its own word here, not a scrap.
    counts = words_of("ing ing ing wing wing")
    assert letter_that_fits("ing", counts) == ""


# --- what the repair reports ---


def test_the_repair_says_what_it_did():
    page = "# T\n\n**<mark>X</mark>** and\n\n######\n\nself- expression\n"
    notes = repairs_of(page)
    assert any("highlight" in n for n in notes)
    assert any("no words" in n for n in notes)
    assert any("hyphen" in n for n in notes)


def test_a_clean_page_needs_no_repair():
    page = "# Title\n\nA clean sentence.\n"
    assert repairs_of(page) == []
    assert repair_page_text(page) == page


# --- when a paragraph finishes a sentence ---


@pytest.mark.parametrize(
    "finished", ["A sentence.", "A shout!", "A question?", 'He said "yes."', "Bold.**", "A note.<sup>14</sup>"]
)
def test_these_paragraphs_finish_a_sentence(finished):
    assert finishes_a_sentence(finished)


@pytest.mark.parametrize(
    "half", ["the following:", "a list;", "the word", "cut in the mid-", "**bold but unfinished**"]
)
def test_these_paragraphs_do_not_finish_a_sentence(half):
    assert not finishes_a_sentence(half)


# --- joining the two halves of a sentence ---


def test_two_halves_of_a_sentence_become_one_paragraph():
    page = "The winner\n\nof the contest was announced. The winner of the draw was too.\n"
    out = stitch_layout_blocks(page)
    assert "The winner of the contest was announced." in out


def test_a_word_a_hyphen_cut_at_a_page_break_is_made_whole():
    page = "plenty of mar-\n\nkets from cut resistant cloth. Many markets exist in many markets.\n"
    out = stitch_layout_blocks(page)
    assert "plenty of markets from cut resistant cloth." in out


def test_a_sentence_cut_into_three_parts_is_joined_all_the_way():
    page = "The company sells\n\nmany of its\n\nown goods today. The company sells many of its own goods.\n"
    out = stitch_layout_blocks(page)
    assert "The company sells many of its own goods today." in out


def test_a_photo_credit_inside_a_paragraph_no_longer_hides_the_cut():
    page = (
        "A camp is small and what it lacks in size it makes up\nHalil Erdogan/Alamy Stock Photo\n\n"
        "for with its own pool. The camp makes up for with its own style.\n"
    )
    out = stitch_layout_blocks(page)
    assert "it makes up for with its own pool." in out
    assert "Halil Erdogan/Alamy Stock Photo" in out, "the credit itself is kept"


def test_a_photo_credit_never_becomes_the_rest_of_a_sentence():
    # The first half is a half sentence, so the join is tried, and the credit must not be the rest.
    page = "The airline says its customers own the\n\nvaalaa/Shutterstock\n"
    out = stitch_layout_blocks(page)
    assert "own the vaalaa" not in out
    assert "vaalaa/Shutterstock" in out


def test_a_paragraph_that_only_mentions_a_photo_agency_keeps_every_word():
    page = "The firm licensed its work from Getty and said so in the report.\n"
    assert stitch_layout_blocks(page) == page.strip()


# --- what may not be joined ---


@pytest.mark.parametrize("scrap", ["ers could sit for hours", "ing customer value", "tion of the firm"])
def test_the_tail_of_a_word_from_another_column_is_not_joined_on(scrap):
    assert not the_words_prove_the_join("use the space as it", scrap)


def test_a_hyphen_is_proof_enough_on_its_own():
    # "ers" alone would never carry a sentence on, but the hyphen shows the layout cut the word.
    assert the_words_prove_the_join("the needs of our custom-", "ers of Asia")
    assert not the_words_prove_the_join("the needs of our custom", "ers of Asia")


@pytest.mark.parametrize("rest", ["wrote the chief", "ask for more time", "they share the aim"])
def test_a_real_word_carries_the_sentence_on(rest):
    assert the_words_prove_the_join("he said,", rest)


def test_a_new_sentence_in_capitals_is_not_the_rest_of_the_last_one():
    page = "Value area is 99 to 99 (73%)\n\nFor comparison, the volume value area was 99 to 99.\n"
    out = stitch_layout_blocks(page)
    assert "(73%) For comparison" not in out


# --- the label of a figure ---


@pytest.mark.parametrize("label", ["FIGURE 4.112 (Continued)", "TABLE 4.1 Directional Performance", "FIGURE 2.3"])
def test_these_are_labels_of_a_figure(label):
    assert is_figure_label(label)


@pytest.mark.parametrize(
    "prose",
    [
        # A label shouts its name in capitals; a sentence that begins with the word does not.
        "Figure 4.65 contains a simplified long-term activity record designed to help traders "
        "organize the answers to the two Big Questions addressed in this section of the book.",
        "The table shows the costs.",
    ],
)
def test_a_sentence_is_not_a_label_of_a_figure(prose):
    assert not is_figure_label(prose)


def test_a_long_label_with_its_copyright_line_is_still_a_label():
    label = (
        "FIGURE 4.8 Open within Value-Acceptance in the December S&P 500, September 22 and 23, "
        "1988. O designates the open. Copyright Board of Trade of the City of Chicago."
    )
    assert is_figure_label(label)


def test_a_label_of_a_figure_never_becomes_part_of_a_sentence():
    page = "FIGURE 4.112 (Continued)\n\ntrade you almost have to do. Risk is minimal.\n"
    out = stitch_layout_blocks(page)
    assert "FIGURE 4.112 (Continued) trade you" not in out


def test_a_sentence_cut_by_a_label_of_a_figure_is_joined_across_it():
    page = (
        "A balance-area breakout is a\n\nFIGURE 4.63 Value Area Width\n\n"
        "trade you almost have to do. Risk is minimal.\n"
    )
    out = stitch_layout_blocks(page)
    assert "A balance-area breakout is a trade you almost have to do." in out
    assert "FIGURE 4.63 Value Area Width" in out, "the label itself is kept"


# --- the page numbers of the front matter ---


@pytest.mark.parametrize("page_number", ["vi", "vii", "ix", "x", "xiv", "xvii"])
def test_a_small_roman_page_number_on_its_own_line_goes(page_number):
    page = f"The sentence carries on to the\n\n{page_number}\n\nnext page of the book.\n"
    out = sanitize_pdf_markdown(page)
    assert f"\n{page_number}\n" not in out


def test_a_roman_page_number_no_longer_lands_in_the_middle_of_a_sentence():
    page = "We still believe in the\n\nxiv\n\nstructural meaning of tails, but we have more to say.\n"
    out = stitch_layout_blocks(sanitize_pdf_markdown(page))
    assert "We still believe in the structural meaning of tails" in out
    assert "xiv" not in out


def test_a_real_word_is_not_taken_for_a_page_number():
    # "mix" is the roman number 1009, and a marketing book uses the word on every other page.
    page = "# Title\n\nmix\n\nmid\n\ndid\n\ndim\n\nII\n"
    out = sanitize_pdf_markdown(page)
    for word in ("mix", "mid", "did", "dim", "II"):
        assert word in out, f"{word!r} was taken for a page number"


def test_a_sentence_is_not_joined_across_a_heading():
    # The heading is long, so it is not a margin term, and the paragraph after it is long, so it is
    # not a margin definition. Neither of the older rules applies, and the heading still holds.
    title = "###### **Mahali Mzuri: An Immersive Experience at the World's Number-One Hotel**"
    rest = (
        "featuring satellite television and a fast connection. The main tent also houses the "
        "camp's long swimming pool and its full service spa, and the whole camp sits inside a "
        "conservancy that the owners lease from the families who live there, which is how the "
        "money reaches them every month of the year without fail."
    )
    page = f"what the camp lacks in size it makes up for with, well,\n\n{title}\n\n{rest}\n"
    out = stitch_layout_blocks(page)
    assert title in out
    assert "with, well, featuring satellite" not in out


def test_joining_stops_instead_of_running_for_ever():
    page = "\n\n".join(["a word" for _ in range(40)]) + "\n"
    out = stitch_layout_blocks(page)
    assert out.count("a word") == 40


# --- the import uses all of it ---


def test_the_sanitizer_repairs_the_page_before_it_hands_the_text_on():
    source = (Path(__file__).resolve().parents[1] / "ingest" / "pdf_sanitizer.py").read_text(encoding="utf-8")
    assert "from ingest.text_repair import repair_page_text" in source
    assert "repair_page_text(cleaned_md)" in source


def test_the_stitcher_uses_the_same_sentence_rule_as_the_practice_cards():
    stitcher = (Path(__file__).resolve().parents[1] / "ingest" / "layout_stitcher.py").read_text(encoding="utf-8")
    scenarios = (Path(__file__).resolve().parents[1] / "ingest" / "scenarios.py").read_text(encoding="utf-8")
    rule = re.search(r"SENTENCE_END = re\.compile\((.+)\)", scenarios).group(1)
    assert f"SENTENCE_END = re.compile({rule})" in stitcher
