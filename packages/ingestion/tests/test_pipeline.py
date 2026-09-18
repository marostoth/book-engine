"""End-to-end integration test for the ingestion pipeline and anchor audit skill."""

import subprocess
import sys
from pathlib import Path
import pytest

from ingest.sample_generator import create_sample_epub
from ingest.pipeline import ingest_epub

from conftest import SKILLS


def test_full_pipeline_ingestion(tmp_path: Path):
    epub_path = tmp_path / "sample.epub"
    create_sample_epub(epub_path)
    assert epub_path.exists()

    vault_dir = tmp_path / "vault"
    book_id = "sample"

    meta = ingest_epub(epub_path, vault_dir, custom_book_id=book_id)

    # 1. Verify BookMeta
    assert meta.book_id == "sample"
    assert meta.title == "Principles of Distributed Systems"
    assert meta.total_chapters == 2
    assert len(meta.spine) == 2

    # 2. Verify files created
    book_dir = vault_dir / "books" / book_id
    notes_dir = vault_dir / "notes" / book_id

    assert (book_dir / "_meta.json").exists()
    assert (book_dir / "ch-01.md").exists()
    assert (book_dir / "ch-02.md").exists()
    assert (notes_dir / "practice-deck.md").exists()
    assert (notes_dir / "ch-01-notes.md").exists()

    # 3. Verify asset extraction
    assets_dir = book_dir / "assets"
    assert assets_dir.exists()
    assert (assets_dir / "system_architecture.png").exists()

    # 4. Verify chapter contents & footnote relocation
    ch1_text = (book_dir / "ch-01.md").read_text(encoding="utf-8")
    assert "[^1]" in ch1_text
    assert "[^2]" in ch1_text
    assert "[^1]:" in ch1_text
    assert "Linearizability: A correctness condition" in ch1_text
    assert "![High Level System Architecture Diagram](assets/system_architecture.png)" in ch1_text

    ch2_text = (book_dir / "ch-02.md").read_text(encoding="utf-8")
    assert "[^1]" in ch2_text
    assert "[^2]" in ch2_text
    assert "The Part-Time Parliament" in ch2_text or "Implementing fault-tolerant services" in ch2_text

    # 5. Verify practice deck
    deck_text = (notes_dir / "practice-deck.md").read_text(encoding="utf-8")
    assert "## Chapter: ch-01" in deck_text
    assert "## Chapter: ch-02" in deck_text
    assert "{{c1::" in deck_text

    # 6. Execute anchor integrity audit skill
    audit_script = (SKILLS / "audit-anchors.py").resolve()
    result = subprocess.run(
        [sys.executable, str(audit_script), str(book_dir)],
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"audit-anchors.py failed:\n{result.stdout}\n{result.stderr}"
    assert "2 chapters of 1 book(s) passed paragraph anchor and footnote integrity audits" in result.stdout
