---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# A page is read in column order, not across the gap

## Context and Problem Statement

`pymupdf4llm` builds the markdown of a page from layout boxes and walks the spans of each box in the order they
sit in `box.textlines`, which is the order of their top edges. When the engine puts two different things into one
box, that order reads across the gap between them instead of down one side and then the other.

Measured on 2026-09-19 on the owner's two PDF books, with the code at `13be1c2`:

- **Kotler, 769 pages.** Six words came out glued: `consumPREVIEW`, `influPREVIEW`, `communiPREVIEW`,
  `marketPREVIEW` and `marPREVIEW` twice. A chapter opens with a `CHAPTER PREVIEW` label stacked at the left of
  the column and the paragraph beside it, so the engine gave CHAPTER, a line of the paragraph, then PREVIEW. The
  label's second word landed inside a word the layout had cut in two, and the rest of that word arrived as a
  paragraph of its own.
- **A second shape the finding never named.** The big first letter of a story stands to the left of its first
  three lines, so the engine put it after them and the story opened with `ou` instead of `You`.
- **Dalton, 370 pages.** Its index is two columns, and the engine read across them: an entry of the A column,
  then one of the B column, then the next A. Counted as steps backwards in the alphabet down one page: 19.

Two hand-written repairs live in `ingest/pdf_sanitizer.py` because of this fault, and one of them is worse than
the fault. `clean_chapter_markdown` **deletes** the word CHAPTER whenever a capitalised word follows it on the
same line, which is exactly the shape a run-in label makes; it took a real word out of twelve chapters.
`heal_drop_caps` rule 3 hunts a capital letter in the first 350 characters of a paragraph and moves it to the
front, carrying a list of place-name stems so that it does not eat a real name. On page 121 it put an `N` on a
paragraph that begins `ou`, so the book read `Nou've` where the author wrote `You've`.

## Decision Drivers

- A word the book never wrote must never appear in a chapter file. A guess that is usually right is not good
  enough for the one permanent record the reader studies from.
- The fix must be invisible on every page it does not apply to. A change to the markdown of a page moves its
  paragraphs, and every anchor, note, highlight and bookmark the reader has made hangs off those paragraphs.
- No rule may name a book, a page or a phrase. IN-10 took two such rules out of `ingest/layout_stitcher.py`, and
  putting the same kind back in a different file would be the same mistake with a new address.
- A reading order can only be decided from what the PDF itself holds, because the engine's own answer is the
  thing being corrected.

## Considered Options

1. **Reorder the spans of each layout box between reading the page and writing the markdown**, using a gap that
   neither a span nor a block of the PDF crosses.
2. **Build the markdown from `page.get_text("blocks")` and order the blocks by hand**, which is what the review
   finding suggested.
3. **Repair the damage in the markdown afterwards**, by spotting a glued word and pulling it apart.
4. **Leave it, and keep the two repairs in the sanitizer.**

## Decision Outcome

Chosen: **option 1**, in `ingest/reading_order.py`. Inside a layout box, find a vertical gap that no span crosses
and that no block of the PDF crosses either, with content on both sides of it that shares some height. Read
everything left of the gap, then everything right of it, and look at each side again in case it holds a gap of its
own. Then let the library write the markdown as it always did.

**Option 2 was rejected because it throws away everything else the library does.** The markdown of a chapter
carries headings, pictures, tables, bold and italic, and the outline that `ingest/pdf_outline.py` reads. Ordering
raw blocks by hand means writing all of that again, and the fault is one step of the work, not all of it.

**Option 3 was rejected because the information needed is already gone.** By the time the markdown exists there
are no rectangles left, so a repair can only guess where a word was cut. That is what `heal_drop_caps` rule 3
does, and it is the rule that wrote `Nou've`.

**Option 4 was rejected because one of the repairs deletes a real word**, and the other one invents a letter. The
two of them together left `ers` standing as its own paragraph anyway.

**The PDF's own blocks carry the weight of the rule, and the first version of it was wrong without them.** A gap
that no *span* crosses is not enough: page 77 of Mind Over Markets holds a line whose every word is a span of its
own, and the 4.1-point space before its seventh word is exactly as wide as the space beside a drop cap. The first
rule read that space as a column and gave "Which way is the market trying", then a word from the line below, then
"to go". A column never cuts a block of the PDF in half, so a gap that does is not a column.

