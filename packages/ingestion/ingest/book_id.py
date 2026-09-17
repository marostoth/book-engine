"""The rule for a book id. The id names the folders of a book in the vault: `books/<book-id>/` and `notes/<book-id>/`.

An import used to join a book id that it was given into those paths as it came, so `--book-id ../../x` wrote the book
outside the vault, and an absolute path wrote it anywhere (SEC-03). Now the id must follow the rule before the import
writes anything. The desktop app has the same rule (`apps/desktop/src-tauri/src/vault/paths.rs`) and refuses every
other id, so a book that an import writes is a book that the app can open.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata

#: 1 to 255 characters: a-z, 0-9, `-` and `_`, and not `-` first. Every id that the importer makes from a file name or
#: from the metadata of a book follows it.
BOOK_ID_RULE = re.compile(r"[a-z0-9_][a-z0-9_-]{0,254}")


class InvalidBookIdError(ValueError):
    """An import stopped before it wrote anything, because its book id does not follow the rule."""

    def __init__(self, book_id: str) -> None:
        self.book_id = book_id
        super().__init__(
            f"The book id {book_id!r} cannot be used. A book id has 1 to 255 characters: a-z, 0-9, - and _, "
            "and it does not start with -. Nothing was changed."
        )


def check_book_id(book_id: str) -> None:
    """Stops an import whose book id does not follow the rule. Call it before the import writes anything."""
    if BOOK_ID_RULE.fullmatch(book_id) is None:
        raise InvalidBookIdError(book_id)


#: Latin letters that Unicode does not write as a plain letter with a mark.
_PLAIN_LETTERS = str.maketrans({
    "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ø": "o", "Ø": "O", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D",
    "ð": "d", "Ð": "D", "þ": "th", "Þ": "TH", "ı": "i",
})


def plain_letters(name: str) -> str:
    """`name` with the marks taken off its letters: "Économie" gives "Economie", and "Straße" gives "Strasse"."""
    decomposed = unicodedata.normalize("NFKD", name.translate(_PLAIN_LETTERS))
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def book_id_of_name(slug: str, name: str) -> str:
    """The book id of a file named `name`, whose letters a-z and digits gave `slug`.

    A slug keeps only a-z and 0-9. A name in another script, such as "Война и мир" or "战争与和平", gave no slug or only its
    digits, so an EPUB got the id of the sample book, `sample`, and two such names got the same id (IN-03). Such a
    name, and a name that gives no slug, gets a code of 8 characters from the name: the same name always gets the same
    code. The id is then `<slug>-<code>`, or `book-<code>` when there is no slug.
    """
    plain = plain_letters(name)
    if slug and not any(not char.isascii() and char.isalnum() for char in plain):
        return slug
    code = hashlib.sha256(unicodedata.normalize("NFC", plain).encode("utf-8")).hexdigest()[:8]
    return f"{slug[:246].rstrip('-')}-{code}" if slug else f"book-{code}"
