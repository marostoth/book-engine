r"""A PDF that names its maths characters wrongly is corrected before its text is read (CQ-02).

The Dalton book sets its formulas in the Advent 3B2 font `AdvP4C4E74`. That font says its "=" is a
"1/4" and its "+" is a "thorn", and it gives its "x" no name at all, so the chapters held "1/4" for
"=" and a replacement character for "x". These tests use a stand-in document, so they need no book.
"""

from pathlib import Path

import pytest

from ingest.book_check import book_problems
from ingest.glyph_repair import (
    REPLACEMENT,
    font_family,
    names_them_right,
    parse_differences,
    parse_to_unicode,
    repair_glyph_maps,
    right_text_of,
    to_unicode_cmap,
    unreadable_count,
)

#: The map that the Dalton book really carries: it names only two of its six characters, and both wrongly.
DALTON_CMAP = """/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (F7+0) /Ordering (T1UV) /Supplement 0 >> def
/CMapName /F7+0 def
/CMapType 2 def
1 begincodespacerange <bc> <fe> endcodespacerange
2 beginbfchar
<bc> <00BC>
<fe> <00FE>
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end
"""


class FakeDoc:
    """A stand-in for an open PDF: it answers about its objects and remembers what was written to it."""

    def __init__(self, fonts):
        # fonts: {xref: {"base": name, "differences": str|None, "cmap": str|None}}
        self.fonts = fonts
        self.objects = {}
        self.streams = {}
        self.keys = {}
        self.next_xref = 500

    def xref_length(self):
        return 400

    def xref_get_key(self, xref, key):
        if key == "Differences":
            # An /Encoding object of its own, a thousand above the font that points at it.
            owner = self.fonts.get(xref - 1000)
            return ("array", owner["differences"]) if owner and owner.get("differences") else ("null", "null")
        font = self.fonts.get(xref)
        if font is None:
            return ("null", "null")
        if key == "BaseFont":
            return ("name", font["base"])
        if key == "Encoding":
            return ("xref", f"{xref + 1000} 0 R") if font.get("differences") else ("null", "null")
        if key == "ToUnicode":
            written = self.keys.get((xref, "ToUnicode"))
            if written:
                return ("xref", written)
            return ("xref", f"{xref + 2000} 0 R") if font.get("cmap") else ("null", "null")
        return ("null", "null")

    def xref_stream(self, xref):
        if xref in self.streams:
            return self.streams[xref]
        font = self.fonts.get(xref - 2000)
        return font["cmap"].encode("latin-1") if font and font.get("cmap") else None

    def get_new_xref(self):
        self.next_xref += 1
        return self.next_xref

    def update_object(self, xref, source):
        self.objects[xref] = source

    def update_stream(self, xref, data, new=False):
        self.streams[xref] = data

    def xref_set_key(self, xref, key, value):
        self.keys[(xref, key)] = value


def dalton_doc():
    """A document with the Dalton book's maths font, as that font really is."""
    return FakeDoc({7: {"base": "/OJHGNH+AdvP4C4E74", "differences": "[ 2/C2 188/onequarter 254/thorn ]", "cmap": DALTON_CMAP}})


def test_the_tag_that_marks_a_part_of_a_font_is_dropped():
    assert font_family("/OJHGNH+AdvP4C4E74") == "AdvP4C4E74"
    assert font_family("AdvP4C4E74") == "AdvP4C4E74"
    assert font_family("/Helvetica") == "Helvetica"


def test_a_differences_array_says_which_glyph_each_code_names():
    assert parse_differences("[ 2/C2 188/onequarter 254/thorn ]") == {2: "C2", 188: "onequarter", 254: "thorn"}
    # Names that follow one code take the codes after it.
    assert parse_differences("[ 10 /a /b /c ]") == {10: "a", 11: "b", 12: "c"}
    assert parse_differences("") == {}


def test_a_to_unicode_map_says_which_character_each_code_is_named_as():
    named = parse_to_unicode(DALTON_CMAP)
    assert named == {0xBC: "¼", 0xFE: "þ"}
    # The codes that draw the "x" are named nowhere, which is why the text held a broken character.
    assert 0x01 not in named and 0x02 not in named and 0x04 not in named


def test_a_map_we_write_reads_back_the_same():
    named = {0x01: "×", 0x79: "†", 0xBC: "=", 0xFE: "+"}
    assert parse_to_unicode(to_unicode_cmap(named).decode("ascii")) == named


def test_a_two_byte_code_is_left_alone():
    assert parse_to_unicode("1 beginbfchar\n<0041> <0042>\nendbfchar") == {}


def test_the_font_of_the_dalton_book_gets_the_characters_it_really_draws():
    doc = dalton_doc()
    right = right_text_of(doc, 7, "AdvP4C4E74")
    assert right[0xBC] == "="
    assert right[0xFE] == "+"
    assert right[0x01] == "×" and right[0x02] == "×" and right[0x04] == "×"
    assert right[0x79] == "†"


