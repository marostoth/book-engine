---
status: accepted
date: 2026-09-20
decision-makers: Maros Toth
---

# A window opens with the right words in it

## Context and Problem Statement

Thirty places in the app set state inside an effect, spread over twenty-six components. ESLint's
`react-hooks/set-state-in-effect` reported every one of them as a warning, because TL-05 turned the linter on and
changing twenty-six components in the same commit would have changed how the reader runs with nothing to catch it.
TL-11 owns that work. This record is the first of its three parts, and closes this rule.

An effect runs **after** the drawing it belongs to has reached the screen. So every one of these thirty places
puts the wrong thing in front of the reader for one drawing, then corrects it. Measured on the real components on
2026-09-19, with the code at `1c29940`:

- **Seven forms filled themselves from a prop.** `TermModal` and six others kept their component on the page while
  the window was shut, and an effect watching `isOpen` wrote every field again each time it opened. So the window
  reached the screen showing the heading "Edit Author Term" over empty fields, or the term the reader edited last
  under the name of the one they just clicked.
- **Seven places cleared state when the thing shown changed.** The practice and gatekeeper windows clear the
  answer box when the next card arrives. The clearing happened one drawing after the new question was on screen,
  so the answer to the question before it could be read under the new one. `apps/desktop/src/hooks/useStartAgainWhen.test.tsx`
  records what reached the screen and shows the effect version doing exactly this.
- **Twelve loads reset state before their fetch.** `setLoading(true)`, `setLoadState("loading")`,
  `setLoadedBookId(null)`. Each ran after the page had already been drawn with the last answer still on it. The
  worst is `NotesPane`: `loadState` gates whether the reader may type, so for one drawing after a chapter change
  the pane was unlocked while it still held the chapter before it. A save in that moment writes one chapter's
  notes into another chapter's file, which is the fault DS-07 already fixed once.
- **Four were plain derivation.** `BlueprintView` copied a value it was handed into state. `FocusRuler` cleared a
  hover the pacer had already taken over. `OmniSearchModal` cleared its results when the query grew too short.
  None of the four needed state at all.

None of this is visible in the 365 frontend tests, because almost none of them render a component: sixty-five
components had nine test files between them.

## Decision Drivers

- The reader must never see a word that does not belong where it is. A form that says "Edit" over empty fields,
  or shows the term before this one, is the same class of fault as the letter CQ-07 removed from a chapter file.
- A window that can be typed into must not be open for typing before its own words have arrived. That is a data
  fault, not a cosmetic one.
- The fix must not change what the app does on any page where the rule does not apply. Twenty-six components is
  too many to check by eye, so each change must be either provably equal to what it replaced, or stated as a
  change and explained.
- Whatever replaces the effects has to be **one** idea, named in one place, not twenty-six hand-written answers.
  The register's own "How to fix" asks for the rule to become an error as its last warning goes, which only works
  if the answer is uniform enough to hold.

## Considered Options

1. **Work the start value out before the component is built, and give it a `key`.** React's own answer, from "You
   Might Not Need an Effect". A `key` that changes tells React to throw the old component away and build a new
   one, so a new thing to show gets a new form. The start values become pure functions.
2. **Turn the rule off for these files.** A one-line change. It keeps every fault, including the notes pane, and
   it turns thirty warnings into nothing anybody will see again.
3. **Set the state while drawing, everywhere.** Legal React, and the answer for state that must go back to its
   start beside other state a `key` must not touch. As the answer for all thirty it would put a change detector in
   twenty-six components, and each one is a place to get the comparison wrong.
4. **Move each component's state up to its parent.** Then a parent that knows what is being edited can hand the
   fields down. It removes the state, but it puts seven forms' worth of fields into `AppModals`, whose props are
   already capped at twenty-two by a ratchet in `test_frontend_stays_tidy.py`.

## Decision Outcome

**Option 1, with option 3 for the two cases it does not fit.**

Three pieces:

