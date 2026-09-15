import React, { useEffect, useState, useRef } from "react";
import { Check, Edit3, Eye, FileText, Lock, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { fetchNotes, persistNotes } from "../lib/api";
import { reportBackendError } from "../lib/backendErrors";

interface NotesPaneProps {
  bookId: string;
  chapterFile: string;
  insertedQuote: { quote: string; anchorId?: string } | null;
  onClearInsertedQuote: () => void;
}

/** The chapter notes: still loading, loaded, or failed to load. Only loaded notes can be edited and saved. */
type LoadState = "loading" | "ready" | "failed";
/** The newest text: saved, not saved yet, or failed to save. */
type SaveState = "saved" | "pending" | "failed";

const STATUS_TONES = {
  quiet: "text-[var(--theme-muted)]",
  active: "text-[var(--theme-accent)] bg-[var(--theme-accent)]/10 hover:bg-[var(--theme-accent)]/20",
  failed: "text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20",
};

/** The save status button. "Saved" shows only after a save that worked. */
function saveStatus(loadState: LoadState, saveState: SaveState) {
  if (loadState === "failed") {
    return { label: "Locked", title: "Your notes did not load, so editing is locked", tone: "failed", Icon: Lock, iconClass: "" } as const;
  }
  if (loadState === "loading") {
    return { label: "Loading...", title: "Loading your notes", tone: "quiet", Icon: Save, iconClass: "" } as const;
  }
  if (saveState === "failed") {
    return { label: "Not saved", title: "Not saved. Click to save again", tone: "failed", Icon: TriangleAlert, iconClass: "" } as const;
  }
  if (saveState === "pending") {
    return { label: "Saving...", title: "Click to save", tone: "active", Icon: Save, iconClass: "" } as const;
  }
  return { label: "Saved", title: "Saved to vault", tone: "quiet", Icon: Check, iconClass: "text-emerald-500" } as const;
}

export const NotesPane: React.FC<NotesPaneProps> = ({
  bookId,
  chapterFile,
  insertedQuote,
  onClearInsertedQuote,
}) => {
  const [content, setContent] = useState<string>("");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadAttempt, setLoadAttempt] = useState<number>(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const saveTimeoutRef = useRef<number | null>(null);

  const notesFileName = chapterFile.replace(".md", "-notes.md");
  const canEdit = loadState === "ready";
  const status = saveStatus(loadState, saveState);

  // Load notes when chapter changes. Editing stays locked until they load: a save before that would overwrite the
  // notes file with text that is not in it.
  useEffect(() => {
    let isMounted = true;
    setLoadState("loading");
    fetchNotes(bookId, notesFileName)
      .then((loaded) => {
        if (isMounted) {
          setContent(loaded);
          setSaveState("saved");
          setLoadState("ready");
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadState("failed");
          reportBackendError("Your chapter notes did not load, so the notes pane is locked.", err);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [bookId, notesFileName, loadAttempt]);

  // Insert quote if triggered from selection menu
  useEffect(() => {
    if (insertedQuote) {
      const anchorSuffix = insertedQuote.anchorId ? ` (#${insertedQuote.anchorId})` : "";
      const quoteBlock = `\n\n> "${insertedQuote.quote}"${anchorSuffix}\n\n- Reflection: \n`;
      setContent((prev) => prev + quoteBlock);
      setSaveState("pending");
      onClearInsertedQuote();
    }
  }, [insertedQuote, onClearInsertedQuote]);

  // A failed save keeps the text in the pane. The next edit, or a click on "Not saved", saves it again.
  const saveNotes = (text: string) => {
    persistNotes(bookId, notesFileName, text)
      .then(() => setSaveState("saved"))
      .catch((err) => {
        setSaveState("failed");
        reportBackendError("Your chapter notes were not saved. Your text is still in the notes pane.", err);
      });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!canEdit) return;
    const newText = e.target.value;
    setContent(newText);
    setSaveState("pending");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Auto-save after 800ms debounce
    saveTimeoutRef.current = window.setTimeout(() => saveNotes(newText), 800);
  };

  const handleManualSave = () => {
    if (canEdit) {
      saveNotes(content);
    }
  };

  return (
    <div className="w-96 flex-shrink-0 border-l border-[var(--theme-border)] bg-[var(--theme-surface)]/85 text-[var(--theme-text)] backdrop-blur-md flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-3.5 border-b border-[var(--theme-border)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-text)]">
          <FileText className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
          <span>Chapter Reflections</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Mode Switch: Edit / Preview */}
          <button
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            className="p-1.5 rounded-md text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/10 transition-colors"
            title={mode === "edit" ? "Preview Markdown" : "Edit Notes"}
          >
            {mode === "edit" ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
          </button>

          {/* Save status */}
          <button
            onClick={handleManualSave}
            disabled={!canEdit}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${STATUS_TONES[status.tone]}`}
            title={status.title}
          >
            <status.Icon className={`w-3 h-3 ${status.iconClass}`} />
            <span>{status.label}</span>
          </button>
        </div>
      </div>

      {/* Editor or Preview Pane */}
      <div className="flex-1 p-4 overflow-y-auto">
        {loadState === "failed" ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-xs text-[var(--theme-muted)]">
            <Lock className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="max-w-[16rem] leading-relaxed">
              Your notes for this chapter did not load. Editing is locked, so a save cannot overwrite your notes file.
            </p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--theme-border)] font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try again</span>
            </button>
          </div>
        ) : mode === "edit" ? (
          <textarea
            value={content}
            onChange={handleChange}
            readOnly={!canEdit}
            placeholder="Capture personal reflections, hypotheses, and chapter connections..."
            className="w-full h-full bg-transparent resize-none focus:outline-none font-mono text-xs leading-relaxed text-[var(--theme-text)] placeholder:text-[var(--theme-muted)]"
            spellCheck={false}
          />
        ) : (
          <div className="reader-prose max-w-none font-sans text-xs leading-relaxed select-text text-[var(--theme-text)]">
            {content.split("\n\n").map((para, i) => {
              if (para.startsWith("# ")) {
                return (
                  <h3 key={i} className="font-semibold text-sm mt-2 mb-1 text-[var(--theme-text)]">
                    {para.slice(2)}
                  </h3>
                );
              }
              if (para.startsWith("## ")) {
                return (
                  <h4 key={i} className="font-semibold text-xs mt-3 mb-1 text-[var(--theme-text)]">
                    {para.slice(3)}
                  </h4>
                );
              }
              if (para.startsWith(">")) {
                return (
                  <blockquote
                    key={i}
                    className="border-l-2 border-[var(--theme-accent)] pl-2.5 my-2 italic text-[var(--theme-muted)] text-xs"
                  >
                    {para.replace(/^>\s?/, "")}
                  </blockquote>
                );
              }
              return (
                <p key={i} className="mb-2 text-[var(--theme-text)]">
                  {para}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* File target indicator */}
      <div className="p-2.5 border-t border-[var(--theme-border)] text-[10px] text-[var(--theme-muted)] truncate font-mono">
        vault/notes/{bookId}/{notesFileName}
      </div>
    </div>
  );
};
