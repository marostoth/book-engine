"""A new import keeps the reader's files on the text that they point to (IN-04).

A chapter file is numbered by its place in the book (`ch-01.md`), and a paragraph by its place in its chapter
(`^p-001`). A new import of a changed book, or of the same book after a fix of the import, can give a chapter or a
paragraph another number. A new import of the Dalton PDF, for example, keeps the front matter as parts of their own
since IN-01, so every chapter moves up by 4. The reader's own files kept the old numbers, so they pointed at other text.

So a replacing import reads the chapters of the book before it writes anything (`read_book_text`). When it has built
the new chapters, it finds each old paragraph in the new text (`NewPlaces`), and it moves what the reader's files point
to (`reader_moves`). The moves go into the vault together with the new book, or not at all (`ingest.book_build`, IN-05):

- `bookmark.json`: the chapter file and the paragraph;
- `reading.jsonl`: the chapter file of each line;
- `<chapter>-notes.md` and `<chapter>-highlights.json`: the file name, and each paragraph anchor in them;
- `analytical.json`, and the citations of the book in `vault/syntopicon/topics/*.json`: the chapter file and the
  paragraph of each citation.

A paragraph is found by its letters and digits, so a fix that splits two words that ran together changes nothing. The
paragraphs of the two texts are paired in book order. A changed paragraph pairs with a new one that has much the same
words, or that holds its words or is held in them: a paragraph that the new import joins with the next one, or cuts in
two. A reference to a paragraph whose text the new import does not have goes to the nearest paragraph before it, and the
import names it. `vocabulary.json` names no chapter, so it stays as it is. A report, such as `summary-export.md`, is
made again when it is exported.
"""

from __future__ import annotations

import copy
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from ingest.anchors import ANCHOR_REGEX, clean_preview_text
from ingest.line_endings import normalize_line_endings
from ingest.vault_changes import VaultChanges

#: How much alike the words of an old and a new paragraph must be for one paragraph that a fix or an edition changed.
SIMILAR = 0.6
#: A paragraph that holds all the letters and digits of another one is that paragraph, when both have this many.
SHORTEST_PART = 16
#: A changed stretch with more pairs of paragraphs than this looks for each paragraph among the next `WINDOW` only.
MOST_PAIRS = 40_000
WINDOW = 64

CHAPTER_FILE = re.compile(r"^ch-\d{2,}\.md$")
NOTES_FILE = re.compile(r"^(ch-\d{2,})-notes\.md$")
HIGHLIGHTS_FILE = re.compile(r"^(ch-\d{2,})-highlights\.json$")
# A paragraph anchor in the text of a notes file: `^p-012`, or the `§p-012` that the reader shows
ANCHOR_IN_TEXT = re.compile(r"([\^§])(p-\d{3,})(?![\w-])")


@dataclass(frozen=True)
class Paragraph:
    chapter_file: str
    anchor: str
    #: The letters and digits of the text in lower case, so a space or a mark that a fix changed does not count.
    words: str


@dataclass
class BookText:
    """The chapter files of a book in book order, their titles, and every paragraph with an anchor."""

    chapter_files: List[str]
    titles: Dict[str, str]
    paragraphs: List[Paragraph]


@dataclass(frozen=True)
class Place:
    """Where a chapter or a paragraph of the old text is in the new text."""

    chapter_file: str
    anchor: Optional[str] = None
    #: True when the new text does not have the old text, so this is the nearest place that it has.
    near: bool = False


def words_of(block: str) -> str:
    """The letters and digits of a block in lower case. A picture has none, so its file name counts."""
    words = re.sub(r"[\W_]+", "", clean_preview_text(block).casefold())
    return words or re.sub(r"[\W_]+", "", ANCHOR_REGEX.sub("", block).casefold())