**The widest gap is not the right gap either.** On the Dalton index the widest gap on the page stands in front of
the page number at the far right, not between the two columns of entries. Splitting only at the widest gap moved
that number and left the columns interleaved. So each side of a gap is looked at again, which finds a column
inside a column.

### Consequences

Good:

- **Four of the six glued words are gone** (pages 121, 193, 515, 549), and the cut words behind them are joined
  again by `ingest/layout_stitcher.py`, which could not reach them before because a label stood in the way.
- **The drop cap of page 121 now reads `You've` instead of `Nou've`.** The letter comes from the page instead of
  from a guess.
- **The index of Mind Over Markets reads down one column and then the other**: steps backwards in the alphabet
  went from 19 to 6, and the six that are left are sub-entries, which begin with a small word by design.
- **Not one letter is lost anywhere in either book.** On the twelve pages whose text changed at all, every change
  is the same one: the word CHAPTER is kept once instead of being deleted.
- **113 of the 113 Kotler pages where no box moved come out byte for byte the same** as before.

Bad:

- **Two glued words are left** (pages 485 and 573), and three paragraphs still open with a bare word ending. This
  fault has more than one cause and this fixes one of them.
- **The two repairs in `ingest/pdf_sanitizer.py` stay.** They were measured after the fix over 130 pages: the
  run-in CHAPTER rule still fires twice, `heal_drop_caps` rule 2 seventeen times and rule 3 thirty-six times. The
  engine also puts two things in two boxes in the wrong order, which this rule cannot see, because it only ever
  looks inside one box.
- **This module reaches inside `pymupdf4llm`.** `parse_document`, `ParsedDocument.to_markdown`, `LayoutBox` and
  the keys of a span are not a published interface. `packages/ingestion/requirements.lock` pins the version, and
  a test says what the pin is protecting.
- **The fault cannot be built in a test.** Two PDFs were written to reproduce it, a label beside a paragraph and a
  page of two columns, and the engine put both of them in the right order on its own. So the rule is proved
  against the rectangles those real pages have, written down with the page they came from.
- **Fifty-three of the ninety-nine boxes that move are pictures**, whose text the sanitizer strips, so moving
  them changes no book. They are not skipped, because a rule with an exception in it is a rule with a hole in it.

Two faults of the library were found while measuring this and are **not** fixed here. `ParsedDocument.to_markdown`
is not safe to call twice on one parse: on Kotler page 55 every call adds 1,160 letters to the answer, which is
why this code writes the markdown once and the measuring scripts read each page again. And 228 spans of that book
sit in two layout boxes at once, so their words are written out twice.

### Confirmation

`packages/ingestion/tests/test_a_page_is_read_in_column_order.py` holds 46 tests. Three of them would fail if
this decision were quietly reversed:

- `test_the_label_is_read_before_the_paragraph_it_stood_beside` fails when the order goes back to the top edge.
- `test_a_space_between_two_words_of_one_block_is_not_a_gap_between_two_columns` fails when the block test goes,
  which is the version of the rule that broke a sentence.
- `test_a_page_with_nothing_side_by_side_gives_exactly_what_the_library_gives` fails when this path stops
  agreeing with `pymupdf4llm.to_markdown` on a page it should not touch.

`test_the_markdown_step_walks_the_lines_in_the_order_the_box_holds_them` turns one box's lines around and asks
the library to write them out, so a new version that sorted them again would fail here instead of making every
other test pass while the fix did nothing.

`tests/test_glyph_repair.py::test_the_import_repairs_the_character_maps_before_it_reads_any_text` counts the call
to `to_markdown_in_reading_order` in `ingest/pdf_parser.py` and fails when it is not there exactly once.

## More Information

The review finding is CQ-07 in `docs/review/2026-09-14-findings.md`. Its "How to fix" is stale in two ways: the
two hand-written rules it says to remove were already removed by IN-10, and the rules that remain are in
`ingest/pdf_sanitizer.py` and are still needed.

Related: [0001](0001-the-vault-is-the-only-permanent-record.md), because a chapter file is part of that record.
