import { ReadingLevelMode } from "./types";

export interface KeybindingItem {
  key: string;
  desc: string;
}

export interface GutterBadgeItem {
  badge: string;
  label: string;
  desc: string;
  colorClass: string;
}

export interface LevelGuideSection {
  level: ReadingLevelMode;
  levelNum: string;
  title: string;
  subtitle: string;
  goal: string;
  affordances: string[];
  gutterBadges?: GutterBadgeItem[];
  keybindings: KeybindingItem[];
}

export interface UniversalShortcut {
  keys: string[];
  desc: string;
}

export const UNIVERSAL_SHORTCUTS: UniversalShortcut[] = [
  { keys: ["1", "2", "3", "4"], desc: "Switch reading level (I to IV)" },
  { keys: ["Ctrl", "K"], desc: "Global OmniSearch (FTS5 search across library)" },
  { keys: ["Ctrl", "P"], desc: "Extractive practice suite (Cloze & Scenarios)" },
  { keys: ["Ctrl", "B"], desc: "Toggle notes slide-over drawer & highlights" },
  { keys: ["?", "F1"], desc: "Open Adlerian Field Guide & Cheatsheet" },
  { keys: ["Esc"], desc: "Close active modal, popover, or cancel pacer" },
];

export const LEVEL_GUIDE_SECTIONS: Record<ReadingLevelMode, LevelGuideSection> = {
  elementary: {
    level: "elementary",
    levelNum: "Level I",
    title: "Elementary Reading",
    subtitle: "Rudimentary Reading & Lexical Mechanics",
    goal: "Eliminate vocalization friction, sustain optimal typographical measure, and master vocabulary with instant offline lexicon resolution.",
    affordances: [
      "Typographical Measure (55–75 CPL dynamic line measure)",
      "Visual Pacer Beam (fluid underline/laser sweep guidance)",
      "Paragraph Focus Ruler (ambiently dims inactive paragraphs)",
      "Instant Offline Lexicon (dictionary lookup on double-click)",
    ],
    keybindings: [
      { key: "Space", desc: "Toggle reading pacer beam on/off" },
      { key: "[ / ]", desc: "Decrease / Increase pacer velocity by 25 WPM" },
      { key: "Double Click", desc: "Instant offline lexicon definition popover" },
      { key: "Esc", desc: "Stop active pacer sweep / dismiss popover" },
    ],
  },
  inspectional: {
    level: "inspectional",
    levelNum: "Level II",
    title: "Inspectional Reading",
    subtitle: "Systematic Skimming & Structural Blueprint",
    goal: "Evaluate the architecture of the book, examine chapter head/tail dip samples, and formulate overarching inquiries within a bounded timebox.",
    affordances: [
      "Structural Book Blueprint (metadata, analytical TOC, cluster map)",
      "Dip Sampling Stream (first & last paragraphs with anchor jump)",
      "Ambient Skim Timer (circular countdown widget in TopNav)",
      "Adlerian 4-Question Exit Assessment (synthesize key learnings)",
    ],
    keybindings: [
      { key: "Shift + 2", desc: "Start 15-minute ambient inspectional skim timer" },
      { key: "J / K", desc: "Navigate through chapter head/tail dip cards" },
      { key: "Enter", desc: "Jump directly to target sampled anchor in reader" },
      { key: "Esc", desc: "Pause skim countdown or close blueprint view" },
    ],
  },
  analytical: {
    level: "analytical",
    levelNum: "Level III",
    title: "Analytical Reading",
    subtitle: "Adlerian Stages I–III: Interpretation & Critique",
    goal: "Coming to terms with the author (Rule 5), assemble propositions into premise-to-conclusion argument graphs (Rules 6–7), and critically evaluate truth (Rules 9–12).",
    affordances: [
      "Interpretive Workbench (Author Terms, Arguments, Inquiries, Critiques)",
      "Extractive Practice Drills (verbatim cloze & deductive scenario drills)",
      "Interactive Selection Toolbar (Highlight, Note, Term, Argument, Inquiry)",
      "Margin Anchor Indicators (right-gutter glyphs for cited paragraphs)",
    ],
    gutterBadges: [
      { badge: "T", label: "Specialized Term", desc: "Rule 5 specialized keyword & author definition", colorClass: "text-amber-400 bg-amber-950/60 border-amber-800/60" },
      { badge: "P", label: "Argument Premise", desc: "Rules 6–7 proposition serving as foundation", colorClass: "text-blue-400 bg-blue-950/60 border-blue-800/60" },
      { badge: "C", label: "Argument Conclusion", desc: "Rules 6–7 ultimate deductive claim", colorClass: "text-purple-400 bg-purple-950/60 border-purple-800/60" },
      { badge: "?", label: "Author Inquiry", desc: "Rules 4 & 8 problem grounding citation", colorClass: "text-emerald-400 bg-emerald-950/60 border-emerald-800/60" },
    ],
    keybindings: [
      { key: "Text Select", desc: "Summon floating highlight & analytical staging menu" },
      { key: "Ctrl + P", desc: "Launch FSRS practice deck & scenario drills" },
      { key: "1 / 2 / 3 / 4", desc: "FSRS review rating (Again, Hard, Good, Easy)" },
      { key: "Esc", desc: "Dismiss active analytical modal or selection menu" },
    ],
  },
  syntopical: {
    level: "syntopical",
    levelNum: "Level IV",
    title: "Syntopical Reading",
    subtitle: "The Syntopicon: Multi-Author Comparative Inquiry",
    goal: "Investigate an overarching subject across multiple books simultaneously by forging neutral terminology, framing universal questions, and distilling dialectical truth.",
    affordances: [
      "Rule 2 Neutral Terms Bridge (mapping author-specific variants)",
      "Rules 3 & 4 Framed Questions & Multi-Author Controversy Matrix",
      "Dynamic Cross-Book Navigation (switches book & centers anchor)",
      "Rule 5 Dialectical Dossier Compiler (publication-grade Markdown)",
    ],
    keybindings: [
      { key: "§S Pill", desc: "Stage selection into active syntopicon topic" },
      { key: "Click Citation", desc: "Jump across books directly to source chapter anchor" },
      { key: "Export Button", desc: "Compile publication-grade Markdown dossier" },
      { key: "Esc", desc: "Dismiss term/controversy modal or clear staged text" },
    ],
  },
};
