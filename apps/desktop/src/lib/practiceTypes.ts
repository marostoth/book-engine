import { AnchoredCitation } from "./types";

export interface ScenarioOption {
  key: string;
  text: string;
  is_correct: boolean;
}

export interface ScenarioPayload {
  scenario: string;
  options: ScenarioOption[];
  citation: AnchoredCitation;
  rationale: string;
}

export interface PracticeCardItem {
  card_id: string;
  book_id: string;
  chapter_file: string;
  anchor: string;
  item_type: "cloze" | "scramble" | "scenario";
  prompt: string;
  answer: string;
  state: number;
  stability: number;
  difficulty: number;
  due: number;
  last_review: number;
  reps: number;
  card_type?: "cloze" | "scenario";
  cardType?: "cloze" | "scenario";
  scenario_payload?: ScenarioPayload;
  scenarioPayload?: ScenarioPayload;
}
