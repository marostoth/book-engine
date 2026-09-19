# Feature Specification: The vocabulary bank

**Status:** implemented
**Written:** 2026-09-19
**Closes:** [RD-10](../../review/2026-09-14-findings.md#rd-10)

A reader can already save a word while reading. Nothing in the program ever shows a saved word again. This
feature gives the saved words a place on the screen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read back the words I saved (Priority: P1)

A reader meets an unfamiliar word, looks it up and saves it. Days later they want to see every word they
saved in this book, read the meaning again, and go back to the sentence where they met it.

**Why this priority:** saving already works and reading back does not exist at all. This story is the whole
point of the feature. Shipped alone, it is useful.

**Independent Test:** save three words in one book, open the saved words, and see all three with their
meanings.

**Acceptance Scenarios:**

1. **Given** a book with saved words, **When** the reader opens the saved words, **Then** every saved word is
   listed with its meaning and the chapter it was read in.
2. **Given** the saved words are on screen, **When** the reader picks one, **Then** the book opens at the
   paragraph where that word was saved.
3. **Given** a book with no saved words, **When** the reader looks for them, **Then** the screen says so in
   plain words and does not look broken.
4. **Given** a book with saved words, highlights and notes, **When** the reader asks for words only, **Then**
   only the words are listed, and the count of each kind is on screen.

### User Story 2 - The list is up to date while I read (Priority: P2)

A reader has the saved words open beside the text. They save one more word.

**Why this priority:** without it the reader must close and reopen the list to see the word they just saved,
which reads as a bug even though nothing is lost.

**Independent Test:** open the saved words, save a new word, and see it appear without closing anything.

**Acceptance Scenarios:**

1. **Given** the saved words are on screen, **When** the reader saves another word, **Then** the new word
   appears in the list without the reader reopening it.
2. **Given** a word is already saved, **When** the reader saves it again, **Then** the list still shows it
   once.

### Edge Cases

- A word saved by an older version of the program has no chapter. It must still be listed, under a group that
  says the chapter is not known, and it must not pretend to point at the first paragraph of a chapter.
- A word saved without a paragraph mark is listed, and picking it opens the chapter without jumping.
- A word whose chapter was removed from the book since it was saved is still listed, and picking it does not
  break the reader.
- The file of saved words is damaged. The reader is told the words could not be read. An empty list must never
  be shown in place of a damaged file, because that reads as "you saved nothing".
- A reader searches the list. The search must match the word and its meaning, not only the word.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The program MUST be able to ask for every word saved in a book and show it to the reader.
- **FR-002**: Every saved word MUST be shown with its meaning, its chapter and, when it is known, the
  paragraph it was read at.
- **FR-003**: Picking a saved word MUST open that chapter, at that paragraph when one is known.
- **FR-004**: The reader MUST be able to list words only, and MUST be able to see how many words are saved.
- **FR-005**: The reader MUST be able to search the saved words by the word and by its meaning.
- **FR-006**: A word saved while the list is on screen MUST appear in the list without the reader reopening
  it.
- **FR-007**: A saved word with no chapter MUST be listed in a group that says the chapter is not known.
- **FR-008**: A damaged file of saved words MUST be reported to the reader, and MUST NOT be shown as an empty
  list.
- **FR-009**: The list MUST reach the reader from the same place their highlights and notes already do. No new
  button in the top bar.
- **FR-010**: The button that saves a word MUST say where the word is going in plain words, not by naming a
  file on disk.

### Key Entities *(include if feature involves data)*

- **A saved word**: the word as spelled, its meaning, the chapter it was read in, the paragraph it was read
  at, and the time it was saved. The last three may be empty for a word saved by an older version.
- **A book's saved words**: all the saved words of one book, held together. A word belongs to one book. The
  same word saved in two books is two saved words.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can go from reading a chapter to seeing every word they saved in that book in 2 clicks.
- **SC-002**: A reader can go from a word in the list back to the paragraph it was read at in 1 click.
- **SC-003**: 0 saved words are unreachable from the screen. Before this feature, the number was every one of
  them.
- **SC-004**: Every one of the 5 edge cases above has a test that fails if the case is handled wrongly.

## Assumptions

- The reader wants their saved words grouped by chapter, in reading order, the same way their highlights and
  notes already are. A separate ordering for words would be a second thing to learn.
- A saved word is worth reading again next to the highlight and the note from the same paragraph, so all three
  belong on one screen rather than on three.
- The words are already safe on disk. This feature reads them; it changes nothing about how they are written.

## Out of Scope

- Practising the saved words. A saved word is not a practice card, and turning one into a card would decide a
  question that [decision 0002](../../decisions/0002-practice-items-are-extractive-only.md) settles for
  practice items.
- Putting the saved words in the exported summary of a book.
- Deleting or editing a saved word.
- Looking a saved word up again, or filling in a meaning that was empty when the word was saved.
- Searching saved words across every book at once.
