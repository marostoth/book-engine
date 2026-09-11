import React, { useEffect, useState, useRef } from "react";
import { Check, Edit3, Eye, FileText, Save } from "lucide-react";
import { fetchNotes, persistNotes } from "../lib/api";

interface NotesPaneProps {
  bookId: string;
  chapterFile: string;
  insertedQuote: { quote: string; anchorId?: string } | null;
  onClearInsertedQuote: () => void;
}

export const NotesPane: React.FC<NotesPaneProps> = ({
  bookId,
  chapterFile,
  insertedQuote,
  onClearInsertedQuote,
}) => {
  const [content, setContent] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const saveTimeoutRef = useRef<number | null>(null);

  const notesFileName = chapterFile.replace(".md", "-notes.md");

  // Load notes when chapter changes
  useEffect(() => {
    let isMounted = true;
    fetchNotes(bookId, notesFileName).then((loaded) => {
      if (isMounted) {
        setContent(loaded);
        setIsSaved(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [bookId, notesFileName]);

  // Insert quote if triggered from selection menu
  useEffect(() => {
    if (insertedQuote) {
      const anchorSuffix = insertedQuote.anchorId ? ` (#${insertedQuote.anchorId})` : "";
      const quoteBlock = `\n\n> "${insertedQuote.quote}"${anchorSuffix}\n\n- Reflection: \n`;
      setContent((prev) => prev + quoteBlock);
      setIsSaved(false);
      onClearInsertedQuote();
    }
  }, [insertedQuote, onClearInsertedQuote]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setContent(newText);
    setIsSaved(false);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Auto-save after 800ms debounce
    saveTimeoutRef.current = window.setTimeout(() => {
      persistNotes(bookId, notesFileName, newText).then(() => {
        setIsSaved(true);
      });
    }, 800);
  };

  const handleManualSave = () => {
    persistNotes(bookId, notesFileName, content).then(() => {
      setIsSaved(true);
    });
  };

  return (
    <div className="w-96 flex-shrink-0 border-l border-black/10 dark:border-white/10 bg-white/75 dark:bg-nord-surface/75 backdrop-blur-md flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-3.5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-100">
          <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Chapter Reflections</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Mode Switch: Edit / Preview */}
          <button
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            className="p-1.5 rounded-md text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title={mode === "edit" ? "Preview Markdown" : "Edit Notes"}
          >
            {mode === "edit" ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
          </button>

          {/* Save status */}
          <button
            onClick={handleManualSave}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
              isSaved
                ? "text-neutral-400 dark:text-neutral-500"
                : "text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
            }`}
            title={isSaved ? "Saved to vault" : "Click to save"}
          >
            {isSaved ? <Check className="w-3 h-3 text-emerald-500" /> : <Save className="w-3 h-3" />}
            <span>{isSaved ? "Saved" : "Saving..."}</span>
          </button>
        </div>
      </div>

      {/* Editor or Preview Pane */}
      <div className="flex-1 p-4 overflow-y-auto">
        {mode === "edit" ? (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Capture personal reflections, hypotheses, and chapter connections..."
            className="w-full h-full bg-transparent resize-none focus:outline-none font-mono text-xs leading-relaxed text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
            spellCheck={false}
          />
        ) : (
          <div className="prose prose-sm dark:prose-invert font-sans text-xs leading-relaxed select-text">
            {content.split("\n\n").map((para, i) => {
              if (para.startsWith("# ")) {
                return (
                  <h3 key={i} className="font-semibold text-sm mt-2 mb-1">
                    {para.slice(2)}
                  </h3>
                );
              }
              if (para.startsWith("## ")) {
                return (
                  <h4 key={i} className="font-semibold text-xs mt-3 mb-1 text-neutral-700 dark:text-neutral-300">
                    {para.slice(3)}
                  </h4>
                );
              }
              if (para.startsWith(">")) {
                return (
                  <blockquote
                    key={i}
                    className="border-l-2 border-sky-500 pl-2.5 my-2 italic text-neutral-600 dark:text-neutral-400 text-xs"
                  >
                    {para.replace(/^>\s?/, "")}
                  </blockquote>
                );
              }
              return (
                <p key={i} className="mb-2 text-neutral-700 dark:text-neutral-300">
                  {para}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* File target indicator */}
      <div className="p-2.5 border-t border-black/5 dark:border-white/5 text-[10px] text-neutral-400 dark:text-neutral-500 truncate font-mono">
        vault/notes/{bookId}/{notesFileName}
      </div>
    </div>
  );
};
