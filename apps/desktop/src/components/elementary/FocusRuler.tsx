import React, { useEffect, useState } from "react";
import { calculateDimOpacity } from "../../lib/elementaryPacer";

interface FocusRulerProps {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  dimmingPercent: number; // 20 to 98
  pacerActiveAnchor?: string | null;
  isPacerRunning?: boolean;
  pacerLockFocus?: boolean;
  activeHighlight?: boolean;
}

export const FocusRuler: React.FC<FocusRulerProps> = ({
  containerRef,
  enabled,
  dimmingPercent,
  pacerActiveAnchor,
  isPacerRunning = false,
  pacerLockFocus = true,
  activeHighlight = true,
}) => {
  const [hoveredAnchor, setHoveredAnchor] = useState<string | null>(null);

  // Track mouse hover on paragraphs with [data-anchor] when pacer isn't locked
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // When pacer is running and locked to focus, ignore hover
    if (isPacerRunning && pacerLockFocus) {
      setHoveredAnchor(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchorEl = target.closest<HTMLElement>("[data-anchor]");
      if (anchorEl) {
        const anchor = anchorEl.getAttribute("data-anchor");
        if (anchor && anchor !== hoveredAnchor) {
          setHoveredAnchor(anchor);
        }
      }
    };

    const handleMouseLeave = () => {
      setHoveredAnchor(null);
    };

    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [containerRef, enabled, hoveredAnchor, isPacerRunning, pacerLockFocus]);

  // Apply or reset sibling paragraph dimming and active paragraph accenting
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]"));
    if (paragraphs.length === 0) return;

    const resetParagraphStyles = () => {
      for (const p of paragraphs) {
        p.style.removeProperty("opacity");
        p.style.removeProperty("transition");
        p.style.removeProperty("border-left");
        p.style.removeProperty("padding-left");
        p.style.removeProperty("background-color");
        p.style.removeProperty("border-radius");
      }
    };

    if (!enabled) {
      resetParagraphStyles();
      return;
    }

    const cleanPacer = pacerActiveAnchor ? pacerActiveAnchor.replace(/^\^/, "") : null;
    // Priority: Locked Pacer > Hovered Anchor > Pacer Anchor > First Paragraph
    const activeTarget =
      isPacerRunning && pacerLockFocus && cleanPacer
        ? cleanPacer
        : hoveredAnchor || cleanPacer || paragraphs[0]?.getAttribute("data-anchor");

    const dimOpacity = calculateDimOpacity(dimmingPercent);

    for (const p of paragraphs) {
      const anchor = p.getAttribute("data-anchor");
      const isCurrent = anchor === activeTarget;

      p.style.transition =
        "opacity 220ms ease-out, background-color 220ms ease-out, border-color 220ms ease-out, padding 220ms ease-out";

      if (isCurrent) {
        p.style.opacity = "1";
        if (activeHighlight) {
          p.style.borderLeft = "3px solid var(--theme-accent, #f59e0b)";
          p.style.paddingLeft = "10px";
          p.style.backgroundColor = "rgba(245, 158, 11, 0.035)";
          p.style.borderRadius = "0 8px 8px 0";
        } else {
          p.style.removeProperty("border-left");
          p.style.removeProperty("padding-left");
          p.style.removeProperty("background-color");
          p.style.removeProperty("border-radius");
        }
      } else {
        p.style.opacity = dimOpacity.toString();
        p.style.removeProperty("border-left");
        p.style.removeProperty("padding-left");
        p.style.removeProperty("background-color");
        p.style.removeProperty("border-radius");
      }
    }

    return resetParagraphStyles;
  }, [
    containerRef,
    enabled,
    dimmingPercent,
    hoveredAnchor,
    pacerActiveAnchor,
    isPacerRunning,
    pacerLockFocus,
    activeHighlight,
  ]);

  return null;
};
