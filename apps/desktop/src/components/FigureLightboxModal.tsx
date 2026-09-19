import React, { useState, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Columns, Image as ImageIcon } from "lucide-react";
import { useDialog } from "../hooks/useDialog";

interface FigureLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  imageAlt: string;
  onOpenInSplit?: () => void;
}

export const FigureLightboxModal: React.FC<FigureLightboxModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  imageAlt,
  onOpenInSplit,
}) => {
  const [scale, setScale] = useState<number>(1);

  const handleResetZoom = useCallback(() => setScale(1), []);
  const handleZoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 3)), []);
  const handleZoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);

  // Escape and the focus come from the one shared rule now (RD-07).
  const { panelProps, titleId, close } = useDialog({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) setScale(1);
  }, [isOpen]);

  /**
   * The zoom keys of this window. They sit on the panel, not on `window`: the focus is held inside the lightbox while
   * it is open, and a key must never reach a window that another dialog covers.
   */
  const handleZoomKeys = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") handleZoomIn();
    else if (e.key === "-") handleZoomOut();
    else if (e.key === "0") handleResetZoom();
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      {...panelProps}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={close}
      onKeyDown={handleZoomKeys}
    >
      {/* Top Bar */}
      <div
        className="w-full flex items-center justify-between px-6 py-3 bg-neutral-900/90 border-b border-white/10 text-white select-none z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 max-w-[60%]">
          <ImageIcon className="w-5 h-5 text-nord-accent flex-shrink-0" />
          <h3 id={titleId} className="text-sm font-semibold truncate text-neutral-100" title={imageAlt}>
            {imageAlt || "Figure Diagram"}
          </h3>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/10 rounded-lg p-0.5 mr-2">
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-white/10 rounded-md text-neutral-300 hover:text-white transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs px-2 font-mono font-medium text-neutral-300 min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-white/10 rounded-md text-neutral-300 hover:text-white transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-white/10 rounded-md text-neutral-300 hover:text-white transition-colors ml-1 border-l border-white/10"
              title="Reset Zoom (0)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {onOpenInSplit && (
            <button
              onClick={() => {
                onOpenInSplit();
                close();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-nord-accent/20 hover:bg-nord-accent/30 text-nord-accent border border-nord-accent/40 rounded-lg transition-all"
              title="View original publisher page in Split View"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
          )}

          <button
            onClick={close}
            className="p-1.5 hover:bg-white/15 rounded-lg text-neutral-400 hover:text-white transition-colors ml-1"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 w-full flex items-center justify-center p-6 overflow-auto"
        onClick={close}
      >
        <div
          className="transition-transform duration-150 ease-out max-w-full max-h-full flex items-center justify-center"
          style={{ transform: `scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageSrc}
            alt={imageAlt}
            className="max-h-[82vh] max-w-[90vw] object-contain rounded-lg shadow-2xl border border-white/10 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
