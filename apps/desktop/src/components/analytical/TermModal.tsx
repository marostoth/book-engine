import React, { useState, useEffect } from "react";
import { AuthorTerm, AnchoredCitation } from "../../lib/types/analytical";

interface TermModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (term: AuthorTerm) => void;
  stagedCitation: AnchoredCitation | null;
  editingTerm: AuthorTerm | null;
  currentChapterFile?: string;
}

export const TermModal: React.FC<TermModalProps> = ({
  isOpen,
  onClose,
  onSave,
  stagedCitation,
  editingTerm,
  currentChapterFile,
}) => {
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [chapterFile, setChapterFile] = useState("");
  const [anchor, setAnchor] = useState("");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingTerm) {
      setTerm(editingTerm.term);
      setDefinition(editingTerm.authorDefinition);
      setChapterFile(editingTerm.citation.chapterFile);
      setAnchor(editingTerm.citation.anchor);
      setQuote(editingTerm.citation.quote);
    } else if (stagedCitation) {
      setTerm("");
      setDefinition("");
      setChapterFile(stagedCitation.chapterFile);
      setAnchor(stagedCitation.anchor);
      setQuote(stagedCitation.quote);
    } else {
      setTerm("");
      setDefinition("");
      setChapterFile(currentChapterFile || "");
      setAnchor("^p-001");
      setQuote("");
    }
    setError(null);
  }, [editingTerm, stagedCitation, currentChapterFile, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) {
      setError("Please specify the author's specialized term.");
      return;
    }
    if (!definition.trim()) {
      setError("Please capture the author's definition or context.");
      return;
    }

    const payload: AuthorTerm = {
      id: editingTerm ? editingTerm.id : `term-${Date.now()}`,
      term: term.trim(),
      authorDefinition: definition.trim(),
      citation: {
        chapterFile: chapterFile.trim() || currentChapterFile || "unknown.md",
        anchor: anchor.trim() || "^p-001",
        quote: quote.trim(),
      },
    };

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                Rule 5: Coming to Terms
              </span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-zinc-100">
              {editingTerm ? "Edit Author Term" : "Define Author Term"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-sm">
          <div>
            <label className="block font-medium text-zinc-300 mb-1">
              Author Term / Keyword
            </label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. Division of Labour, Concurrency"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-medium text-zinc-300 mb-1">
              Author's Specialized Definition / Sense
            </label>
            <textarea
              rows={3}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="How does the author specifically employ and restrict this term?"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-amber-400/90">
                Source Citation Anchor
              </span>
              <span>{chapterFile} #{anchor}</span>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Verbatim Excerpt / Evidence
              </label>
              <textarea
                rows={2}
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                placeholder="Verbatim text from the chapter where the term appears..."
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-amber-500"
            >
              {editingTerm ? "Update Term" : "Save Term"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
