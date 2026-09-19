import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { noteLine } from "./noteLine.ts";
import { quoteBlock } from "./notesQuote.ts";

/**
 * These are the same cases as `src-tauri/src/vault/notes_tests.rs`, in the same order, because the two readers must
 * answer the same for every one of them (RD-08). `packages/ingestion/tests/test_one_note_format.py` checks that
 * neither file drifts away from the other or from what `quoteBlock` writes.
 */

/** The quote line `quoteBlock` writes, character for character. */
const WRITTEN_QUOTE_LINE = '> "Price is the great communicator." (#^p-001)';

/** The empty prompt `quoteBlock` writes under it. The trailing space is real. */
const WRITTEN_PROMPT_LINE = "- Reflection: ";

const QUOTE_SHOWS = "Price is the great communicator.";
const QUOTE_ANCHOR = "^p-001";

describe("noteLine", () => {
  it("is fed exactly what quoteBlock writes", () => {
    const written = quoteBlock({ quote: "Price is the great communicator.", anchorId: "^p-001" });
    const lines = written.split("\n").filter((line) => line.trim());

    // The trailing space on the prompt line is real: `quoteBlock` writes `- Reflection: ` so the reader's cursor
    // lands after the colon. The first version of this test trimmed it and failed, which is the test working.
    assert.deepEqual(
      lines,
      [WRITTEN_QUOTE_LINE, WRITTEN_PROMPT_LINE],
      "the writer changed shape, so every case below is now testing a format nothing writes"
    );
  });

  it("shows the quote the pane writes as the sentence alone", () => {
    assert.deepEqual(noteLine(WRITTEN_QUOTE_LINE), { text: QUOTE_SHOWS, anchor: QUOTE_ANCHOR });
  });

  it("leaves no Markdown of the written quote", () => {
    const shown = noteLine(WRITTEN_QUOTE_LINE);
    assert.ok(shown, "a quote line has something to show");
    for (const leftover of [">", "(", ")", "#", "^", '"']) {
      assert.ok(!shown.text.includes(leftover), `the drawer still shows ${leftover} from the Markdown: ${shown.text}`);
    }
  });

  it("treats the empty Reflection prompt as nothing", () => {
    assert.equal(
      noteLine(WRITTEN_PROMPT_LINE),
      null,
      "an empty prompt is the pane asking for a thought, not a thought"
    );
  });

  it("keeps the words of a written reflection and drops the label", () => {
    assert.deepEqual(noteLine("- Reflection: the auction never stops"), { text: "the auction never stops" });
  });

  it("does not throw away text after an anchor", () => {
    assert.deepEqual(noteLine("See ^p-012 for the rest"), { text: "See for the rest", anchor: "^p-012" });
  });

  it("shows a plain bullet as it was written", () => {
    assert.deepEqual(noteLine("- Vector clocks need no wall clock."), { text: "Vector clocks need no wall clock." });
  });

  it("keeps one quote mark of its own", () => {
    assert.deepEqual(noteLine('- He called it "value" here, and value area later'), {
      text: 'He called it "value" here, and value area later',
    });
  });

  // A pair is a pair at BOTH ends. A mutation run found this gap: stripping only the opening mark broke five other
  // tests, and none of them was the one about keeping a quote mark of its own, because that note does not start
  // with one.
  it("keeps an opening quote mark when the line does not close with one", () => {
    assert.deepEqual(noteLine('- "value" is his word for it'), { text: '"value" is his word for it' });
  });

  it("takes curly quote marks off too", () => {
    assert.deepEqual(noteLine("> “The market is an auction.” (#^p-007)"), {
      text: "The market is an auction.",
      anchor: "^p-007",
    });
  });

  it("shows nothing for a line with nothing to show", () => {
    for (const line of ["", "   ", "-", "- ", ">", "> ", "*", "•", "- Reflection:", '> ""']) {
      assert.equal(noteLine(line), null, `${JSON.stringify(line)} has nothing to show`);
    }
  });

  it("strips markers in any order", () => {
    for (const line of ['- > "A sentence." (#^p-003)', '> - "A sentence." (#^p-003)']) {
      assert.deepEqual(noteLine(line), { text: "A sentence.", anchor: "^p-003" }, line);
    }
  });

  it("reads a bare anchor with no bracket", () => {
    assert.deepEqual(noteLine("- A thought ^p-042"), { text: "A thought", anchor: "^p-042" });
  });

  it("shows nothing for a line that is only an anchor", () => {
    assert.equal(noteLine("> (#^p-001)"), null, "an anchor with no words is a leftover, not something to read");
  });

  it("reads a quote in another alphabet", () => {
    for (const line of [
      "> “Цена говорит.” (#^p-001)",
      '> "Le prix parle à celui qui écoute." (#^p-002)',
      '> "価格は語る。" (#^p-003)',
      "• ① A circled digit starts this note",
    ]) {
      const shown = noteLine(line);
      assert.ok(shown, `${line} must read as a note`);
      assert.ok(!shown.text.startsWith(">"), `the marker must come off whatever follows it: ${shown.text}`);
    }
  });
});
