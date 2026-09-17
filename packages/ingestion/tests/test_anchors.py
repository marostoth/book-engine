"""Unit tests for deterministic paragraph anchor placement and formatting."""

import re
from ingest.anchors import inject_paragraph_anchors, extract_anchors, strip_anchor, format_anchor

AUDIT_ANCHOR_REGEX = re.compile(r"\^p-[a-zA-Z0-9_-]+$")


def test_anchor_formatting():
    assert format_anchor(1) == "^p-001"
    assert format_anchor(42) == "^p-042"
    assert format_anchor(1000) == "^p-1000"


def test_inject_anchors_skips_headings():
    raw_md = "# Title\n\nFirst paragraph.\n\n## Subheading\n\nSecond paragraph."
    anchored, count = inject_paragraph_anchors(raw_md)

    assert count == 2
    paragraphs = [p for p in anchored.split("\n\n") if p.strip()]

    # Heading 1
    assert paragraphs[0] == "# Title"
    # Para 1
    assert paragraphs[1].endswith("^p-001")
    assert AUDIT_ANCHOR_REGEX.search(paragraphs[1])
    # Heading 2
    assert paragraphs[2] == "## Subheading"
    # Para 2
    assert paragraphs[3].endswith("^p-002")
    assert AUDIT_ANCHOR_REGEX.search(paragraphs[3])


def test_anchor_idempotency():
    raw_md = "First paragraph.\n\nSecond paragraph."
    anchored_once, count1 = inject_paragraph_anchors(raw_md)
    anchored_twice, count2 = inject_paragraph_anchors(anchored_once)

    assert count1 == count2 == 2
    assert anchored_once == anchored_twice


def test_extract_anchors():
    content = "Para one text. ^p-001\n\n# Header\n\nPara two text. ^p-002"
    extracted = extract_anchors(content)

    assert len(extracted) == 2
    assert extracted[0] == ("^p-001", "Para one text.")
    assert extracted[1] == ("^p-002", "Para two text.")


def test_footnote_definitions_pass_audit_regex():
    md = "Main text with callout.[^1] ^p-001\n\n[^1]: Footnote citation text. ^p-002"
    anchored, _ = inject_paragraph_anchors(md)

    paragraphs = [p for p in anchored.split("\n\n") if p.strip() and not p.startswith("#")]
    for p in paragraphs:
        assert AUDIT_ANCHOR_REGEX.search(p.strip()), f"Failed audit regex: {p}"


def test_a_short_chapter_gets_head_and_tail_samples_that_share_no_paragraph():
    """A PDF import now makes short parts, such as a cover (IN-01). The inspectional audit of audit-system.py allows a
    paragraph in both samples only when the chapter has one paragraph."""
    from ingest.anchors import extract_inspectional_sampling

    def sampled(count):
        md, _ = inject_paragraph_anchors("# Part\n\n" + "\n\n".join(f"Paragraph {n}." for n in range(1, count + 1)))
        sampling = extract_inspectional_sampling(md)
        return sampling.head_anchors, sampling.tail_anchors

    assert sampled(1) == (["^p-001"], ["^p-001"])
    assert sampled(2) == (["^p-001"], ["^p-002"])
    assert sampled(3) == (["^p-001", "^p-002"], ["^p-003"])
    assert sampled(4) == (["^p-001", "^p-002"], ["^p-003", "^p-004"])
    assert sampled(9) == (["^p-001", "^p-002"], ["^p-008", "^p-009"])
