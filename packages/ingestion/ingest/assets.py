"""Asset and embedded media extraction for EPUB and document pipelines."""

from __future__ import annotations
import os
import re
from pathlib import Path
from typing import Dict
import ebooklib
from ebooklib import epub


def extract_epub_assets(book: epub.EpubBook, assets_dir: Path) -> Dict[str, str]:
    """Extract embedded images from an EPUB to assets_dir.

    Returns a mapping from original EPUB href/names to the normalized vault relative path:
    e.g. {'images/diagram.png': 'assets/diagram.png', 'cover.jpeg': 'assets/cover.jpeg'}
    """
    assets_dir.mkdir(parents=True, exist_ok=True)
    asset_map: Dict[str, str] = {}

    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_IMAGE:
            # item.file_name might be "images/fig1.png" or "OEBPS/images/fig1.png"
            file_name = Path(item.get_name()).name
            # Ensure unique and safe filename
            safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file_name)
            target_path = assets_dir / safe_name

            with open(target_path, "wb") as f:
                f.write(item.get_content())

            rel_asset_path = f"assets/{safe_name}"
            # Map various ways this image might be referenced in HTML
            asset_map[item.get_name()] = rel_asset_path
            asset_map[file_name] = rel_asset_path
            # If item.file_name is "images/fig1.png", also map "../images/fig1.png"
            asset_map[f"../{item.get_name()}"] = rel_asset_path
            if "/" in item.get_name():
                sub_path = item.get_name().split("/", 1)[1]
                asset_map[sub_path] = rel_asset_path
                asset_map[f"../{sub_path}"] = rel_asset_path

    return asset_map


def normalize_image_markdown(markdown_text: str, asset_map: Dict[str, str]) -> str:
    """Normalize image links in Markdown text to use vault relative asset paths."""
    def replace_md_image(match: re.Match[str]) -> str:
        alt_text = match.group(1)
        src = match.group(2).strip()
        # Look up directly or by filename
        src_name = Path(src).name
        target = asset_map.get(src) or asset_map.get(src_name)
        if target:
            return f"![{alt_text}]({target})"
        # If already starts with assets/, keep it
        if src.startswith("assets/"):
            return f"![{alt_text}]({src})"
        return f"![{alt_text}](assets/{src_name})"

    # Match standard markdown ![alt](src)
    return re.sub(r"!\[(.*?)\]\((.*?)\)", replace_md_image, markdown_text)
