"""The rule for a book id. The id names the folders of a book in the vault: `books/<book-id>/` and `notes/<book-id>/`.

An import used to join a book id that it was given into those paths as it came, so `--book-id ../../x` wrote the book
outside the vault, and an absolute path wrote it anywhere (SEC-03). Now the id must follow the rule before the import
writes anything. The desktop app has the same rule (`apps/desktop/src-tauri/src/vault/paths.rs`) and refuses every
other id, so a book that an import writes is a book that the app can open.
"""

from __future__ import annotations

import re

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
