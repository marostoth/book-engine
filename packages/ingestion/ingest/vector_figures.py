"""Vector and live-text diagram rasterization for PDF ingestion."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pymupdf
from ingest.assets import pad_and_clamp_rect, PADDING


def figure_file_name(chapter_idx: int, major: int, minor: int) -> str:
    """The picture file of Figure `major`.`minor` in part `chapter_idx`.

    The name carries the whole number of the figure. It used to carry the minor number only, so Figure 2.1 and
    Figure 3.1 of the same part wrote one file and one figure showed the picture of the other: 3 figures of
    Principles of Marketing did (IN-10).
    """
    return f"fig-{chapter_idx:02d}-{major}-{minor}.png"


def _extract_figure_heading(block_text: str) -> Optional[Tuple[int, int, str]]:
    """Extracts (major, minor, title) from a figure caption block, filtering narrative text."""
    m = re.search(
        r"(?:^|\n)(?:>\s*)?(?:FIGURE|Figure)\s+(\d+)[\.\s]+(\d+)\s*\n?(.*)",
        block_text,
        re.DOTALL,
    )
    if not m:
        return None

    major, minor = int(m.group(1)), int(m.group(2))
    rest = m.group(3).strip()
    title_lines = [line.strip() for line in rest.split("\n") if line.strip()]
    title = " ".join(title_lines[:2]) if title_lines else f"Figure {major}.{minor}"

    # Filter out in-text narrative sentences (e.g. 'Figure 1.1 presents a simple...')
    if len(title) > 90 or (title_lines and title_lines[0].endswith(".")):
        return None

    # Clean punctuation / trailing colons
    title = re.sub(r"^[:\s\-]+", "", title).strip()
    title = re.sub(r"[:\s\-]+$", "", title).strip()
    return major, minor, title


def _has_discrete_image(page: pymupdf.Page, heading_rect: pymupdf.Rect) -> bool:
    """Returns True if a large discrete raster image already covers the diagram quadrant."""
    for img in page.get_images():
        if img[2] >= 250 and img[3] >= 150:
            for r in page.get_image_rects(img[0]):
                if r.width >= 200 and r.height >= 120:
                    if abs(r.y0 - heading_rect.y0) < 250 or abs(r.y1 - heading_rect.y1) < 250:
                        return True
    return False


def _is_stop_block(b_dict: dict, heading_rect: pymupdf.Rect, page_rect: pymupdf.Rect) -> bool:
    """Determines if a text block is a section heading, chapter header, or body narrative stop."""
    text = "".join(s["text"] for l in b_dict.get("lines", []) for s in l.get("spans", [])).strip()
    if not text:
        return False
    bbox = pymupdf.Rect(b_dict["bbox"])
    # Only stop if it shares column with heading or spans width (> 350pt)
    shares_col = max(bbox.x0, heading_rect.x0) < min(bbox.x1, heading_rect.x1) + 20 or bbox.width > 350
    if not shares_col:
        return False
    max_font = max((s["size"] for l in b_dict.get("lines", []) for s in l.get("spans", [])), default=0.0)
    if max_font >= 12.0:
        return True
    if re.match(r"(?i)^(?:chapter\b|part\b|objective\b|learning objective|case\b|table\b|#)", text):
        return True
    if re.match(r"^[A-Z\s,:\-–—]{4,}$", text):
        return True
    if len(text) > 85 and bbox.width > 180:
        return True
    return False


def _compute_diagram_bounds(
    page: pymupdf.Page,
    heading_rect: pymupdf.Rect,
) -> Optional[Tuple[pymupdf.Rect, float, float]]:
    """Computes diagram bounding box from caption, vector drawings, and live text blocks,
    strictly clamped by adjacent heading and body text stop boundaries without column clipping.
    """
    dict_blocks = [b for b in page.get_text("dict")["blocks"] if b.get("type") == 0]

    # 1. Hard stop below heading_rect
    max_y1 = page.rect.height
    for b in dict_blocks:
        bbox = pymupdf.Rect(b["bbox"])
        if bbox.y0 >= heading_rect.y1 - 5 and _is_stop_block(b, heading_rect, page.rect):
            if bbox.y0 < max_y1:
                max_y1 = bbox.y0

    # 2. Hard stop above heading_rect if diagram extends above
    min_y0 = 0.0
    for b in dict_blocks:
        bbox = pymupdf.Rect(b["bbox"])
        if bbox.y1 <= heading_rect.y0 + 5 and _is_stop_block(b, heading_rect, page.rect):
            if bbox.y1 > min_y0:
                min_y0 = bbox.y1

    union_r = pymupdf.Rect(heading_rect)
    has_elements = False

    # Check vector drawings within vertical bounds and proximity
    for d in page.get_drawings():
        r = d["rect"]
        if r.width >= 0.85 * page.rect.width and r.height >= 0.85 * page.rect.height:
            continue
        if r.y0 >= min_y0 - 2 and r.y1 <= max_y1 + 2:
            if r.y1 >= heading_rect.y0 - 350 and r.y0 <= heading_rect.y1 + 350:
                union_r = union_r | r
                has_elements = True

    # Check raster image slices within vertical bounds and proximity
    for img in page.get_images():
        for r in page.get_image_rects(img[0]):
            if r.width >= 0.85 * page.rect.width and r.height >= 0.85 * page.rect.height:
                continue
            if r.y0 >= min_y0 - 2 and r.y1 <= max_y1 + 2:
                if r.y1 >= heading_rect.y0 - 350 and r.y0 <= heading_rect.y1 + 350:
                    union_r = union_r | r
                    has_elements = True

    if not has_elements:
        return None

    # Incorporate internal diagram text labels
    for b in dict_blocks:
        bbox = pymupdf.Rect(b["bbox"])
        if bbox.y0 >= min_y0 - 2 and bbox.y1 <= max_y1 + 2:
            if bbox.y1 >= union_r.y0 - 10 and bbox.y0 <= union_r.y1 + 10:
                if not _is_stop_block(b, heading_rect, page.rect):
                    union_r = union_r | bbox

    # Cap total height at 0.70 * page.rect.height
    max_height = 0.70 * page.rect.height
    if union_r.height > max_height:
        union_r.y1 = union_r.y0 + max_height

    if union_r.width < 50 or union_r.height < 50:
        return None

    return union_r, min_y0, max_y1


def mask_page_figure_zones(
    page: pymupdf.Page,
    extra_rects: Optional[List[pymupdf.Rect]] = None,
) -> None:
    """No-op: Text redactions are permanently abolished to preserve reading prose integrity."""
    return



def detect_and_rasterize_vector_figures(
    doc: pymupdf.Document,
    page_numbers: List[int],
    chapter_idx: int,
    assets_dir: Path,
    dpi: int = 200,
    padding: float = 12.0,
    markdown_text: Optional[str] = None,
) -> Dict[Tuple[int, int], Tuple[Any, ...]]:
    """Detects vector diagrams without discrete images, rasterizes pristine snapshots, and returns asset map."""
    assets_dir.mkdir(parents=True, exist_ok=True)
    figure_map: Dict[Tuple[int, int], Tuple[Any, ...]] = {}

    for page_num in page_numbers:
        if page_num < 0 or page_num >= len(doc):
            continue
        page = doc[page_num]
        blocks = page.get_text("blocks")

        for b in blocks:
            if b[6] != 0:
                continue
            parsed = _extract_figure_heading(b[4].strip())
            if not parsed:
                continue
            major, minor, title = parsed

            # If markdown is provided, rasterize if a leaked table/caption/stream is present
            if markdown_text is not None:
                leaked = re.search(
                    r"(?:\|(?:\s*#*\s*)?|\b)FIGURE\s+" + str(major) + r"[\.\s]+" + str(minor),
                    markdown_text,
                    re.IGNORECASE,
                )
                if not leaked:
                    continue

            heading_rect = pymupdf.Rect(b[:4])
            if _has_discrete_image(page, heading_rect):
                continue

            bounds_res = _compute_diagram_bounds(page, heading_rect)
            if not bounds_res:
                continue
            diag_rect, min_y0, max_y1 = bounds_res

            clip_rect = pad_and_clamp_rect(
                diag_rect, page.rect, padding=padding, min_y0=min_y0, max_y1=max_y1
            )
            if clip_rect.is_empty:
                continue

            # Pristine Snapshot First: render directly from unredacted source document
            pix = page.get_pixmap(clip=clip_rect, dpi=dpi)
            img_filename = figure_file_name(chapter_idx, major, minor)
            target_path = assets_dir / img_filename
            pix.save(str(target_path))
            del pix

            figure_map[(major, minor)] = (f"assets/{img_filename}", title, page_num, diag_rect)

    return figure_map


def replace_vector_diagram_streams(
    markdown_text: str,
    figure_map: Dict[Tuple[int, int], Tuple[Any, ...]],
) -> str:
    """Replaces unformatted markdown table/text streams with rasterized figure image tags."""
    updated_md = markdown_text

    for (major, minor), val in figure_map.items():
        asset_href, title = val[0], val[1]
        img_tag = f"![Figure {major}.{minor}: {title}]({asset_href})"

        # Pattern 1: Leaked markdown table starting with FIGURE major.minor
        table_pattern = re.compile(
            rf"\|(?:\s*#*\s*)?FIGURE\s+{major}[\.\s]+{minor}[^\n]*\n(?:\|[^\n]*\n*)+",
            re.IGNORECASE,
        )

        def _replace_table(match: re.Match[str]) -> str:
            m_text = match.group(0).strip()
            anchor_m = re.search(r"\^p-\d+", m_text)
            if anchor_m:
                return f"{img_tag} {anchor_m.group(0)}"
            return img_tag

        if table_pattern.search(updated_md):
            updated_md = table_pattern.sub(_replace_table, updated_md, count=1)
            continue

        caption_pattern = re.compile(
            rf"(?:^|\n\n)(?:#+\s*)?(?:FIGURE|Figure)\s+{major}[\.\s]+{minor}[^\n]*(?:\s*\^p-\d+)?(?=\n\n|\Z)",
            re.IGNORECASE,
        )

        def _replace_caption(match: re.Match[str]) -> str:
            m_text = match.group(0).strip()
            anchor_m = re.search(r"\^p-\d+$", m_text)
            if anchor_m:
                return f"\n\n{img_tag} {anchor_m.group(0)}"
            return f"\n\n{img_tag}"

        if caption_pattern.search(updated_md):
            updated_md = caption_pattern.sub(_replace_caption, updated_md, count=1)
            continue

        ref_pattern = re.compile(
            rf"((?:\A|\n\n)[^\n]*\b(?:Figure|FIGURE)\s+{major}[\.\s]+{minor}\b[^\n]*)(?=\n\n|\Z)",
            re.IGNORECASE,
        )
        if ref_pattern.search(updated_md):
            updated_md = ref_pattern.sub(rf"\1\n\n{img_tag}", updated_md, count=1)
            continue

        # Pattern 4: Fallback append
        updated_md = f"{updated_md}\n\n{img_tag}\n"

    return updated_md
