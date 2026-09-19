---
status: accepted
date: 2026-09-19
decision-makers: Maros Toth
---

# Tauri v2 is the desktop shell

## Context and Problem Statement

The reader is a rich text surface: a TipTap editor, highlights, popovers, a pacer that measures line
geometry. That wants a browser engine. The work behind it is file and database work that must not block the
window. What hosts the two halves?

**This record is reconstructed.** Tauri was chosen before any of this was written down, and there is no
record of Electron being evaluated against it. What follows is the case the repository actually supports,
and the consequences that are now load-bearing; it is not a minute of the original decision.

## Decision Drivers

* The reader UI is genuinely web technology, and rewriting TipTap natively is not realistic.
* Everything behind the window is file and SQLite work, which wants a compiled language and real threads.
* The program reads untrusted content: a book can contain any HTML an author put in it.
* It ships to one person and their friends, by hand, with no update server.

## Considered Options

* Tauri v2, the system webview with a Rust backend
* Electron, a bundled Chromium with a Node backend
* A native UI toolkit, with no web engine

## Decision Outcome

Chosen option: **Tauri v2**, because the backend work is exactly what Rust is for, and the system webview
keeps the shipped program small enough to hand to someone over a normal connection.

The window is React and TipTap. Everything else is Rust: 38 commands, all doing their disk and database work
on background threads with `tokio::task::spawn_blocking`.

### Consequences

* Good, because the backend is one compiled language with `rusqlite` bundled, so there is no runtime to
  install and nothing to keep patched separately.
* Good, because Tauri's security model is a real, enforced boundary and not a convention. `app.security.csp`
  stops a tag inside a book from running a script, and `assetProtocol.scope` is empty by default, so the
  window can open only the picture folders that `load_chapter` opens for it.
* Good, because a plugin is an explicit dependency, which made an unused one findable and removable.
* Bad, because the webview is the operating system's, so the reader's Windows version decides what CSS and
  JavaScript are available. This is the real cost against Electron, which ships a known Chromium.
* Bad, because the policy applies **only in the built app**. `tauri dev` loads the page from the Vite server,
  which sends no policy, so a change that violates it looks fine in development.
* Bad, because `index.html` must hold no `<style>` element: Tauri would give it a nonce, and a browser then
  ignores `'unsafe-inline'` beside a nonce. That is a trap nothing else in the stack would warn about.
* Bad, because two languages means every check runs twice and a shared format can drift, though that is
  shared with decision 0003.

### Confirmation

`apps/desktop/src-tauri/src/security_config_tests.rs` checks the content security policy, the empty asset
scope and the absence of a `<style>` element in `index.html`, and it fails when `Cargo.toml` names any
plugin beyond dialog and single-instance. `apps/desktop/src-tauri/tauri.conf.json` is the single place the
bundle is described, and `tests/test_licenses_stay_known.py` reads it to confirm the installer carries no
Python.

## More Information

Two findings in `docs/review/2026-09-14-findings.md` made the security half real rather than assumed. SEC-02
found the window had no content security policy at all and the asset protocol could open every file on the
computer. SEC-04 found the shell plugin loaded and unused, giving page code five commands that start and
stop programs. Both were possible only because the boundary exists to be configured, and both were invisible
until someone looked.
