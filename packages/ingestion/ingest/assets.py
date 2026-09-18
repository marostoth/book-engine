"""Asset and embedded media extraction for EPUB and document pipelines."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import ebooklib
import pymupdf
from ebooklib import epub

# A drawing that a book holds as SVG is markup, not pixels, so it can carry a script. The reader shows every
# picture through an `<img>` tag, where no script of a picture runs, but the file lives in the vault and any
# other program may open it. So the script comes out before the file is written, the way the import writes a
# `<` of the book text as `&lt;` (SEC-01, IN-10).
_SVG_SCRIPT = re.compile(rb"<script\b[^>]*>.*?</script\s*>|<script\b[^>]*/\s*>", re.IGNORECASE | re.DOTALL)
_SVG_HANDLER = re.compile(rb"\son[a-zA-Z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)
_SVG_JAVASCRIPT = re.compile(rb"javascript\s*:", re.IGNORECASE)


def svg_without_script(content: bytes) -> bytes:
    """An SVG of the book with no script in it: no `<script>`, no `onclick=`, no `javascript:` (IN-10)."""
    content = _SVG_SCRIPT.sub(b"", content)
    content = _SVG_HANDLER.sub(b"", content)
    return _SVG_JAVASCRIPT.sub(b"", content)


def extract_epub_assets(book: epub.EpubBook, assets_dir: Path) -> dict[str, str]:
    """Extract embedded images from an EPUB to assets_dir.

    Only images with width >= 60 and height >= 60 pixels are extracted;
    tiny tracking pixels, icons, and spacer glyphs are filtered out.

    Returns a mapping from original EPUB href/names to the normalized vault relative path:
    e.g. {'images/diagram.png': 'assets/diagram.png', 'cover.jpeg': 'assets/cover.jpeg'}
    """
    import pymupdf

    assets_dir.mkdir(parents=True, exist_ok=True)
    asset_map: dict[str, str] = {}
    # Which picture of the book took each file name. A book can hold `images/fig1.png` and `notes/fig1.png`,
    # and the plain name alone let the second write over the first, so one picture was lost and the other was
    # shown twice (IN-10).
    taken: dict[str, str] = {}

    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_IMAGE:
            content = item.get_content()
            if item.get_name().lower().endswith(".svg"):
                content = svg_without_script(content)
            try:
                pix = pymupdf.Pixmap(content)
                width, height = pix.width, pix.height
                del pix
                if width < 60 or height < 60:
                    continue
            except Exception:
                # If cannot decode pixmap but content is sizable (>1024 bytes), retain
                if len(content) < 1024:
                    continue

            # item.file_name might be "images/fig1.png" or "OEBPS/images/fig1.png"
            file_name = Path(item.get_name()).name
            # Ensure unique and safe filename
            safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file_name)
            if taken.get(safe_name, item.get_name()) != item.get_name():
                # Another picture of the book has this plain name already, so this one keeps a mark of its
                # own place in the book and both pictures stay (IN-10).
                mark = hashlib.sha256(item.get_name().encode("utf-8")).hexdigest()[:8]
                stem, dot, ending = safe_name.rpartition(".")
                safe_name = f"{stem}-{mark}{dot}{ending}" if dot else f"{safe_name}-{mark}"
            taken[safe_name] = item.get_name()
            target_path = assets_dir / safe_name

            with open(target_path, "wb") as f:
                f.write(content)

            rel_asset_path = f"assets/{safe_name}"
            # Map various ways this image might be referenced in HTML. The whole name inside the book names one
            # picture, so it is written. A plain name can belong to more than one picture, so the first one
            # keeps it and the rest are found by their whole name (IN-10).
            asset_map[item.get_name()] = rel_asset_path
            asset_map.setdefault(file_name, rel_asset_path)
            # If item.file_name is "images/fig1.png", also map "../images/fig1.png"
            asset_map[f"../{item.get_name()}"] = rel_asset_path
            if "/" in item.get_name():
                sub_path = item.get_name().split("/", 1)[1]
                asset_map.setdefault(sub_path, rel_asset_path)
                asset_map.setdefault(f"../{sub_path}", rel_asset_path)

    return asset_map


def normalize_image_markdown(markdown_text: str, asset_map: dict[str, str]) -> str:
    """Normalize image links in Markdown text to use vault relative asset paths.

    If an image was filtered out because it was < 60x60, removes the markdown reference.
    """

    def replace_md_image(match: re.Match[str]) -> str:
        alt_text = match.group(1)
        src = match.group(2).strip()
        # Look up directly or by filename
        src_name = Path(src).name
        target = asset_map.get(src) or asset_map.get(src_name)
        if target:
            return f"![{alt_text}]({target})"
        # If already starts with assets/, check if filename is known
        if src.startswith("assets/"):
            file_part = src.replace("assets/", "")
            if file_part in asset_map.values() or any(v == src for v in asset_map.values()):
                return f"![{alt_text}]({src})"
        # If not found in asset_map, it was filtered out: drop the tag
        return ""

    # Match standard markdown ![alt](src)
    return re.sub(r"!\[(.*?)\]\((.*?)\)", replace_md_image, markdown_text)


PADDING: float = 18.0
CAPTION_MARGIN: float = 30.0


def pad_and_clamp_rect(
    raw_rect: pymupdf.Rect,
    page_rect: pymupdf.Rect,
    padding: float = PADDING,
    min_y0: float | None = None,
    max_y1: float | None = None,
) -> pymupdf.Rect:
    """Pads a bounding box by padding on all sides and clamps to page bounds and stop lines."""
    y0_floor = max(0.0, min_y0) if min_y0 is not None else 0.0
    y1_ceil = min(page_rect.height, max_y1) if max_y1 is not None else page_rect.height
    padded = pymupdf.Rect(
        max(0.0, raw_rect.x0 - padding),
        max(y0_floor, raw_rect.y0 - padding),
        min(page_rect.width, raw_rect.x1 + padding),
        min(y1_ceil, raw_rect.y1 + padding),
    )
    return pymupdf.Rect(padded & page_rect)


def find_adjacent_caption_rect(
    page: pymupdf.Page,
    target_rect: pymupdf.Rect,
    max_distance: float = CAPTION_MARGIN,
) -> pymupdf.Rect | None:
    """Detects adjacent caption blocks ('Figure \\d+[\\.\\d]*' or 'FIGURE \\d+') within max_distance of target_rect."""
    blocks = page.get_text("blocks")
    caption_rects: list[pymupdf.Rect] = []
    for b in blocks:
        if len(b) < 7 or b[6] != 0:  # text blocks only
            continue
        text = b[4].strip()
        if re.search(r"\b(?:Figure|FIGURE)\s+\d+(?:[\.\s]\s*\d+)?", text, re.IGNORECASE):
            b_rect = pymupdf.Rect(b[0], b[1], b[2], b[3])
            y_close = b_rect.y0 - target_rect.y1 <= max_distance and target_rect.y0 - b_rect.y1 <= max_distance
            x_close = b_rect.x0 - target_rect.x1 <= max_distance and target_rect.x0 - b_rect.x1 <= max_distance
            y_overlap = max(0.0, min(b_rect.y1, target_rect.y1) - max(b_rect.y0, target_rect.y0)) > 0
            x_overlap = max(0.0, min(b_rect.x1, target_rect.x1) - max(b_rect.x0, target_rect.x0)) > 0

            if (y_overlap and x_close) or (x_overlap and y_close) or (x_close and y_close):
                caption_rects.append(b_rect)

    if not caption_rects:
        return None

    union_rect = caption_rects[0]
    for r in caption_rects[1:]:
        union_rect = union_rect | r
    return union_rect


def union_figure_with_caption(
    page: pymupdf.Page,
    raw_rect: pymupdf.Rect,
    padding: float = PADDING,
    caption_margin: float = CAPTION_MARGIN,
) -> pymupdf.Rect:
    """Clamps and pads image rect, unions any adjacent figure caption, and clamps to page."""
    base_rect = pad_and_clamp_rect(raw_rect, page.rect, padding=padding)
    caption_rect = find_adjacent_caption_rect(page, raw_rect, max_distance=caption_margin)
    if caption_rect:
        base_rect = (base_rect | caption_rect) & page.rect
    return base_rect


def extract_padded_figure_pixmap(
    page: pymupdf.Page,
    raw_rect: pymupdf.Rect,
    padding: float = PADDING,
    caption_margin: float = CAPTION_MARGIN,
    dpi: int = 200,
) -> pymupdf.Pixmap:
    """Renders a snapshot of a figure region with padding and adjacent caption union, clamped to page."""
    clip_rect = union_figure_with_caption(page, raw_rect, padding=padding, caption_margin=caption_margin)
    return page.get_pixmap(clip=clip_rect, dpi=dpi)


def suppress_page_images(markdown_text: str, assets_dir: Path, page_indices: set[int]) -> str:
    """Removes auto-extracted images residing on page slices where a pristine vector snapshot
    was captured, and deletes the corresponding files from disk.

    `page_indices` holds 0-based page indices, and `pymupdf4llm` names a picture file by the 1-BASED page of
    the book, so page index 30 gives a file with `-0031-` in its name. Only that name belongs to the page.
    The old rule also took `-0030-`, which is the file of the page BEFORE, and deleted a picture of a page
    that had no snapshot at all: 4 pictures of Mind Over Markets and 48 of Principles of Marketing (IN-10).
    """

    def _suppress_image(match: re.Match[str]) -> str:
        src = match.group(2).strip()
        filename = Path(src).name
        if filename.startswith("fig-"):
            return match.group(0)

        for p in page_indices:
            if f"-{p + 1:04d}-" in filename:
                asset_path = assets_dir / filename
                asset_path.unlink(missing_ok=True)
                return ""
        return match.group(0)

    return re.sub(r"!\[(.*?)\]\((.*?)\)", _suppress_image, markdown_text)


def filter_and_normalize_markdown_assets(
    markdown_text: str,
    assets_dir: Path,
    min_pt: float = 50.0,
    max_aspect_ratio: float = 6.0,
    dpi: int = 150,
) -> str:
    """Filter and normalize embedded markdown images.

    Preserves intentional vector figure snapshots (starting with 'fig-').
    Rejects images with width < 50 pt, height < 50 pt, or aspect ratio > 6:1 (or < 1:6).
    Discards decorative arrows, gradient shadow strips, and tracking pixels from disk.
    Normalizes retained images to assets/<filename>.
    """
    scale = 72.0 / dpi if dpi else 1.0

    def process_markdown_image(match: re.Match[str]) -> str:
        alt = match.group(1)
        src = match.group(2).strip()
        filename = Path(src).name
        asset_path = assets_dir / filename

        if not asset_path.exists():
            return ""

        if filename.startswith("fig-"):
            return f"![{alt}](assets/{filename})"

        try:
            pix = pymupdf.Pixmap(str(asset_path))
            width, height = pix.width, pix.height
            width_pt = width * scale
            height_pt = height * scale
            aspect = width / max(height, 1)
            inv_aspect = height / max(width, 1)

            # Discard tiny/spindle assets or low-contrast drop-shadow strips (e.g. blurred shadow bands)
            if width_pt < min_pt or height_pt < min_pt or aspect > max_aspect_ratio or inv_aspect > max_aspect_ratio:
                del pix
                asset_path.unlink(missing_ok=True)
                return ""

            if not alt.strip() and height_pt < 120.0:
                s_min, s_max = min(pix.samples), max(pix.samples)
                if s_max - s_min < 75:
                    del pix
                    asset_path.unlink(missing_ok=True)
                    return ""

            del pix
            return f"![{alt}](assets/{filename})"
        except Exception:
            if asset_path.stat().st_size < 2048:
                asset_path.unlink(missing_ok=True)
                return ""
            return f"![{alt}](assets/{filename})"

    return re.sub(r"!\[(.*?)\]\((.*?)\)", process_markdown_image, markdown_text)


def cleanup_orphaned_assets(book_dir: Path, assets_dir: Path, chapter_files: list[str]) -> None:
    """Remove orphaned asset files in assets_dir that are not referenced by any chapter markdown."""
    if not assets_dir.exists():
        return
    referenced_assets = set()
    for ch_name in chapter_files:
        ch_path = book_dir / ch_name
        if ch_path.exists():
            ch_md = ch_path.read_text(encoding="utf-8")
            for m in re.finditer(r"!\[.*?\]\(assets/([^\)]+)\)", ch_md):
                referenced_assets.add(m.group(1))

    for existing in assets_dir.iterdir():
        if existing.is_file() and existing.name not in referenced_assets:
            existing.unlink(missing_ok=True)
