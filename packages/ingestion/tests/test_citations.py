"""CQ-06: a citation still points at its passage, and a report link still opens one.

A report lives in `vault/syntopicon/reports/`, so a link from it to a passage climbs two folders. The app used to
write the link from where the repository starts, and to leave the paragraph anchor out, so every link led nowhere.
And nothing ever read a quote back from the book, so a quote could say one thing while the paragraph said another.

Every test here builds its own little vault in a temporary folder. The real vault is never read.
"""

from pathlib import Path

from ingest.citations import (
    links_that_lead_nowhere,
    paragraph_at,
    quote_is_there,
    quote_that_moved,
)

CHAPTER = "# Chapter 1\n\nThe division of labour raises output. ^p-001\n\nA pin maker works alone. ^p-002\n"


def a_vault_with_a_book(tmp_path: Path, chapter: str = CHAPTER) -> Path:
    """A vault with one book, `book-a`, whose `ch-01.md` holds `chapter`, and an empty reports folder."""
    vault = tmp_path / "vault"
    (vault / "books" / "book-a").mkdir(parents=True)
    (vault / "books" / "book-a" / "ch-01.md").write_text(chapter, encoding="utf-8")
    (vault / "syntopicon" / "reports").mkdir(parents=True)
    return vault


def a_report(vault: Path, body: str) -> Path:
    """Writes a report with `body` in it and gives its path."""
    report = vault / "syntopicon" / "reports" / "test-topic-synthesis.md"
    report.write_text(f"---\ntopic_id: test-topic\n---\n\n# Dossier\n\n{body}\n", encoding="utf-8")
    return report


# ---------------------------------------------------------------- finding the paragraph an anchor names


def test_a_paragraph_is_found_by_the_anchor_at_its_end():
    assert paragraph_at(CHAPTER, "^p-001") == "The division of labour raises output."
    assert paragraph_at(CHAPTER, "^p-002") == "A pin maker works alone."
    assert paragraph_at(CHAPTER, "^p-003") is None


def test_an_anchor_inside_a_word_names_no_paragraph():
    assert paragraph_at("A word^p-001\n", "^p-001") is None
    assert paragraph_at("A longer one. ^p-0012\n", "^p-001") is None


def test_no_anchor_names_no_paragraph():
    assert paragraph_at(CHAPTER, "") is None


def test_a_chapter_whose_lines_end_the_old_way_is_read_the_same():
    old_way = CHAPTER.replace("\n", "\r\n")

    assert paragraph_at(old_way, "^p-001") == "The division of labour raises output."
    assert paragraph_at(old_way, "^p-002") == "A pin maker works alone."


# ---------------------------------------------------------------- reading a quote back


def test_a_quote_that_a_line_wrap_cut_is_still_the_same_quote():
    paragraph = "The greatest improvements in the\nproductive powers of labour  seem to have been the effects."

    assert quote_is_there("The greatest improvements in the productive powers of labour", paragraph)
    assert quote_is_there("**productive** powers of labour — seem to have been", paragraph)


def test_a_quote_the_paragraph_does_not_hold_is_not_there():
    assert not quote_is_there("the greatest failures of labour", "The greatest improvements of labour.")


def test_an_empty_quote_is_never_there():
    assert not quote_is_there("   ", "The greatest improvements of labour.")


def test_a_quote_that_matches_its_paragraph_gives_no_complaint():
    citation = {"anchor": "^p-001", "quote": "The division of labour raises output."}

    assert quote_that_moved(citation, CHAPTER) is None


def test_a_quote_that_is_not_in_its_paragraph_is_named():
    citation = {"anchor": "^p-001", "quote": "A pin maker works alone."}

    why = quote_that_moved(citation, CHAPTER)

    assert why is not None
    assert "^p-001" in why
    assert "is not in that paragraph any more" in why


def test_a_citation_with_nothing_to_check_gives_no_complaint():
    assert quote_that_moved({"anchor": "^p-001", "quote": ""}, CHAPTER) is None
    assert quote_that_moved({"anchor": "", "quote": "The division of labour raises output."}, CHAPTER) is None
    assert quote_that_moved({"anchor": "^p-999", "quote": "Anything at all."}, CHAPTER) is None


# ---------------------------------------------------------------- following the links of a report


def test_a_link_that_climbs_out_of_the_reports_folder_opens_its_paragraph(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(vault, "- [`ch-01.md#^p-001`](../../books/book-a/ch-01.md#^p-001)")

    assert links_that_lead_nowhere(vault) == []


def test_a_link_written_from_where_the_repository_starts_leads_nowhere(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(vault, "- [`ch-01.md#^p-001`](vault/books/book-a/ch-01.md)")

    dead = links_that_lead_nowhere(vault)

    assert len(dead) == 1
    assert dead[0]["href"] == "vault/books/book-a/ch-01.md"
    assert "names a folder that is not in the vault" in dead[0]["why"]


def test_a_link_to_a_chapter_the_book_does_not_have_leads_nowhere(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(vault, "- [`ch-09.md#^p-001`](../../books/book-a/ch-09.md#^p-001)")

    dead = links_that_lead_nowhere(vault)

    assert len(dead) == 1
    assert "reaches no file" in dead[0]["why"]
    assert "Export the report again" in dead[0]["why"]


def test_a_link_to_a_paragraph_the_chapter_does_not_have_leads_nowhere(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(vault, "- [`ch-01.md#^p-777`](../../books/book-a/ch-01.md#^p-777)")

    dead = links_that_lead_nowhere(vault)

    assert len(dead) == 1
    assert "has no such paragraph" in dead[0]["why"]


def test_a_link_with_no_paragraph_still_has_to_reach_its_chapter(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(vault, "- [the chapter](../../books/book-a/ch-01.md) and [a gone one](../../books/book-a/ch-09.md)")

    dead = links_that_lead_nowhere(vault)

    assert len(dead) == 1
    assert dead[0]["href"] == "../../books/book-a/ch-09.md"


def test_a_link_to_the_web_the_mail_or_the_same_file_is_left_alone(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(
        vault,
        "- [the web](https://example.invalid/page) [no lock](http://example.invalid) "
        "[the writer](mailto:someone@example.invalid) [the top](#dossier)",
    )

    assert links_that_lead_nowhere(vault) == []


def test_every_report_of_the_vault_is_followed(tmp_path: Path):
    vault = a_vault_with_a_book(tmp_path)
    a_report(vault, "- [`ch-01.md#^p-001`](../../books/book-a/ch-01.md#^p-001)")
    (vault / "syntopicon" / "reports" / "other-topic-synthesis.md").write_text(
        "# Other\n\n- [`ch-01.md#^p-001`](books/book-a/ch-01.md)\n", encoding="utf-8"
    )

    dead = links_that_lead_nowhere(vault)

    assert len(dead) == 1
    assert dead[0]["report"] == "other-topic-synthesis.md"


def test_a_vault_with_no_reports_folder_has_no_dead_links(tmp_path: Path):
    vault = tmp_path / "vault"
    vault.mkdir()

    assert links_that_lead_nowhere(vault) == []
