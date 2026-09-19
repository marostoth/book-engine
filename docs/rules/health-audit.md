# The system health audit

Each rule below was written after a real fault in this repository. It names the test that fails when it is broken, and the review finding at its end is the whole story, in `docs/review/2026-09-14-findings.md`.

This reads the reader's real vault, so it is run by hand and never as part of `npm run check`.

- **System Audit Protocol**: When the user requests 'Run audit', 'Audit project', or 'Check system health', immediately execute `python .agent/skills/audit-system.py`. Present the final diagnostic table, and read the files a failed check names before you say what is wrong. The audit does not start the app; pass `--launch` when you want that too, and it refuses a binary older than the Rust it was built from.
