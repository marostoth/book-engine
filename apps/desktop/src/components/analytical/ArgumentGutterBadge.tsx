import React, { useEffect, useState, useMemo } from "react";
import { AnalyticalStore } from "../../lib/types/analytical";

export interface MarkerItem {
  type: "T" | "C" | "P" | "?";
  label: string;
  tooltip: string;
  colorClass: string;
}

interface ArgumentGutterBadgeProps {
  containerRef: React.RefObject<HTMLElement | null>;
  currentChapterFile: string;
  store: AnalyticalStore;
  activeLevel?: string;
  onBadgeClick?: (anchor: string) => void;
}

export const ArgumentGutterBadge: React.FC<ArgumentGutterBadgeProps> = ({
  containerRef,
  currentChapterFile,
  store,
  activeLevel,
  onBadgeClick,
}) => {
  const [positions, setPositions] = useState<Array<{ anchor: string; top: number; markers: MarkerItem[] }>>([]);

  // Map anchors to their cited markers for the active chapter
  const anchorMarkers = useMemo(() => {
    if (activeLevel !== "analytical") return new Map<string, MarkerItem[]>();

    const map = new Map<string, MarkerItem[]>();
    const addMarker = (rawAnchor: string, marker: MarkerItem) => {
      const clean = rawAnchor.replace(/^(\^|§)/, "");
      const existing = map.get(clean) || [];
      // avoid exact duplicate marker types on same anchor
      if (!existing.some((m) => m.type === marker.type && m.tooltip === marker.tooltip)) {
        map.set(clean, [...existing, marker]);
      }
    };

    // Index Author Terms
    store.terms.forEach((t) => {
      if (t.citation.chapterFile === currentChapterFile) {
        addMarker(t.citation.anchor, {
          type: "T",
          label: "Term",
          tooltip: `Rule 5 Term: ${t.term}`,
          colorClass: "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/40",
        });
      }
    });

    // Index Arguments (Conclusions & Premises)
    store.arguments.forEach((a) => {
      if (a.conclusion.chapterFile === currentChapterFile) {
        addMarker(a.conclusion.anchor, {
          type: "C",
          label: "Conclusion",
          tooltip: `Rule 6 Conclusion: ${a.title}`,
          colorClass: "bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/40",
        });
      }
      a.premises.forEach((p) => {
        if (p.chapterFile === currentChapterFile) {
          addMarker(p.anchor, {
            type: "P",
            label: "Premise",
            tooltip: `Rule 7 Premise for: ${a.title}`,
            colorClass: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/40",
          });
        }
      });
    });

    // Index Author Inquiries (Question & Solution Citations)
    (store.inquiries || []).forEach((inq) => {
      if (inq.citation && inq.citation.chapterFile === currentChapterFile) {
        addMarker(inq.citation.anchor, {
          type: "?",
          label: "Question",
          tooltip: `Rule 4 Question: ${inq.question} (${inq.priority})`,
          colorClass: "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/40",
        });
      }
      if (inq.solutionCitation && inq.solutionCitation.chapterFile === currentChapterFile) {
        addMarker(inq.solutionCitation.anchor, {
          type: "?",
          label: "Solution",
          tooltip: `Rule 8 Solution for: ${inq.question} (${inq.resolution})`,
          colorClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/40",
        });
      }
    });

    return map;
  }, [store, currentChapterFile, activeLevel]);

  // Compute absolute vertical tops relative to the scrolling container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || activeLevel !== "analytical" || anchorMarkers.size === 0) {
      setPositions([]);
      return;
    }

    const compute = () => {
      const cRect = container.getBoundingClientRect();
      const nextPositions: Array<{ anchor: string; top: number; markers: MarkerItem[] }> = [];

      anchorMarkers.forEach((markers, anchor) => {
        const el = container.querySelector<HTMLElement>(`[data-anchor="${anchor}"]`);
        if (el) {
          const elRect = el.getBoundingClientRect();
          const top = elRect.top - cRect.top + container.scrollTop;
          nextPositions.push({ anchor, top, markers });
        }
      });

      setPositions(nextPositions);
    };

    compute();
    const timeout = setTimeout(compute, 250);
    window.addEventListener("resize", compute);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", compute);
    };
  }, [containerRef, anchorMarkers, activeLevel]);

  if (activeLevel !== "analytical" || positions.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-y-0 right-3 md:right-6 pointer-events-none z-20 w-28">
      {positions.map(({ anchor, top, markers }) => (
        <div
          key={anchor}
          style={{ top: `${top}px` }}
          className="absolute right-0 flex items-center gap-1 pointer-events-auto flex-nowrap"
        >
          {markers.map((m, idx) => (
            <button
              key={idx}
              onClick={() => onBadgeClick?.(anchor)}
              title={m.tooltip}
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold shadow-sm transition-transform hover:scale-110 ${m.colorClass}`}
            >
              {m.type}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
