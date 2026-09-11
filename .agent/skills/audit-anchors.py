#!/usr/bin/env python3
"""Audits ingested Markdown files for missing paragraph anchors and broken footnote links."""
import sys
import re
from pathlib import Path

def audit_book(book_dir: Path) -> bool:
    has_errors = False
    for md_file in book_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        paragraphs = [p for p in content.split("\n\n") if p.strip() and not p.startswith("#")]
        unanchored = [p for p in paragraphs if not re.search(r"\^p-[a-zA-Z0-9_-]+$", p.strip())]
        if unanchored:
            print(f"[-] {md_file.name}: Found {len(unanchored)} unanchored paragraphs.")
            has_errors = True
        callouts = set(re.findall(r"\[\^([a-zA-Z0-9_-]+)\](?!:)", content))
        definitions = set(re.findall(r"\[\^([a-zA-Z0-9_-]+)\]:", content))
        orphans = callouts - definitions
        if orphans:
            print(f"[-] {md_file.name}: Broken footnote links: {orphans}")
            has_errors = True

    if not has_errors:
        print("[+] All chapters passed paragraph anchor and footnote integrity audits.")
    return not has_errors

if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("vault/books")
    sys.exit(0 if audit_book(target) else 1)
