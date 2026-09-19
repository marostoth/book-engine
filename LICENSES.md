# The licences of everything this repository installs

Copyright (C) 2026 Maros Toth.

**This program is free software under the GNU Affero General Public License, version 3 or later.** The full
text is in [LICENSE](./LICENSE), copied byte for byte from the copy that `ebooklib` installs
(sha256 `57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6`), never typed out from memory.

## Why AGPL and not "all rights reserved"

The import pipeline is built on `ebooklib`, which is AGPL and nothing else. There is no commercial licence to
buy for it. The AGPL asks one thing: hand this program to somebody, and they get the source and the same
freedoms you had. **"Shared only with friends" is still handing it over** — the AGPL does not count people, or
money, or whether you know them.

So a private licence and this dependency cannot both hold. AGPL was chosen because it costs nothing here:
sharing this repository already means sharing the source, which is most of what the licence asks.

**What it costs you:** a friend you give this to may pass it on to anyone, and you cannot take that back.

## What must travel with it

Whether you hand over the repository, or only the installer:

1. **The licence text**, `LICENSE`, unchanged.
2. **The complete source it was built from**, or a written offer to supply it. Handing over the repository does
   this by itself. Handing over only the built installer does not, so the source has to go with it, or the
   offer.
3. **The copyright notices** already inside the dependencies. None of them are stripped today.
4. If this is ever run as a service other people reach over a network, **AGPL section 13** asks that those
   people can get the source too.

## The measured position

Every licence below was read from the installed package itself, never recalled.
`packages/ingestion/tests/test_licenses_stay_known.py` reads them all again on every check and fails when a
new dependency arrives with a licence that is not on this page.

**Measured on 2026-09-19** (SEC-06).

| where | how many | how they were read |
|---|---|---|
| Python, needed to run the import | 22 packages | `importlib.metadata`, the metadata `pip` wrote at install |
| Python, only for working on the code | 16 packages | the same |
| npm | 361 packages | the `license` field of each installed `package.json` |
| Rust, for `x86_64-pc-windows-msvc` | 281 crates | `cargo metadata --offline --filter-platform` |

npm is **entirely permissive**: 361 of 361. Rust is permissive except the five crates below.

### The packages that are not plainly permissive

All of them sit happily inside an AGPL program. None of them is a problem now; they are listed because the
check has to know every one of them by name, and because the picture changes if the licence ever changes back.

| package | version | licence, word for word | where |
|---|---|---|---|
| `ebooklib` | 0.20 | GNU Affero General Public License v3 or later | Python. **The reason this repository is AGPL.** No commercial licence exists for it. |
| `pymupdf` | 1.28.2 | Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License | Python |
| `pymupdf4llm` | 1.28.2 | the same | Python. It pulls in the other two. |
| `pymupdf-layout` | 1.28.2 | the same | Python. Not declared in `pyproject.toml`; `pymupdf4llm` asks for it. |
| `cssparser` | 0.36.0 | MPL-2.0 | Rust, in the installer, via `dom_query` and `selectors` |
| `dtoa-short` | 0.3.5 | MPL-2.0 | Rust, in the installer, via `cssparser` |
| `option-ext` | 0.2.0 | MPL-2.0 | Rust, in the installer, via `dirs-sys` |
| `selectors` | 0.36.1 | MPL-2.0 | Rust, in the installer, via `dom_query` |
| `cssparser-macros` | 0.6.1 | MPL-2.0 | Rust, a proc-macro, so it runs while compiling and is not in the installer |
| `pathspec` | 1.1.1 | MPL-2.0 | Python, a tool for working on the code only, via `mypy` |

Three of the four AGPL packages are **dual licensed**, so one Artifex commercial licence would settle all
three. That only matters if this ever needs to stop being AGPL, and `ebooklib` would have to be replaced first
— it reads *and* writes EPUB, across 5 source files and 9 test files.

The MPL is a smaller ask than the AGPL and sits inside it without trouble. It covers its own files, the notice
has to travel, and this repository has changed none of them.

## What the installer holds, and what it does not

`apps/desktop/src-tauri/tauri.conf.json` builds one target, `nsis`, and its `bundle` names no `resources` and
no `externalBin`. No Rust file starts a Python process. **So the installer is the Rust app and the frontend
only. It carries no Python, and it cannot turn a PDF or an EPUB into a book** — `index_vault` reads books that
are already in the vault.

A friend who is given only the installer therefore sees an empty app. To read anything they need either the
import pipeline from this repository, or a vault somebody already filled.

**A vault is not covered by any of this.** It holds the text of real books, and that is the book publisher's
copyright. No software licence here gives anyone the right to pass those on.

## How this page is kept honest

`packages/ingestion/tests/test_licenses_stay_known.py` reads all three ecosystems on every `npm run check` and
fails when:

- a dependency carries a licence that is not permissive and is not named in the table above, or
- one of the four manifests stops naming `AGPL-3.0-or-later`, or
- `LICENSE` stops matching the hash of the AGPL text, or
- a package's licence is unreadable, or
- the installer starts carrying Python.

The lists in that test are the numbers it printed itself, never an estimate. A new name has to be added here at
the same time, on purpose.
