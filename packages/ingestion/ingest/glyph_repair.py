"""A PDF that draws maths with the wrong letters gets a correct character map before its text is read (CQ-02).

A typesetter often sets a formula in a symbol font. The font holds an "=", a "+" and a "x", but its
`ToUnicode` map, which names each character for a reader, can name them wrongly or leave them out.
The Advent 3B2 font `AdvP4C4E74`, which the Dalton book uses, says its "=" is a "1/4" and its "+" is
a "thorn", and it gives its "x" no name at all. PyMuPDF then reads "1/4" for "=" and a replacement
character for "x", so a price or a formula in the vault says something else.

This module writes a correct map into the open document, so the text comes out right the first time
(`ingest.pdf_parser`). A font that already names its characters correctly is left alone. It also
counts the characters that mean "the book said something that nothing read", so an import stops
before it writes them into the vault (`ingest.book_check`).

The table below is not a guess. Each glyph of `AdvP4C4E74` was cut out of the page as a picture and
looked at, and the font's own `/CharSet` names them `/C0 /C2 /C3 /onequarter /thorn /y`.
"""

from __future__ import annotations

import re

#: The character that a reader puts where nothing names the character that the book drew.
REPLACEMENT = "�"

#: What each glyph of a font really is, by the font's own glyph name.
FONT_GLYPHS: dict[str, dict[str, str]] = {
    "AdvP4C4E74": {
        "onequarter": "=",
        "thorn": "+",
        "C0": "×",
        "C2": "×",
        "C3": "×",
        "y": "†",
    },
}

#: The same, by character code, for a code that the font's encoding leaves unnamed.
FONT_CODES: dict[str, dict[int, str]] = {
    "AdvP4C4E74": {
        0x01: "×",
        0x02: "×",
        0x04: "×",
        0x79: "†",
        0xBC: "=",
        0xFE: "+",
    },
}

#: A glyph name in a `/Differences` array, or the code that the names after it start from.
_DIFFERENCE = re.compile(r"(\d+)|/([A-Za-z][\w.]*)")
#: One line of a `ToUnicode` map: `<bc> <003D>`.
_BF_CHAR = re.compile(r"<([0-9A-Fa-f]{2,4})>\s*<([0-9A-Fa-f]{4,})>")


def font_family(base_font: str) -> str:
    """The name of the font without the six-letter tag that marks a part of a font: `OJHGNH+Adv` -> `Adv`."""
    name = base_font.lstrip("/")
    return name.split("+", 1)[1] if "+" in name else name


def parse_differences(body: str) -> dict[int, str]:
    """Which glyph each code names, from a `/Differences` array such as `[ 2/C2 188/onequarter ]`."""
    names: dict[int, str] = {}
    code = 0
    for number, glyph in _DIFFERENCE.findall(body):
        if glyph:
            names[code] = glyph
            code += 1
        else:
            code = int(number)
    return names


def parse_to_unicode(cmap: str) -> dict[int, str]:
    """Which character each code is named as, from a `ToUnicode` map. Only one-byte codes are read."""
    named: dict[int, str] = {}
    for code_text, target in _BF_CHAR.findall(cmap):
        if len(code_text) > 2:
            continue
        points = [target[at : at + 4] for at in range(0, len(target), 4)]
        named[int(code_text, 16)] = "".join(chr(int(point, 16)) for point in points)
    return named


def to_unicode_cmap(named: dict[int, str]) -> bytes:
    """A `ToUnicode` map that names each code in `named`."""
    lines = [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<00> <ff>",
        "endcodespacerange",
        f"{len(named)} beginbfchar",
    ]
    for code, text in sorted(named.items()):
        lines.append(f"<{code:02X}> <{''.join(f'{ord(part):04X}' for part in text)}>")
    lines += ["endbfchar", "endcmap CMapName currentdict /CMap defineresource pop end end"]
    return ("\n".join(lines) + "\n").encode("ascii")


def _differences_of(doc: object, font_xref: int) -> dict[int, str]:
    """The `/Differences` array of the font at `font_xref`, when it has one."""
    encoding = doc.xref_get_key(font_xref, "Encoding")  # type: ignore[attr-defined]
    if not encoding or encoding[0] != "xref":
        return {}
    kind, body = doc.xref_get_key(int(encoding[1].split()[0]), "Differences")  # type: ignore[attr-defined]
    return parse_differences(body) if kind == "array" else {}


def _to_unicode_of(doc: object, font_xref: int) -> dict[int, str] | None:
    """The `ToUnicode` map of the font at `font_xref`. None when the font has none."""
    reference = doc.xref_get_key(font_xref, "ToUnicode")  # type: ignore[attr-defined]
    if not reference or reference[0] != "xref":
        return None
    stream = doc.xref_stream(int(reference[1].split()[0]))  # type: ignore[attr-defined]
    return parse_to_unicode(stream.decode("latin-1")) if stream else None


def _font_xrefs(doc: object) -> list[int]:
    """Every object of the document that is a font of a family in the table."""
    found: list[int] = []
    for xref in range(1, doc.xref_length()):  # type: ignore[attr-defined]
        base = doc.xref_get_key(xref, "BaseFont")  # type: ignore[attr-defined]
        if base and base[0] == "name" and font_family(base[1]) in FONT_CODES:
            found.append(xref)
    return found


def right_text_of(doc: object, font_xref: int, family: str) -> dict[int, str]:
    """Which character each code of this font really is."""
    named = dict(FONT_CODES[family])
    glyphs = FONT_GLYPHS[family]
    for code, glyph in _differences_of(doc, font_xref).items():
        if glyph in glyphs:
            named[code] = glyphs[glyph]
    return named


def names_them_right(named: dict[int, str] | None, right: dict[int, str]) -> bool:
    """True when a `ToUnicode` map already names every character of the font correctly."""
    if named is None:
        return False
    return all(named.get(code) == text for code, text in right.items())


def repair_glyph_maps(doc: object) -> list[str]:
    """Give every font of the document that names its characters wrongly a correct map.

    Call this on the open document before any text is read. A font that is already right is left
    alone. Gives one line for each font it repaired.
    """
    repaired: list[str] = []
    for font_xref in _font_xrefs(doc):
        base = doc.xref_get_key(font_xref, "BaseFont")[1]  # type: ignore[attr-defined]
        right = right_text_of(doc, font_xref, font_family(base))
        if names_them_right(_to_unicode_of(doc, font_xref), right):
            continue
        cmap_xref = doc.get_new_xref()  # type: ignore[attr-defined]
        doc.update_object(cmap_xref, "<<>>")  # type: ignore[attr-defined]
        doc.update_stream(cmap_xref, to_unicode_cmap(right), new=True)  # type: ignore[attr-defined]
        doc.xref_set_key(font_xref, "ToUnicode", f"{cmap_xref} 0 R")  # type: ignore[attr-defined]
        repaired.append(f"{base.lstrip('/')}: {len(right)} characters named again")
    return repaired


def unreadable_count(text: str) -> int:
    """How many characters of `text` say that the book drew something that nothing could read.

    Only the replacement character counts. A "1/4" or a "thorn" can belong to a book, so a text that
    holds one is not broken by itself; `repair_glyph_maps` keeps the wrong ones out at the source.
    """
    return text.count(REPLACEMENT)