def read_book_text(book_dir: Path) -> Optional[BookText]:
    """The chapters and paragraphs of the book in `book_dir`, or None with no book or no readable `_meta.json`."""
    meta_path = Path(book_dir) / "_meta.json"
    try:
        spine = json.loads(meta_path.read_text(encoding="utf-8"))["spine"]
        chapters = [(str(chapter["file_path"]), str(chapter.get("title") or "")) for chapter in spine]
    except FileNotFoundError:
        return None
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(
            f"[!] {meta_path} cannot be read ({error}), so the import cannot move what your files for it point to.",
            file=sys.stderr,
            flush=True,
        )
        return None

    paragraphs: List[Paragraph] = []
    for chapter_file, _ in chapters:
        try:
            text = normalize_line_endings((Path(book_dir) / chapter_file).read_bytes().decode("utf-8"))
        except (OSError, UnicodeDecodeError):
            continue
        for block in (block.strip() for block in text.split("\n\n")):
            anchor = ANCHOR_REGEX.search(block)
            if block and not block.startswith("#") and anchor:
                paragraphs.append(Paragraph(chapter_file, anchor.group(0).strip(), words_of(block)))
    return BookText([file for file, _ in chapters], dict(chapters), paragraphs)


def _likeness(old_words: str, new_words: str) -> float:
    """1.0 when one paragraph holds the other, else how much alike their words are."""
    if not old_words or not new_words:
        return 0.0
    if min(len(old_words), len(new_words)) >= SHORTEST_PART and (old_words in new_words or new_words in old_words):
        return 1.0
    matcher = SequenceMatcher(None, old_words, new_words)
    if matcher.real_quick_ratio() < SIMILAR or matcher.quick_ratio() < SIMILAR:
        return 0.0
    return matcher.ratio()


def _pair_changed(old: List[Paragraph], new: List[Paragraph], old_range: range, new_range: range) -> Dict[int, int]:
    """Pairs the paragraphs of a changed stretch of the book in book order. Two old paragraphs can pair with the one new
    paragraph that joins them."""
    pairs: Dict[int, int] = {}
    everywhere = len(old_range) * len(new_range) <= MOST_PAIRS
    start = 0
    for i in old_range:
        end = len(new_range) if everywhere else min(len(new_range), start + WINDOW)
        best: Optional[int] = None
        best_likeness = 0.0
        for k in range(start, end):
            likeness = _likeness(old[i].words, new[new_range[k]].words)
            if likeness >= SIMILAR and likeness > best_likeness:
                best, best_likeness = k, likeness
                if likeness == 1.0:
                    break
        if best is not None:
            pairs[i] = new_range[best]
            start = best
    return pairs


