---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# FSRS-5 schedules reviews

## Context and Problem Statement

Cards have to come back on the day the reader is about to forget them. Which scheduling algorithm decides
that, and how does anyone know it was implemented correctly?

## Decision Drivers

* The schedule must work with no network and no account.
* A scheduling bug is silent: cards come back at the wrong time for months before anyone notices.
* The implementation has to be checkable against something outside this repository.
* Review history is the reader's; the schedule must be rebuildable from it.

## Considered Options

* FSRS-5, reimplemented in Rust
* SM-2, the classic SuperMemo algorithm Anki used for years
* A fixed ladder of intervals, such as 1, 3, 7, 21 days

## Decision Outcome

Chosen option: **FSRS-5**, because it is the only option with a public reference implementation to test
against, which is what makes a silent scheduling bug findable.

`apps/desktop/src-tauri/src/fsrs.rs` implements it with the 19 default weights, and
`apps/desktop/src-tauri/src/fsrs/tests.rs` pins reference numbers taken from the official **py-fsrs 5.1.3**
with those same weights. A change that drifts from the reference fails the build.

Target retention is 90%, so the next interval is the rounded stability in days, from 1 to 36,500. Again
brings a card back after 10 minutes.

### Consequences

* Good, because correctness is a test against a published implementation, not a judgement.
* Good, because it runs locally with no account and no network.
* Good, because it separates stability from difficulty, so a card the reader finds hard is not simply shown
  more often forever.
* Bad, because 19 opaque weights cannot be reasoned about by reading them; the tests are the only check.
* Bad, because the weights are the FSRS defaults and are **not** fitted to this reader's own history. FSRS
  is designed to be optimised per person, and nothing here does that.
* Bad, because the reference has its own edge cases that had to be matched deliberately rather than
  reinvented, such as what a Hard rating does to a learning card.
* Neutral, because the schedule lives in the cache and the review log lives in the vault, so a changed
  algorithm can be replayed over the same history.

### Confirmation

`apps/desktop/src-tauri/src/fsrs/tests.rs` fails when any formula drifts from py-fsrs 5.1.3.
`apps/desktop/src-tauri/src/db/restore.rs` rebuilds every card's schedule from
`vault/notes/<book-id>/reviews.jsonl`, so the algorithm can be checked against real history at any time.

## More Information

LE-01 in `docs/review/2026-09-14-findings.md` is the finding that pinned the implementation to the reference
numbers. Optimising the weights against the reader's own review log is the obvious next step and has not
been done; the log needed for it is already kept.
