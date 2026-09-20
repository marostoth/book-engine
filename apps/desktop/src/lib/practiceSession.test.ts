import { test } from "vitest";
import assert from "node:assert/strict";
import type { PracticeCardItem } from "./practiceTypes.ts";
import {
  currentSessionCard,
  deckName,
  recordSessionReview,
  scramblePieces,
  startSession,
  syncSession,
} from "./practiceSession.ts";

const makeCards = (count: number): PracticeCardItem[] =>
  Array.from({ length: count }, (_, i): PracticeCardItem => ({
    card_id: `card-${i + 1}`,
    book_id: "sample",
    chapter_file: "ch-01.md",
    anchor: `^p-${String(i + 1).padStart(3, "0")}`,
    item_type: "cloze",
    prompt: "The {{c1::answer}} is here.",
    answer: "answer",
    state: 0,
    stability: 0,
    difficulty: 0,
    due: 0,
    last_review: 0,
    reps: 0,
  }));

// Plays one window session the way the app runs it: rate the shown card, let usePracticeDeck
// remove it from the due list (Hard, Good, and Easy give interval_days >= 1), then pass the
// new list back to the window, which syncs its session.
function playSession(initialDueCards: PracticeCardItem[], rating: number, limit?: number) {
  let dueCards = initialDueCards;
  let session = syncSession(startSession([]), dueCards, limit);
  const shown: string[] = [];
  for (let card = currentSessionCard(session); card; card = currentSessionCard(session)) {
    const cardId = card.card_id;
    shown.push(cardId);
    session = recordSessionReview(session, cardId, rating);
    dueCards = dueCards.filter((c) => c.card_id !== cardId);
    session = syncSession(session, dueCards, limit);
  }
  return { session, shown, dueCards };
}

test("rating 20 due cards Good shows all 20 cards, then completes", () => {
  const cards = makeCards(20);
  const { session, shown, dueCards } = playSession(cards, 3);
  assert.deepStrictEqual(shown, cards.map((card) => card.card_id));
  assert.equal(session.completed, true);
  assert.equal(session.reviews.length, 20);
  assert.equal(dueCards.length, 0);
});

test("gatekeeper with 2 due cards and quota 3 shows both cards", () => {
  const { session, shown } = playSession(makeCards(2), 3, 3);
  assert.deepStrictEqual(shown, ["card-1", "card-2"]);
  assert.equal(session.completed, true);
});

test("gatekeeper keeps its first quota cards while the due list shrinks", () => {
  const { shown } = playSession(makeCards(5), 4, 3);
  assert.deepStrictEqual(shown, ["card-1", "card-2", "card-3"]);
});

test("cards that load after the window opens are used until the first rating", () => {
  let session = syncSession(startSession([]), []);
  assert.equal(currentSessionCard(session), undefined);
  session = syncSession(session, makeCards(2));
  assert.equal(currentSessionCard(session)?.card_id, "card-1");
});

test("reopening the window starts a new session with the cards due now", () => {
  const finished = playSession(makeCards(3), 3).session;
  assert.equal(finished.completed, true);
  // Closing the window resets the session to startSession([]); opening syncs it again.
  const reopened = syncSession(startSession([]), makeCards(2));
  assert.equal(reopened.completed, false);
  assert.deepStrictEqual(reopened.reviews, []);
  assert.equal(currentSessionCard(reopened)?.card_id, "card-1");
});

test("a rating for a card that is not shown leaves the session unchanged", () => {
  const session = startSession(makeCards(2));
  assert.equal(recordSessionReview(session, "card-2", 3), session);
});

// --------------------------------------------------------------- TL-11: the puzzle and the name of a deck

test("a prompt written with pipes is cut at them", () => {
  const pieces = scramblePieces("the first part|the second part|the third part");
  assert.equal(pieces.length, 3, "the pipes are the author's own cuts and must be the ones used");
  assert.deepEqual([...pieces].sort(), ["the first part", "the second part", "the third part"]);
});

test("a prompt with no pipes is cut at its commas and semicolons", () => {
  const pieces = scramblePieces("one thing, another thing; a third");
  assert.deepEqual([...pieces].sort(), ["a third", "another thing", "one thing"]);
});

test("a prompt with no punctuation at all is cut into runs of three words", () => {
  const pieces = scramblePieces("one two three four five six seven");
  assert.equal(pieces.length, 3, "seven words make two whole runs of three and one of one");
  assert.deepEqual([...pieces].sort(), ["four five six", "one two three", "seven"]);
});

test("the pieces of a scramble are shuffled, and the same prompt always gives the same puzzle", () => {
  const prompt = "alpha|bravo|charlie|delta";
  const once = scramblePieces(prompt);
  assert.notDeepEqual(once, ["alpha", "bravo", "charlie", "delta"], "the answer is handed to the reader in order");
  assert.deepEqual(once, scramblePieces(prompt), "the pieces move under the reader's hand on every redraw");
});

test("an empty piece is dropped, so no blank tile is shown", () => {
  assert.deepEqual(scramblePieces("one||two").sort(), ["one", "two"]);
});

test("two decks holding different cards are named apart", () => {
  assert.notEqual(deckName(makeCards(2)), deckName(makeCards(3)), "a new deck reads as the deck before it");
});

test("two lists holding the same cards are the same deck", () => {
  assert.equal(
    deckName(makeCards(3)),
    deckName(makeCards(3)),
    "a fresh list of the same cards reads as a new deck, so the window starts its session over for nothing"
  );
});

test("the same cards in another order are another deck", () => {
  const cards = makeCards(3);
  assert.notEqual(deckName(cards), deckName([...cards].reverse()), "the order the reader walks the cards in is lost");
});

test("no deck at all has a name, and it is not the name of a deck with cards in it", () => {
  assert.notEqual(deckName([]), deckName(makeCards(1)));
});