def test_the_name_the_font_gives_a_glyph_decides_the_character():
    """A part of a font can put the same glyph at another code, so the glyph name has the last word."""
    # This part of the font puts /onequarter at code 3 and /thorn at code 4, where the code table says "x".
    doc = FakeDoc({7: {"base": "/AAAAAA+AdvP4C4E74", "differences": "[ 3/onequarter /thorn ]", "cmap": DALTON_CMAP}})

    right = right_text_of(doc, 7, "AdvP4C4E74")

    assert right[3] == "="
    assert right[4] == "+"
    # A code the array does not name keeps what the code table says.
    assert right[1] == "×"


def test_a_font_that_is_already_right_is_left_alone():
    right = {0xBC: "=", 0xFE: "+"}
    assert names_them_right({0xBC: "=", 0xFE: "+"}, right) is True
    assert names_them_right({0xBC: "¼", 0xFE: "+"}, right) is False
    assert names_them_right(None, right) is False

    already = FakeDoc({7: {"base": "/AAAAAA+AdvP4C4E74", "differences": None, "cmap": to_unicode_cmap(
        {0x01: "×", 0x02: "×", 0x04: "×", 0x79: "†", 0xBC: "=", 0xFE: "+"}
    ).decode("ascii")}})
    assert repair_glyph_maps(already) == []
    assert already.keys == {}


def test_the_font_of_the_dalton_book_is_given_a_correct_map():
    doc = dalton_doc()
    repaired = repair_glyph_maps(doc)

    assert len(repaired) == 1
    assert "AdvP4C4E74" in repaired[0]
    # The font now points at a new map, and that map names every character correctly.
    assert (7, "ToUnicode") in doc.keys
    written = parse_to_unicode(doc.streams[doc.next_xref].decode("ascii"))
    assert written[0xBC] == "="
    assert written[0xFE] == "+"
    assert written[0x01] == "×"
    assert written[0x79] == "†"
    assert "¼" not in written.values() and "þ" not in written.values()


def test_a_font_we_know_nothing_about_is_not_touched():
    doc = FakeDoc({7: {"base": "/ABCDEF+TimesNewRomanPSMT", "differences": "[ 2/C2 ]", "cmap": DALTON_CMAP}})
    assert repair_glyph_maps(doc) == []
    assert doc.keys == {}
    assert doc.streams == {}


def test_only_a_character_that_nothing_could_read_counts_as_broken():
    assert unreadable_count(f"a price of 96{REPLACEMENT}1 and 24{REPLACEMENT}") == 2
    assert unreadable_count("") == 0
    # A book may hold these for its own reasons, so they are not broken by themselves.
    assert unreadable_count("¼ cup, and the Old English þ") == 0


def test_a_chapter_with_a_broken_character_fails_the_check(tmp_path: Path):
    book = tmp_path / "book"
    book.mkdir()
    (book / "ch-01.md").write_text(
        f"# Title\n\nThe balance is 3 {REPLACEMENT} 4 = 12. ^p-001\n\nAll is well here. ^p-002\n",
        encoding="utf-8",
    )

    problems = book_problems(book)

    assert len(problems) == 1
    assert "ch-01.md" in problems[0]
    assert "1 character is broken" in problems[0]
    assert "U+FFFD" in problems[0]
    # The message names the block, so the passage is easy to find.
    assert "^p-001" in problems[0] and "^p-002" not in problems[0]


def test_a_clean_chapter_passes_the_check(tmp_path: Path):
    book = tmp_path / "book"
    book.mkdir()
    (book / "ch-01.md").write_text(
        "# Title\n\nThe balance is 3 × 4 = 12, and 1 + 1 = 2. ^p-001\n",
        encoding="utf-8",
    )

    assert book_problems(book) == []


def test_every_broken_block_of_a_chapter_is_named(tmp_path: Path):
    book = tmp_path / "book"
    book.mkdir()
    (book / "ch-01.md").write_text(
        f"# Title\n\nOne {REPLACEMENT} here. ^p-001\n\nClean. ^p-002\n\nTwo {REPLACEMENT} and {REPLACEMENT}. ^p-003\n",
        encoding="utf-8",
    )

    problems = book_problems(book)

    assert len(problems) == 1
    assert "3 characters are broken" in problems[0]
    assert "^p-001" in problems[0] and "^p-003" in problems[0]
    assert "^p-002" not in problems[0]


def test_the_import_repairs_the_character_maps_before_it_reads_any_text():
    """The order matters: a map repaired after the text is read changes nothing."""
    source = (Path(__file__).resolve().parents[1] / "ingest" / "pdf_parser.py").read_text(encoding="utf-8")

    assert "from ingest.glyph_repair import repair_glyph_maps" in source
    repaired_at = source.index("repair_glyph_maps(doc)")
    read_at = source.index("pymupdf4llm.to_markdown(")
    assert repaired_at < read_at, "the character maps must be repaired before any text is read"


@pytest.mark.parametrize("wrong,right", [("¼", "="), ("þ", "+")])
def test_the_characters_the_dalton_font_named_wrongly_are_no_longer_written(wrong: str, right: str):
    """The map the import writes never names a character as the wrong one again."""
    doc = dalton_doc()
    repair_glyph_maps(doc)
    written = parse_to_unicode(doc.streams[doc.next_xref].decode("ascii"))

    assert wrong not in written.values()
    assert right in written.values()
