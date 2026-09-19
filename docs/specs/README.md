# Specifications

A spec is written **before** a feature is built. It says what a person should be able to do with this
program, in plain words, so the work can be argued about while arguing is still cheap.

This folder follows the Spec-Driven Development loop of [spec-kit](https://github.com/github/spec-kit).

## The loop

| Step | File | The question it answers |
|---|---|---|
| 1. Specify | `spec.md` | What should a person be able to do, and how do we know it worked? |
| 2. Plan | `plan.md` | Which files, which types, which risks, checked against the rules of this repository. |
| 3. Tasks | `tasks.md` | The ordered steps. Each one names its exact file. Tests come before the code they prove. |
| 4. Implement | the commits | Tick each task as it lands. |

**`spec.md` names no language, library or file.** That is on purpose. A spec that names a file can only be
agreed with; a spec that describes what a reader sees can be argued with. Every technical choice belongs in
`plan.md`.

## Numbering

One folder per feature, named `NNNN-title-with-dashes`. Numbers start at 0001 and are never reused.

## The rules a plan is checked against

spec-kit keeps a "constitution" of project rules for this purpose. **This repository already has one, and it
is not copied here.** `AGENTS.md` is canonical, `docs/rules/` holds the detail for each folder, and
`docs/decisions/` says why the program is shaped the way it is. The Constitution Check of every `plan.md`
cites those files by name. A fourth copy would drift away from the first three.

## What belongs where

| Folder | Holds | Tense |
|---|---|---|
| `docs/specs/` | What a feature **should** do, before it exists | future |
| `ARCHITECTURE.md` | What the program **is** today | present |
| `docs/decisions/` | **Why** it is built this way | past |
| `docs/rules/` | What an agent **must not** break | imperative |
| `docs/review/` | What was once **wrong** | past |

A spec is not updated to match the code after the fact. Once the feature is built, `ARCHITECTURE.md`
describes it, and the spec stays as the record of what was asked for.

## The specs

| # | Feature | Status | Finding |
|---|---|---|---|
| [0001](0001-the-vocabulary-bank/spec.md) | The vocabulary bank | planned | [RD-10](../review/2026-09-14-findings.md#rd-10) |

A status is one of `draft`, `planned` or `implemented`.
