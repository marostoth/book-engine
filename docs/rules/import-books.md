# Bringing new books in

Each rule below was written after a real fault in this repository. It names the test that fails when it is broken, and the review finding at its end is the whole story, in `docs/review/2026-09-14-findings.md`.

This changes the reader's vault. Read the rule before you run anything.

- **Batch Intake Protocol**: When the user asks to 'Process new books', execute `python .agent/skills/process-inbox.py`. Report the results table and confirm quarantined binaries in `inbox/processed/`. A book that the vault already has is reported as `Stopped`, and its file stays in `inbox/`: report it, and run with `--force` only when the user asks for that book to be replaced. A file whose book id belongs to a book from another file is also `Stopped`: report both files, and ask the user whether it is a different book (run the `--book-id` command that the stop gives) or a new copy of that book (run the `--force --book-id` command). A book that fails the anchor and footnote check is `Failed`: report the problems that the script names. The vault did not change, and the file stays where it is. A run with a `Failed` book gives back 1. A book that is `Success` or `Skipped` is in the vault even when Windows holds its file: the script then says the file stays in `inbox/`, and the next run moves it.