def _pair_paragraphs(old: List[Paragraph], new: List[Paragraph]) -> Dict[int, int]:
    """The place in `new` of each paragraph of `old` that the new text still has."""
    pairs: Dict[int, int] = {}
    matcher = SequenceMatcher(None, [p.words for p in old], [p.words for p in new], autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            pairs.update(zip(range(i1, i2), range(j1, j2)))
        elif tag == "replace":
            pairs.update(_pair_changed(old, new, range(i1, i2), range(j1, j2)))

    # A paragraph that went to another part of the book, such as a chapter in another place
    old_count = Counter(p.words for p in old)
    new_count = Counter(p.words for p in new)
    only_once = {p.words: j for j, p in enumerate(new) if new_count[p.words] == 1}
    paired = set(pairs.values())
    for i, paragraph in enumerate(old):
        j = only_once.get(paragraph.words)
        if i not in pairs and j is not None and j not in paired and old_count[paragraph.words] == 1:
            pairs[i] = j
    return pairs


class NewPlaces:
    """Where each chapter and each paragraph of an old text is in a new text of the same book."""

    def __init__(self, old: BookText, new: BookText) -> None:
        pairs = _pair_paragraphs(old.paragraphs, new.paragraphs)
        #: False when the old text has paragraphs and the new text has none of them.
        self.found_text = bool(pairs) or not old.paragraphs
        self.chapters = _chapter_places(old, new, pairs)
        self.paragraphs = _paragraph_places(old, new, pairs, self.chapters)

    def of_chapter(self, chapter_file: str) -> Optional[Place]:
        """The new place of an old chapter file, or None when the old text has no such chapter."""
        return self.chapters.get(chapter_file)

    def of(self, chapter_file: str, anchor: Optional[str]) -> Optional[Place]:
        """The new place of a paragraph. An anchor that the old chapter does not have stays, and its chapter moves."""
        place = self.paragraphs.get((chapter_file, anchor)) if anchor else None
        if place is not None:
            return place
        chapter = self.chapters.get(chapter_file)
        return Place(chapter.chapter_file, anchor, chapter.near) if chapter else None

    def moves_nothing(self) -> bool:
        return all(place == Place(chapter) for chapter, place in self.chapters.items()) and all(
            place == Place(chapter, anchor) for (chapter, anchor), place in self.paragraphs.items()
        )


def _chapter_places(old: BookText, new: BookText, pairs: Dict[int, int]) -> Dict[str, Place]:
    """Each old chapter goes to the new chapter that holds most of its paragraphs, or that has its title."""
    votes: Dict[str, Counter] = {chapter: Counter() for chapter in old.chapter_files}
    for i, j in pairs.items():
        votes[old.paragraphs[i].chapter_file][new.paragraphs[j].chapter_file] += 1
    order = {chapter: n for n, chapter in enumerate(new.chapter_files)}

    places: Dict[str, Place] = {}
    for chapter in old.chapter_files:
        if votes[chapter]:
            places[chapter] = Place(max(votes[chapter], key=lambda c: (votes[chapter][c], -order[c])))
            continue
        title = old.titles.get(chapter, "").casefold()
        same_title = [c for c in new.chapter_files if title and new.titles.get(c, "").casefold() == title]
        if len(same_title) == 1:
            places[chapter] = Place(same_title[0])

    # A chapter whose text and title the new text does not have goes with the chapter before it, or after it
    found = dict(places)
    for n, chapter in enumerate(old.chapter_files):
        if chapter not in found:
            before = (found[c] for c in reversed(old.chapter_files[:n]) if c in found)
            after = (found[c] for c in old.chapter_files[n + 1 :] if c in found)
            nearest = next(before, None) or next(after, None)
            if nearest is not None:
                places[chapter] = Place(nearest.chapter_file, near=True)
    return places


def _paragraph_places(
    old: BookText, new: BookText, pairs: Dict[int, int], chapters: Dict[str, Place]
) -> Dict[Tuple[str, str], Place]:
    """Each old paragraph goes to its new paragraph, or near its text.

    Near is the nearest paragraph before it in its chapter, or else after it. A chapter that the new text has only by
    its title gives its first paragraph. A paragraph of a chapter whose text is all gone goes to the nearest paragraph
    before it in the book, or else after it.
    """
    places: Dict[Tuple[str, str], Place] = {}
    for i, j in pairs.items():
        places[(old.paragraphs[i].chapter_file, old.paragraphs[i].anchor)] = Place(
            new.paragraphs[j].chapter_file, new.paragraphs[j].anchor
        )
    first_anchor: Dict[str, str] = {}
    for paragraph in new.paragraphs:
        first_anchor.setdefault(paragraph.chapter_file, paragraph.anchor)
    keys = [(paragraph.chapter_file, paragraph.anchor) for paragraph in old.paragraphs]

    # The old chapter and the new place of the nearest paragraph before and after each paragraph that has a place
    found = dict(places)
    before: List[Optional[Tuple[str, Place]]] = []
    last: Optional[Tuple[str, Place]] = None
    for key in keys:
        before.append(last)
        last = (key[0], found[key]) if key in found else last
    after: List[Optional[Tuple[str, Place]]] = []
    last = None
    for key in reversed(keys):
        after.append(last)
        last = (key[0], found[key]) if key in found else last
    after.reverse()

    for n, key in enumerate(keys):
        if key in found:
            continue
        chapter = chapters.get(key[0])
        in_chapter = [nearest for nearest in (before[n], after[n]) if nearest is not None and nearest[0] == key[0]]
        if in_chapter:
            nearest = in_chapter[0][1]
        elif chapter is not None and not chapter.near:
            nearest = Place(chapter.chapter_file, first_anchor.get(chapter.chapter_file))
        elif before[n] is not None or after[n] is not None:
            nearest = (before[n] or after[n])[1]
        else:
            continue
        places[key] = Place(nearest.chapter_file, nearest.anchor, near=True)
    return places


def _chapter_order(path: Path) -> Tuple[int, str]:
    number = re.match(r"ch-(\d+)", path.name)
    return (int(number.group(1)) if number else 0, path.name)


class ReaderMoves:
    """The new text of each file of the reader that changes, and what the import tells the reader about it."""

    def __init__(self, vault_dir: Path, book_id: str, places: NewPlaces) -> None:
        self.notes_dir = Path(vault_dir) / "notes" / book_id
        self.topics_dir = Path(vault_dir) / "syntopicon" / "topics"
        self.book_id = book_id
        self.places = places
        self.writes: Dict[Path, str] = {}
        self.removals: List[Path] = []
        self.changed: List[str] = []
        self.near: List[str] = []
        self.elsewhere: List[str] = []
        self.unreadable: List[str] = []
        self.stayed: List[str] = []

    def _name(self, path: Path) -> str:
        return path.name if path.parent == self.notes_dir else f"syntopicon/topics/{path.name}"

    def _read(self, path: Path) -> Optional[str]:
        try:
            return path.read_bytes().decode("utf-8")
        except (OSError, UnicodeDecodeError) as error:
            self.unreadable.append(f"{self._name(path)} ({error})")
            return None

    def _read_json(self, path: Path) -> Tuple[Optional[str], Any]:
        text = self._read(path)
        if text is None:
            return None, None
        try:
            return text, json.loads(text)
        except ValueError as error:
            self.unreadable.append(f"{self._name(path)} ({error})")
            return None, None

    def _note_near(self, place: Optional[Place], what: str) -> None:
        if place is not None and place.near and what not in self.near:
            self.near.append(what)

    def _change(self, path: Path, text: str, new_text: str) -> None:
        if new_text != text:
            self.writes[path] = new_text
            self.changed.append(self._name(path))

    def bookmark(self) -> None:
        path = self.notes_dir / "bookmark.json"
        text, bookmark = self._read_json(path) if path.is_file() else (None, None)
        if not isinstance(bookmark, dict) or not isinstance(bookmark.get("chapterFile"), str):
            return
        anchor = bookmark.get("anchor") if isinstance(bookmark.get("anchor"), str) else None
        place = self.places.of(bookmark["chapterFile"], anchor)
        if place is None:
            return
        self._note_near(place, f"bookmark.json {bookmark['chapterFile']} {anchor or ''}".rstrip())
        moved = {**bookmark, "chapterFile": place.chapter_file}
        if anchor is not None and place.anchor is not None:
            moved["anchor"] = place.anchor
        if moved != bookmark:
            self._change(path, text, json.dumps(moved, indent=2, ensure_ascii=False))

    def reading_log(self) -> None:
        path = self.notes_dir / "reading.jsonl"
        text = self._read(path) if path.is_file() else None
        if text is None:
            return
        lines = []
        for line in text.splitlines(keepends=True):
            body = line.rstrip("\r\n")
            try:
                reading = json.loads(body)
            except ValueError:
                reading = None
            if isinstance(reading, dict) and isinstance(reading.get("chapterFile"), str):
                place = self.places.of_chapter(reading["chapterFile"])
                self._note_near(place, f"reading.jsonl {reading['chapterFile']}")
                if place is not None and place.chapter_file != reading["chapterFile"]:
                    reading["chapterFile"] = place.chapter_file
                    line = json.dumps(reading, ensure_ascii=False, separators=(",", ":")) + line[len(body) :]
            lines.append(line)
        self._change(path, text, "".join(lines))

    def chapter_files(self) -> None:
        """The notes and the highlights of each chapter go to the files of its new chapter."""
        said = (len(self.near), len(self.elsewhere))
        notes: Dict[Path, List[Tuple[Path, str]]] = {}
        highlights: Dict[Path, List[Tuple[Path, List[Any]]]] = {}
        for path in sorted(self.notes_dir.iterdir(), key=_chapter_order):
            match = NOTES_FILE.match(path.name) or HIGHLIGHTS_FILE.match(path.name)
            chapter = f"{match.group(1)}.md" if match and path.is_file() else ""
            place = self.places.of_chapter(chapter) if chapter else None
            if place is None or not CHAPTER_FILE.match(place.chapter_file):
                continue
            if path.name.endswith("-notes.md"):
                self._notes(path, chapter, place, notes)
            else:
                self._highlights(path, chapter, place, highlights)

        # A file at a new name that no chapter of the old text names, such as a file of a chapter that an older import
        # had, keeps its own text first. When one of them cannot be read, no notes or highlights move at all, so no
        # text is written over and none is lost.
        sources = {source for parts in [*notes.values(), *highlights.values()] for source, _ in parts}
        kept: Dict[Path, Any] = {}
        for target in [*notes, *highlights]:
            if target in sources or not target.exists():
                continue
            text, value = self._read_json(target) if target.suffix == ".json" else (self._read(target), None)
            if text is None or (target.suffix == ".json" and not isinstance(value, list)):
                if text is not None:
                    self.unreadable.append(f"{target.name} (not a list of highlights)")
                del self.near[said[0] :], self.elsewhere[said[1] :]
                self.stayed.extend(source.name for source in sorted(sources, key=_chapter_order))
                return
            kept[target] = value if target.suffix == ".json" else text

        for target, parts in notes.items():
            texts = [text for _, text in parts]
            if target in kept:
                texts.insert(0, kept[target])
            joined = "\n\n".join(text.rstrip("\r\n") for text in texts) + "\n" if len(texts) > 1 else texts[0]
            self._put(target, parts, joined)
        for target, parts in highlights.items():
            items = [*kept.get(target, []), *(item for _, part in parts for item in part)]
            old = _json_or_none(self._read(target)) if target.exists() and target in sources else None
            if items != old:
                self._put(target, parts, json.dumps(items, indent=2, ensure_ascii=False))
        targets = set(notes) | set(highlights)
        self.removals.extend(sorted((source for source in sources if source not in targets), key=_chapter_order))

    def _put(self, target: Path, parts: List[Tuple[Path, Any]], text: str) -> None:
        """Writes `text` to `target` when it is new there, and names the files whose text went into it."""
        if target.exists() and self._read(target) == text:
            return
        names = list(dict.fromkeys(source.name for source, _ in parts))
        self.writes[target] = text
        self.changed.append(target.name if names == [target.name] else f"{', '.join(names)} (now {target.name})")

    def _notes(self, path: Path, chapter: str, place: Place, notes: Dict[Path, List[Tuple[Path, str]]]) -> None:
        text = self._read(path)
        if text is None:
            return
        self._note_near(place, path.name)

        def moved_anchor(match: re.Match) -> str:
            anchor = f"^{match.group(2)}"
            paragraph = self.places.paragraphs.get((chapter, anchor))
            if paragraph is None:
                return match.group(0)
            if paragraph.chapter_file != place.chapter_file:
                self.elsewhere.append(f"{path.name} {anchor} (now {paragraph.chapter_file} {paragraph.anchor})")
                return match.group(0)
            self._note_near(paragraph, f"{path.name} {anchor}")
            return match.group(1) + paragraph.anchor[1:]

        target = self.notes_dir / f"{place.chapter_file[:-3]}-notes.md"
        notes.setdefault(target, []).append((path, ANCHOR_IN_TEXT.sub(moved_anchor, text)))

    def _highlights(self, path: Path, chapter: str, place: Place, highlights: Dict[Path, list]) -> None:
        _, items = self._read_json(path)
        if not isinstance(items, list):
            if items is not None:
                self.unreadable.append(f"{path.name} (not a list of highlights)")
            return
        moved: Dict[Path, List[Any]] = {}
        for item in items:
            anchor = item.get("anchor") if isinstance(item, dict) and isinstance(item.get("anchor"), str) else None
            item_place = self.places.of(chapter, anchor) if anchor else place
            if not CHAPTER_FILE.match(item_place.chapter_file):
                item_place = place
            self._note_near(item_place, f"{path.name} {anchor or ''}".rstrip())
            if anchor is not None and item_place.anchor is not None:
                item = {**item, "anchor": item_place.anchor}
            moved.setdefault(self.notes_dir / f"{item_place.chapter_file[:-3]}-highlights.json", []).append(item)
        if not items:
            moved[self.notes_dir / f"{place.chapter_file[:-3]}-highlights.json"] = []
        for target, target_items in moved.items():
            highlights.setdefault(target, []).append((path, target_items))

    def citations(self, path: Path, book_id: Optional[str]) -> None:
        """Every citation in a JSON file: an object with `chapterFile` and `anchor`, of the book `book_id` if given."""
        text, data = self._read_json(path) if path.is_file() else (None, None)
        if text is None:
            return
        moved = copy.deepcopy(data)
        for citation in _objects(moved):
            if not (isinstance(citation.get("chapterFile"), str) and isinstance(citation.get("anchor"), str)):
                continue
            if book_id is not None and citation.get("bookId") != book_id:
                continue
            place = self.places.of(citation["chapterFile"], citation["anchor"])
            if place is not None:
                self._note_near(place, f"{self._name(path)} {citation['chapterFile']} {citation['anchor']}")
                citation["chapterFile"] = place.chapter_file
                citation["anchor"] = place.anchor or citation["anchor"]
        if moved != data:
            self._change(path, text, json.dumps(moved, indent=2, ensure_ascii=False))

    def add_to(self, changes: VaultChanges) -> None:
        """Gives every new text, and every file whose text went to another file, to `changes`. The texts go into the
        vault all together, and a moved file is removed only after that: a stop can leave a text twice, but never lose
        it."""
        for path, text in self.writes.items():
            changes.write(path, text)
        for path in self.removals:
            changes.remove(path)

    def tell(self) -> None:
        said = [
            (
                self.changed,
                f'The new import gave chapters or paragraphs of "{self.book_id}" other numbers. These files of yours '
                "now point to the same text",
            ),
            (
                self.near,
                f"The new import does not have the text of {len(self.near)} "
                f"{'place' if len(self.near) == 1 else 'places'} in your files, so each one points to the nearest "
                "paragraph now",
            ),
            (
                self.elsewhere,
                "These anchors in your notes name a paragraph that is in another chapter now, so they stay as they are",
            ),
            (self.unreadable, "These files cannot be read, so they stay as they are"),
            (self.stayed, "So these notes and highlights keep their chapter files, and nothing is written over them"),
        ]
        for names, sentence in said:
            if names:
                print(f"[!] {sentence}: {', '.join(names)}.", file=sys.stderr, flush=True)


def _json_or_none(text: Optional[str]) -> Any:
    try:
        return json.loads(text) if text is not None else None
    except ValueError:
        return None


def _objects(value: Any) -> Iterator[dict]:
    """Every JSON object in `value`, also inside lists and other objects."""
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from _objects(child)


def reader_moves(
    vault_dir: Path, book_id: str, old: Optional[BookText], new_book_dir: Optional[Path] = None
) -> Optional[ReaderMoves]:
    """What moves in the reader's files for a book, from the chapters and paragraphs of `old` to the same text in the
    new book, or None when nothing moves.

    `old` is `read_book_text` of the book before the import wrote anything: None for a new book. `new_book_dir` is the
    folder that holds the chapters and `_meta.json` of the new book: the build folder of the import, or else the book
    folder.
    """
    new = read_book_text(new_book_dir or Path(vault_dir) / "books" / book_id) if old is not None else None
    if old is None or new is None:
        return None
    places = NewPlaces(old, new)
    if not places.found_text:
        print(
            f'[!] The new import of "{book_id}" has none of the text of the book before it, so your files for it keep '
            "their chapters and paragraphs.",
            file=sys.stderr,
            flush=True,
        )
        return None
    if places.moves_nothing():
        return None

    moves = ReaderMoves(vault_dir, book_id, places)
    if moves.notes_dir.is_dir():
        moves.bookmark()
        moves.reading_log()
        moves.chapter_files()
        moves.citations(moves.notes_dir / "analytical.json", None)
    if moves.topics_dir.is_dir():
        for topic in sorted(moves.topics_dir.glob("*.json")):
            moves.citations(topic, book_id)
    return moves


def move_reader_files(vault_dir: Path, book_id: str, old: Optional[BookText]) -> None:
    """Moves what the reader's files for a book point to, from `old` to the same text in the book folder, and tells the
    reader about it. An import calls `reader_moves` in `ingest.book_build` instead, so the moves go in with the book."""
    moves = reader_moves(vault_dir, book_id, old)
    if moves is not None:
        changes = VaultChanges()
        moves.add_to(changes)
        changes.carry_out()
        moves.tell()
