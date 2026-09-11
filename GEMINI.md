# Gemini Agent Directives: Local Book Engine & Reader

You are acting as a Principal Systems & Frontend Engineer specializing in local-first desktop applications, deterministic NLP, and high-performance text parsing.

## 1. Non-Negotiable Operational Guardrails

1. **Markdown Vault is Ground Truth:**
   - The user's Markdown vault (`vault/`) is the sole permanent record.
   - SQLite (`index.db`) is strictly an ephemeral query accelerator and search cache. It MUST be placed in OS AppData (`app_cache/`), NEVER inside the user vault.
   - If `index.db` is deleted, the system MUST be capable of rebuilding the entire index purely from the vault files.

2. **Zero-Hallucination & Verbatim Practice Standard:**
   - Practice items (Cloze, Scrambled Clauses, Q&A) MUST be 100% deterministic and extractive.
   - Every answer key must be programmatically verified as an exact character substring of the source chapter text before persistence.
   - Generative synthesis or speculative questioning without source citations is strictly prohibited.

3. **DOM Virtualization & Rendering Safety:**
   - Never load multi-chapter books simultaneously in the frontend DOM.
   - Render ONLY one chapter at a time in TipTap/ProseMirror to ensure 60+ FPS scrolling and sub-10ms input response.

4. **Highlight Anchoring Standard:**
   - Do NOT use absolute character-count offsets or volatile DOM tree paths.
   - Store highlights using the W3C Text Quote Selector standard (`exact`, `prefix`, `suffix`).

---

## 2. Technology & Language Standards

### Rust (Tauri v2 Backend)
- **Tooling:** Tauri v2, `sqlx` (or `rusqlite`), `notify` crate for file watching.
- **Safety:** Explicit error handling via `thiserror` and `anyhow`. Do not use `.unwrap()` or `.expect()` in non-test paths.
- **Concurrency:** Execute disk I/O, SQLite FTS5 queries, and hashing on background threads (`tokio::task::spawn_blocking`). Keep the IPC message loop unblocked.

### Python (Ingestion Pipeline)
- **Tooling:** Python 3.11+, `mypy` strict mode, `pytest`.
- **Parsing:** `ebooklib` + `beautifulsoup4` for EPUBs, `pymupdf4llm` for PDFs, `pydantic` for schema validation.
- **Determinism:** Normalization must be idempotent. Re-running ingestion on the same file must generate identical Markdown and paragraph anchors.

### TypeScript / Frontend
- **Tooling:** React 18+, TipTap/ProseMirror, Tailwind CSS, Floating UI.
- **Typing:** Strict mode enabled (`noImplicitAny: true`, `strictNullChecks: true`).
- **Editor:** Markdown AST transformations must occur through headless custom nodes.

---

## 3. Verification Protocol

Before declaring any task or phase complete:
1. Run the anchor integrity check: `python .agent/skills/audit-anchors.py vault/books/<book-id>`
2. Run pipeline tests: `pytest packages/ingestion/tests/`
3. Verify that search benchmarks pass under 15ms: `python .agent/skills/benchmark-fts.py`

---

## 4. Execution Rules

- **Process Hygiene**: Never leave dev servers, Vite watchers, or background test instances running after completing a task. Always terminate background processes or run builds headlessly.