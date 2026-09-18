"""An import builds a book in a folder of its own, and puts it in the vault only when it is whole and checked (IN-05).

The build folder is `vault/.import/<book-id>/`. The app looks for books only in `vault/books/`, so it never shows a book
that is not whole. `BookBuild.put_in_vault` checks the book (`ingest.book_check`), finds what the reader's files point
to in the new text (`ingest.places`), and gives every change to `VaultChanges` (`ingest.vault_changes`), which puts them
in place all together or not at all. A new import writes the whole book folder again, so no chapter file or picture of
an older import stays in it.

A stopped import removes its build folder. The next import of the book removes a build folder that a killed import left.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from ingest.book_check import BookCheckError, book_problems
from ingest.models import BookMeta
from ingest.places import BookText, reader_moves
from ingest.vault_changes import VaultChanges, again_when_held, aside_folder, remove_folder

#: The folder of the vault where an import builds a book
IMPORT_FOLDER = ".import"


class BookLeftAsideError(Exception):
    """An import stopped before it changed anything, because an import that did not end left the book aside."""

    def __init__(self, book_id: str, aside: Path, book_dir: Path) -> None:
        self.book_id = book_id
        super().__init__(
            f'An import that did not end left the book "{book_id}" in {aside}. Move that folder back to {book_dir}, '
            "and then import the book again. Nothing was changed."
        )


class BookBuild:
    """The build folder of an import of the book `book_id`, and its way into the vault."""

    def __init__(self, vault_dir: Path, book_id: str, from_book: bool = False) -> None:
        """Makes the build folder. With `from_book`, the build starts from a copy of the book folder, for an import
        of some chapters only. Call it after the checks of `ingest.reimport`."""
        self.vault_dir = Path(vault_dir)
        self.book_id = book_id
        self.book_dir = self.vault_dir / "books" / book_id
        self.notes_dir = self.vault_dir / "notes" / book_id
        self.folder = self.vault_dir / IMPORT_FOLDER / book_id
        aside = aside_folder(self.folder)
        if aside.exists():
            if not self.book_dir.exists():
                raise BookLeftAsideError(book_id, aside, self.book_dir)
            # The book is in its folder, so this is an old book folder that an import could not remove
            again_when_held(lambda: remove_folder(aside))
        if self.folder.exists():
            again_when_held(lambda: remove_folder(self.folder))
        if from_book and self.book_dir.is_dir():
            shutil.copytree(self.book_dir, self.folder)
        else:
            self.folder.mkdir(parents=True)

    def put_in_vault(self, meta: BookMeta, practice_deck: str, old_text: BookText | None) -> None:
        """Checks the book in the build folder, and puts it in the vault with its practice deck. The reader's files for
        the book then point to the same text in the new book. When a step fails, the vault stays as it was.

        `old_text` is `read_book_text` of the book before the import: None for a new book.
        """
        listed = {chapter.file_path for chapter in meta.spine}
        for chapter in self.folder.glob("ch-*.md"):
            if chapter.name not in listed:
                chapter.unlink()  # a chapter of the copied book that the book does not have now
        problems = book_problems(self.folder)
        if problems:
            raise BookCheckError(self.book_id, problems)

        moves = reader_moves(self.vault_dir, self.book_id, old_text, self.folder)
        changes = VaultChanges()
        changes.replace_folder(self.folder, self.book_dir)
        changes.write(self.notes_dir / "practice-deck.md", practice_deck)
        if moves is not None:
            moves.add_to(changes)
        changes.carry_out()
        if moves is not None:
            moves.tell()

    def remove(self) -> None:
        """Removes the build folder when it is still there, and the import folder of the vault when it is empty."""
        try:
            again_when_held(lambda: remove_folder(self.folder) if self.folder.exists() else None)
            if self.folder.parent.is_dir() and not any(self.folder.parent.iterdir()):
                self.folder.parent.rmdir()
        except OSError as error:
            print(f"[!] {self.folder} could not be removed ({error}). You can remove it.", file=sys.stderr, flush=True)