- `apps/desktop/src/lib/formStart.ts` holds what each of the seven forms starts with, as pure functions, plus
  `formKey`, which builds a `key` from the same values the effect it replaces watched. Each form is split in two
  inside its own file: the exported component is a gate that returns nothing while the window is shut, and the
  inner one is the form, with the `key` on it. Nothing outside the file changes, so the dialog guard in
  `test_dialogs_follow_one_rule.py` still sees one dialog per file.
- `apps/desktop/src/hooks/useStartAgainWhen.ts` is option 3, once, named, with its own tests. It is for state that
  must go back to its start beside state a `key` must not touch: rebuilding the practice window on every card
  would throw away the session that walks them.
- The twelve loads carry the request they answer. A piece of state holds `{ to: <what was asked>, ... }`, and
  "loading" is what the component reads when the state's request is not the current one. Nothing has to be reset
  before a fetch, because nothing stale is ever shown.

`react-hooks/set-state-in-effect` is `"error"` in `apps/desktop/eslint.config.js` from this record onwards.

### Consequences

Good:

- Fifty-one ESLint warnings become eighteen. Thirty were this rule; three more were `exhaustive-deps` warnings
  that fell out on their own, because the dependency they wanted no longer exists.
- Four pieces of state are gone, replaced by values worked out while drawing. Two `useState` setters in
  `TermModal` and two in `CritiqueModal` turned out to be written by nothing but the effect: those fields are
  read-only in their forms, which nobody could see while an effect wrote them.
- Three stale-answer faults are fixed as a side effect. `usePracticeDeck`, `NotesDrawer` and `AnalyticsModal` could
  each let the answer for one book land after the reader had opened another. They drop it now.
- `exitAssessmentFormStart` no longer keeps a stale category. The effect set `category` only when the saved
  classification named one, so a book whose classification is bare showed the category of whatever book was open
  before it.
- The practice and gatekeeper windows no longer need their "the window is shut, so start the session over"
  branch: closing them takes them off the page, and `useDialog`'s clean-up runs on unmount exactly as it ran on
  close.

Bad:

- Seven windows and five other components now unmount when they close, where before they stayed on the page
  returning `null`. Anything that was quietly surviving a close does not any more. Two were found and are
  deliberate: `ControversyModal` kept a half-typed perspective stance across a close, and `NotesDrawer` kept its
  count of words saved. Both now start fresh, which is what the effect they replace did to every field beside them.
- `VaultGate` clears the "could not find your vault" message when the next answer arrives, not when the reader
  clicks "Try again". On a local backend that is milliseconds, and the reader keeps the reason on screen until
  there is a new one.
- `formKey` joins its parts with a NUL character. It is not a pretty key, and a key is compared as a string, so
  the separator is the only thing stopping two different forms from sharing one.
- One warning is disabled by hand, in `useStartAgainWhen.test.tsx`. That file holds a component that clears state
  in an effect on purpose, as the contrast the tests rest on.
- Twelve of the eighteen warnings left are `exhaustive-deps` and six are `refs` and `immutability`. TL-11 is not
  closed by this record.

### Confirmation

`react-hooks/set-state-in-effect` is an error, so **any** new one fails `npm run check`. Beyond that:

- `packages/ingestion/tests/test_one_check.py::test_a_react_rule_that_is_closed_is_an_error_and_cannot_come_back`
  fails when that rule is put back to a warning, which is the only way its warnings could grow again.
- `apps/desktop/src/hooks/useStartAgainWhen.test.tsx::the next question never reaches the screen with the answer
  to the one before it` records what was committed, in a layout effect, and fails if the state is cleared a
  drawing late. Its neighbour, `an effect does let that moment reach the screen`, fails if an effect ever stops
  showing the fault, which would mean the whole file proves nothing.
- `apps/desktop/src/components/formStart.test.tsx::a term being edited is in the box on the drawing the window
  first reaches the screen` fails if a form goes back to filling itself after it is drawn.
- `apps/desktop/src/lib/formStart.test.ts` holds thirty-four tests over the branches of the seven start values,
  read without a browser.
