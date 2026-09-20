import React, { useState } from "react";
import { NeutralTerm, TermMapping, StagedCitation } from "../../lib/types/syntopicon";
import { formKey, neutralTermFormStart } from "../../lib/formStart";
import { Plus, Trash2, Link, BookOpen } from "lucide-react";
import { useDialog } from "../../hooks/useDialog";
import { DiscardNotice } from "../DiscardNotice";

interface NeutralTermModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (term: NeutralTerm) => void;
  stagedCitation: StagedCitation | null;
  editingTerm: NeutralTerm | null;
  currentBookId?: string | null;
  currentChapterFile?: string;
}

/**
 * The window is built only while it is open, and a new neutral term is a new `key`, so React builds the form again
 * from what `neutralTermFormStart` works out. An effect used to write over every field instead (TL-11).
 */
export const NeutralTermModal: React.FC<NeutralTermModalProps> = (props) => {
  if (!props.isOpen) return null;
  const { editingTerm, stagedCitation, currentBookId, currentChapterFile } = props;
  return (
    <OpenNeutralTermModal
      {...props}
      key={formKey([
        editingTerm?.id,
        stagedCitation?.bookId,
        stagedCitation?.anchor,
        currentBookId,
        currentChapterFile,
      ])}
    />
  );
};

const OpenNeutralTermModal: React.FC<NeutralTermModalProps> = ({
  isOpen,
  onClose,
  onSave,
  stagedCitation,
  editingTerm,
  currentBookId,
  currentChapterFile,
}) => {
  const [start] = useState(() =>
    neutralTermFormStart(editingTerm, stagedCitation, currentBookId, currentChapterFile)
  );
  const [term, setTerm] = useState(start.term);
  const [definition, setDefinition] = useState(start.definition);
  const [mappings, setMappings] = useState<TermMapping[]>(start.mappings);
  const [error, setError] = useState<string | null>(null);

  // New mapping form states
  const [mapBookId, setMapBookId] = useState(start.mapBookId);
  const [mapVariant, setMapVariant] = useState(start.mapVariant);
  const [mapChapter, setMapChapter] = useState(start.mapChapter);
  const [mapAnchor, setMapAnchor] = useState(start.mapAnchor);
  const [mapQuote, setMapQuote] = useState(start.mapQuote);

  // A form the reader types into: Escape asks before it throws the words away (RD-07).
  const { panelProps, titleId, close, askedToDiscard } = useDialog({ isOpen, onClose, protectTyping: true });

  const handleAddMapping = () => {
    if (!mapBookId.trim() || !mapVariant.trim() || !mapAnchor.trim()) {
      setError("Please provide Book ID, Author's Variant, and Anchor Citation.");
      return;
    }

    const newMapping: TermMapping = {
      bookId: mapBookId.trim(),
      authorVariant: mapVariant.trim(),
      citation: {
        bookId: mapBookId.trim(),
        chapterFile: mapChapter.trim() || "ch-01.md",
        anchor: mapAnchor.trim(),
        quote: mapQuote.trim(),
      },
    };

    setMappings([...mappings, newMapping]);
    setMapVariant("");
    setMapQuote("");
    setError(null);
  };

  const handleRemoveMapping = (idx: number) => {
    setMappings(mappings.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) {
      setError("Please specify the neutral syntopical term (Rule 2).");
      return;
    }
    if (!definition.trim()) {
      setError("Please provide a neutral definition synthesizing the authors' concepts.");
      return;
    }
    if (mappings.length === 0) {
      setError("Please attach at least one author terminology mapping.");
      return;
    }

    onSave({
      id: editingTerm ? editingTerm.id : `term-${Date.now()}`,
      term: term.trim(),
      neutralDefinition: definition.trim(),
      mappings,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        {...panelProps}
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-stone-200"
      >
        <div className="px-6 py-4 border-b border-stone-800 flex justify-between items-center bg-stone-900/80">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-amber-200 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              {editingTerm ? "Edit Neutral Term" : "New Neutral Term (Rule 2: Bringing Authors to Terms)"}
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Establish a common vocabulary that transcends any single author&apos;s idiosyncratic terminology.
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close without saving the term"
            className="text-stone-400 hover:text-stone-200 text-lg px-2"
          >
            ✕
          </button>
        </div>

        {askedToDiscard && (
          <div className="px-6 pt-3">
            <DiscardNotice />
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-950/60 border border-red-800/80 rounded text-red-300 text-xs">{error}</div>}

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-400 mb-1">Neutral Syntopic Term</label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. Division of Labor / Operational Specialization"
              className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-stone-200 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-400 mb-1">Neutral Definition</label>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={2}
              placeholder="Synthesized definition encompassing the different author perspectives..."
              className="w-full bg-stone-950 border border-stone-700 rounded px-3 py-2 text-stone-200 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Mappings List */}
          <div className="border-t border-stone-800 pt-4">
            <label className="block text-xs font-semibold uppercase text-stone-400 mb-2">
              Author Terminology Mappings ({mappings.length})
            </label>
            {mappings.length > 0 && (
              <div className="space-y-2 mb-3">
                {mappings.map((m, idx) => (
                  <div key={idx} className="bg-stone-950/80 border border-stone-800 rounded p-2.5 flex items-start justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono">{m.bookId}</span>
                        <span className="font-semibold text-stone-200">&ldquo;{m.authorVariant}&rdquo;</span>
                      </div>
                      <div className="text-stone-400 mt-1 text-[11px]">
                        {m.citation.chapterFile} <span className="font-mono text-amber-400/80">{m.citation.anchor}</span>
                        {m.citation.quote && <p className="italic text-stone-400 mt-0.5 line-clamp-1">&ldquo;{m.citation.quote}&rdquo;</p>}
                      </div>
                    </div>
                    <button type="button" aria-label="Remove this mapping" onClick={() => handleRemoveMapping(idx)} className="text-stone-500 hover:text-red-400 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Mapping Subform */}
            <div className="bg-stone-950/50 border border-stone-800 rounded p-3 space-y-2 text-xs">
              <div className="font-medium text-stone-300 flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5 text-amber-400" />
                Attach Author Translation &amp; Citation
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={mapBookId}
                  onChange={(e) => setMapBookId(e.target.value)}
                  placeholder="Book ID (e.g. wealth-of-nations)"
                  className="bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200"
                />
                <input
                  type="text"
                  value={mapVariant}
                  onChange={(e) => setMapVariant(e.target.value)}
                  placeholder="Author's phrasing (e.g. Division of Labour)"
                  className="bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={mapChapter}
                  onChange={(e) => setMapChapter(e.target.value)}
                  placeholder="Chapter file (e.g. ch-01.md)"
                  className="bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200"
                />
                <input
                  type="text"
                  value={mapAnchor}
                  onChange={(e) => setMapAnchor(e.target.value)}
                  placeholder="Anchor (e.g. ^p-001)"
                  className="bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200 font-mono"
                />
              </div>
              <input
                type="text"
                value={mapQuote}
                onChange={(e) => setMapQuote(e.target.value)}
                placeholder="Verbatim quote or excerpt..."
                className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-200 text-xs italic"
              />
              <button
                type="button"
                onClick={handleAddMapping}
                className="flex items-center gap-1 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-200 rounded text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Attach Author Mapping
              </button>
            </div>
          </div>

          <div className="border-t border-stone-800 pt-4 flex justify-end gap-2">
            <button type="button" onClick={close} className="px-4 py-2 rounded text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950">
              Save Neutral Term
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
