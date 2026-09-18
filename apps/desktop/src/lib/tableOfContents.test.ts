import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChapterMeta, TOCItem } from "./types.ts";
import { contentsOpenChapters, contentsTarget } from "./tableOfContents.ts";

function chapter(order: number, title: string): ChapterMeta {
  const id = `ch-${String(order).padStart(2, "0")}`;
  return { id, title, file_path: `${id}.md`, order, word_count: 1000, anchor_count: 10, footnotes_count: 0 };
}

function entry(title: string, href: string, anchor: string | null = null, subitems: TOCItem[] = []): TOCItem {
  return { id: `${href}|${title}`, title, href, anchor, level: 1, subitems };
}

/** Where a click on the entry goes: "ch-07", "ch-07 ^p-012", or null for nothing. */
function opens(item: TOCItem, spine: ChapterMeta[]): string | null {
  const target = contentsTarget(item, spine);
  return target ? [target.chapter.id, target.anchor].filter(Boolean).join(" ") : null;
}

test("entries with the same chapter title open their own chapters", () => {
  // The Wealth of Nations starts every book again at "CHAPTER I."
  const spine = [chapter(4, "CHAPTER I."), chapter(16, "CHAPTER I."), chapter(26, "CHAPTER I.")];
  const contents = [
    entry("BOOK I.", "ch-03.md", null, [entry("CHAPTER I. OF THE DIVISION OF LABOUR.", "ch-04.md")]),
    entry("BOOK II.", "ch-15.md", null, [entry("CHAPTER I. OF THE DIVISION OF STOCK.", "ch-16.md")]),
    entry("BOOK IV.", "ch-25.md", null, [entry("CHAPTER I. OF THE PRINCIPLE OF THE COMMERCIAL OR MERCANTILE SYSTEM.", "ch-26.md")]),
  ];

  assert.deepEqual(
    contents.map((book) => opens(book.subitems![0], spine)),
    ["ch-04", "ch-16", "ch-26"]
  );
});

test("an entry inside a chapter opens that chapter, at the paragraph where the entry starts", () => {
  const spine = [
    chapter(21, "BOOK III. OF THE DIFFERENT PROGRESS OF OPULENCE IN DIFFERENT NATIONS"),
    chapter(35, "BOOK V. OF THE REVENUE OF THE SOVEREIGN OR COMMONWEALTH"),
  ];
  // Book III and its first chapter share one file. The parts of a chapter start at a paragraph inside it.
  const bookThree = entry(spine[0].title, "ch-21.md", null, [entry("CHAPTER I. OF THE NATURAL PROGRESS OF OPULENCE.", "ch-21.md")]);
  const justice = entry("PART II. Of the Expense of Justice", "ch-35.md", "^p-118");

  assert.equal(opens(bookThree, spine), "ch-21");
  assert.equal(opens(bookThree.subitems![0], spine), "ch-21");
  assert.equal(opens(justice, spine), "ch-35 ^p-118");
});

test("an entry with no chapter file opens its first sub-entry that has one, or nothing", () => {
  const spine = [chapter(1, "Chapter 1: Consistency Models"), chapter(2, "Chapter 2: State Machine Replication")];
  const part = entry("Part I: Foundations of Consensus", "", null, [
    entry("Chapter 1: Consistency Models", "ch-01.md"),
    entry("Chapter 2: State Machine Replication", "ch-02.md"),
  ]);
  // The import moved these notes into the chapters, so no chapter holds the entry
  const notes = entry("Notes and Citations", "");
  // A file that the book does not list
  const gone = entry("Chapter 9: Paxos", "ch-09.md");

  assert.equal(opens(part, spine), "ch-01");
  assert.equal(opens(notes, spine), null);
  assert.equal(opens(gone, spine), null);
});

test("the contents of a PDF book open the same chapters as before", () => {
  // A PDF import writes one entry for each chapter file, with the title of the chapter
  const spine = [chapter(1, "Cover"), chapter(2, "Preface"), chapter(3, "Chapter 1: Pilots"), chapter(4, "Chapter 10: Harbours")];
  const contents = spine.map((part) => entry(part.title, part.file_path));

  assert.deepEqual(
    contents.map((item) => opens(item, spine)),
    ["ch-01", "ch-02", "ch-03", "ch-04"]
  );
});

test("a book imported before the contents named chapter files shows its chapter list", () => {
  const spine = [chapter(3, "BOOK I."), chapter(4, "CHAPTER I.")];
  // The links of the EPUB contents, which name source documents that the vault does not have
  const oldContents = [
    entry("BOOK I. OF THE CAUSES OF IMPROVEMENT", "7037588202012845946_3300-h-2.htm.xhtml#pgepubid00003", null, [
      entry("CHAPTER I. OF THE DIVISION OF LABOUR.", "7037588202012845946_3300-h-3.htm.xhtml#pgepubid00004"),
    ]),
  ];

  assert.equal(contentsOpenChapters(oldContents, spine), false);
  assert.equal(contentsOpenChapters([entry("BOOK I.", "ch-03.md")], spine), true);
  assert.equal(contentsOpenChapters([], spine), false);
});
