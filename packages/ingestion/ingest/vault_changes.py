"""An import changes the vault all together, or not at all (IN-05).

An import wrote each file of a book into the vault as soon as it had made it. So an import that failed in chapter 2 left
a new `ch-01.md` next to the old `_meta.json` and practice deck, and a new import with fewer chapters left the old
`ch-03.md` and its pictures in the book folder.

Now an import builds a book in a folder of its own (`ingest.book_build`). When the book is whole and checked,
`VaultChanges` puts the new book folder, the practice deck and the reader's files that follow their text in place:

1. Each new text goes to a temporary file next to its file.
2. The old book folder moves aside, the new book folder moves into its place, and each temporary file takes the place of
   its file.
3. When a step fails, each change that is in goes back, and the error stops the import.
4. When every change is in, the old book folder is removed, and so is each file whose text went to another file.

Windows can hold a file for a short time, for example while OneDrive or a virus scanner reads it, so each move and each
removal tries again for a few seconds. Windows can also mark a folder read-only, as it marks the folders of a vault in
OneDrive. Such a folder moves, but it cannot be removed while it has the mark, so `remove_folder` takes the mark away
first.
"""

from __future__ import annotations

import os
import shutil
import stat
import sys
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

#: How long a move or a removal tries again when Windows holds a file, in seconds.
HELD_FILE_WAIT = 5.0
#: The time between two tries, in seconds.
HELD_FILE_PAUSE = 0.1


def again_when_held(action: Callable[[], object]) -> None:
    """Does `action`. While Windows holds a file (`PermissionError`), it tries again for `HELD_FILE_WAIT` seconds."""
    end = time.monotonic() + HELD_FILE_WAIT
    while True:
        try:
            action()
            return
        except PermissionError:
            if time.monotonic() >= end:
                raise
            time.sleep(HELD_FILE_PAUSE)


def remove_folder(folder: Path) -> None:
    """Removes `folder` and everything in it, also a folder or a file that Windows marks read-only."""

    def without_read_only_mark(function: Callable[[str], object], path: str, error: BaseException) -> None:
        if os.name != "nt" or not isinstance(error, PermissionError):
            raise error
        os.chmod(path, stat.S_IWRITE)
        function(path)

    if sys.version_info >= (3, 12):
        shutil.rmtree(folder, onexc=without_read_only_mark)
    else:
        shutil.rmtree(folder, onerror=lambda function, path, info: without_read_only_mark(function, path, info[1]))


def aside_folder(built: Path) -> Path:
    """Where the old book folder waits while the new book folder `built` takes its place."""
    return built.with_name(f"{built.name}.replaced")


def _say(sentence: str) -> None:
    print(f"[!] {sentence}", file=sys.stderr, flush=True)


def _write_file(path: Path, data: bytes) -> None:
    with open(path, "wb") as file:
        file.write(data)
        file.flush()
        os.fsync(file.fileno())


class VaultChanges:
    """New texts of vault files, files to remove, and a new book folder, which go in all together or not at all."""

    def __init__(self) -> None:
        self.folder: Optional[Tuple[Path, Path]] = None
        self.texts: Dict[Path, str] = {}
        self.removals: List[Path] = []
        self.aside: Optional[Path] = None

    def replace_folder(self, built: Path, folder: Path) -> None:
        """Puts the folder `built` in the place of `folder`. The old folder waits next to `built` until the end."""
        self.folder = (built, folder)

    def write(self, path: Path, text: str) -> None:
        """Gives the file `path` the text `text` as it is, with its own line endings."""
        self.texts[path] = text

    def remove(self, path: Path) -> None:
        """Removes the file `path` when every other change is in. Only for a file whose text another file has now."""
        self.removals.append(path)

    def carry_out(self) -> None:
        """Puts every change in place, or none of them (see the text of this module)."""
        undo: List[Tuple[str, Callable[[], object]]] = []
        new_folders: List[Path] = []
        temporary: List[Tuple[Path, Path, Optional[bytes]]] = []
        try:
            for path, text in self.texts.items():
                before = path.read_bytes() if path.exists() else None
                _make_folders(path.parent, new_folders)
                temp = path.with_name(f".{path.name}.importing-{os.getpid()}")
                temporary.append((temp, path, before))
                _write_file(temp, text.encode("utf-8"))
            if self.folder is not None:
                self._replace_folder(*self.folder, undo, new_folders)
            for temp, path, before in temporary:
                again_when_held(lambda: os.replace(temp, path))
                undo.append((str(path), lambda path=path, before=before: _put_back(path, before)))
        except BaseException:
            for what, action in reversed(undo):
                try:
                    action()
                except OSError as error:
                    _say(f"The import could not put back {what} ({error}).")
            for temp, _, _ in temporary:
                temp.unlink(missing_ok=True)
            for folder in reversed(new_folders):
                try:
                    folder.rmdir()
                except OSError:
                    pass  # the folder is not empty
            raise
        self._clean_up()

    def _replace_folder(
        self, built: Path, folder: Path, undo: List[Tuple[str, Callable[[], object]]], new_folders: List[Path]
    ) -> None:
        if folder.exists():
            aside = aside_folder(built)
            _rename(folder, aside)
            undo.append((f"the book folder {folder} from {aside}", lambda: _rename(aside, folder)))
            self.aside = aside
        _make_folders(folder.parent, new_folders)
        _rename(built, folder)
        undo.append((f"the book folder {folder}", lambda: _rename(folder, built)))

    def _clean_up(self) -> None:
        for path in self.removals:
            try:
                again_when_held(lambda: path.unlink(missing_ok=True))
            except OSError as error:
                _say(f"{path} could not be removed ({error}). Its text is in another file too.")
        aside = self.aside
        if aside is not None:
            try:
                again_when_held(lambda: remove_folder(aside) if aside.exists() else None)
            except OSError as error:
                _say(f"The book folder from before the import is still in {aside}. It could not be removed ({error}).")


def _rename(source: Path, target: Path) -> None:
    again_when_held(lambda: os.rename(source, target))


def _make_folders(folder: Path, new_folders: List[Path]) -> None:
    """Makes `folder` and the folders above it that are not there, and notes each one that it made."""
    missing = [folder, *folder.parents]
    for parent in reversed([path for path in missing if not path.exists()]):
        parent.mkdir()
        new_folders.append(parent)


def _put_back(path: Path, before: Optional[bytes]) -> None:
    """Gives the file `path` its bytes from before the import again, or removes it when it was not there."""
    if before is None:
        again_when_held(lambda: path.unlink(missing_ok=True))
        return
    temp = path.with_name(f".{path.name}.putting-back-{os.getpid()}")
    try:
        _write_file(temp, before)
        again_when_held(lambda: os.replace(temp, path))
    finally:
        temp.unlink(missing_ok=True)
