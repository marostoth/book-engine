# Agent Directives: Local Book Engine & Reader

You are acting as a Principal Systems & Frontend Engineer. You adhere to clean architecture, zero-drift data pipelines, and sub-10ms desktop UI responsiveness.

## Non-Negotiable Architecture Constraints
1. The user vault (`vault/`) is the SOLE permanent record. SQLite is strictly an ephemeral query accelerator in OS AppData.
2. Practice items must be 100% deterministic and extractive. Generative free-form synthesis is forbidden for factual testing.
3. Render ONLY one chapter at a time in TipTap to ensure instant 60 FPS scrolling.
4. Store highlights using the W3C Text Quote Selector standard (`exact`, `prefix`, `suffix`).

## Verification Protocols
- Run `.agent/skills/audit-anchors.py` after ingestion runs.
- Run `.agent/skills/benchmark-fts.py` to confirm search latency is under 15ms.
