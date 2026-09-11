"""Unit tests for endnote and footnote relocation."""

from bs4 import BeautifulSoup
from ingest.endnotes import EndnoteRegistry, relocate_chapter_footnotes


def test_endnote_registration_and_relocation():
    registry = EndnoteRegistry()

    # Backmatter endnotes document
    notes_html = """
    <html>
      <body>
        <div id="n1">
          <p><a href="ch01.xhtml#ref1">1.</a> Lamport, L. (1978). Time, clocks, and the ordering of events. <a href="#">↩</a></p>
        </div>
        <div id="n2">
          <p>Schneider, F. B. (1990). Implementing fault-tolerant services. [back]</p>
        </div>
      </body>
    </html>
    """
    registry.register_document("notes.xhtml", notes_html)

    # Chapter document containing severed links
    ch_html = """
    <html>
      <body>
        <p>Event ordering requires logical time.<a href="notes.xhtml#n1" id="ref1"><sup>1</sup></a></p>
        <p>State machines ensure deterministic replication.<a href="notes.xhtml#n2"><sup>2</sup></a></p>
      </body>
    </html>
    """
    soup = BeautifulSoup(ch_html, "html.parser")
    resolved = relocate_chapter_footnotes(soup, "ch01.xhtml", registry)

    assert len(resolved) == 2
    assert resolved[0][0] == "1"
    assert "Time, clocks, and the ordering of events" in resolved[0][1]
    assert "↩" not in resolved[0][1]

    assert resolved[1][0] == "2"
    assert "Implementing fault-tolerant services" in resolved[1][1]
    assert "[back]" not in resolved[1][1]

    # Check that in-text links were replaced with [^1] and [^2]
    text = soup.get_text()
    assert "[^1]" in text
    assert "[^2]" in text
    assert not soup.find_all("a")


def test_intra_chapter_footnote():
    registry = EndnoteRegistry()
    ch_html = """
    <html>
      <body>
        <p>Here is an inline reference.<a href="#fn1"><sup>1</sup></a></p>
        <div id="fn1"><p>Citation defined inside the same chapter.</p></div>
      </body>
    </html>
    """
    registry.register_document("ch01.xhtml", ch_html)
    soup = BeautifulSoup(ch_html, "html.parser")
    resolved = relocate_chapter_footnotes(soup, "ch01.xhtml", registry)

    assert len(resolved) == 1
    assert resolved[0][0] == "1"
    assert "Citation defined inside the same chapter." in resolved[0][1]
