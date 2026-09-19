import { DictionaryEntry, VocabularyEntry } from "../../types";

export const FALLBACK_LEXICON: Record<string, DictionaryEntry> = {
  elementary: {
    word: "elementary",
    partOfSpeech: "adjective",
    pronunciation: "/ˌɛl.əˈmɛn.tə.ɹi/",
    definition: "Pertaining to the first rudiments or fundamental mechanics of reading, focusing on basic word recognition, syntax, and surface comprehension.",
    etymology: "From Latin elementarius ('belonging to first principles or rudiments').",
  },
  inspectional: {
    word: "inspectional",
    partOfSpeech: "adjective",
    pronunciation: "/ɪnˈspɛk.ʃən.əl/",
    definition: "Relating to systematic skimming, superficial reading, and blueprint sampling to discern a book's structure and unity in limited time.",
    etymology: "From Latin inspicere ('to examine, look into').",
  },
  analytical: {
    word: "analytical",
    partOfSpeech: "adjective",
    pronunciation: "/ˌæn.əˈlɪt.ɪ.kəl/",
    definition: "Thorough, uninterrupted reading aimed at deep comprehension by coming to terms with the author, grasping propositions, and evaluating arguments.",
    etymology: "From Greek analytikos ('resolving into first principles').",
  },
  syntopical: {
    word: "syntopical",
    partOfSpeech: "adjective",
    pronunciation: "/sɪnˈtɒp.ɪ.kəl/",
    definition: "Comparative reading across multiple works on the same subject to construct an objective dialectic overview beyond any single author's perspective.",
    etymology: "Coined by Mortimer Adler from Greek syn ('together') + topos ('place/subject').",
  },
  lexicon: {
    word: "lexicon",
    partOfSpeech: "noun",
    pronunciation: "/ˈlɛk.sɪ.kən/",
    definition: "The vocabulary of a person, language, or branch of knowledge; an offline dictionary repository for word decoding and comprehension.",
    etymology: "From Greek lexikon (biblion) ('word-book').",
  },
  hermeneutics: {
    word: "hermeneutics",
    partOfSpeech: "noun",
    pronunciation: "/ˌhɜː.məˈnjuː.tɪks/",
    definition: "The theory and methodological discipline of text interpretation, especially concerning philosophical, scriptural, and literary works.",
    etymology: "From Greek hermeneutikos ('relating to interpretation, from Hermes').",
  },
  heuristic: {
    word: "heuristic",
    partOfSpeech: "adjective",
    pronunciation: "/hjuːˈrɪs.tɪk/",
    definition: "Serving to discover or learn; practical rule-of-thumb methods that aid in problem-solving and rapid mental orientation.",
    etymology: "From Greek heuriskein ('to find or discover').",
  },
  epistemology: {
    word: "epistemology",
    partOfSpeech: "noun",
    pronunciation: "/ɪˌpɪs.təˈmɒl.ə.dʒi/",
    definition: "The branch of philosophy that investigates the nature, origin, scope, and validation of human knowledge and justified belief.",
    etymology: "From Greek episteme ('knowledge') + -logia ('study of').",
  },
  proposition: {
    word: "proposition",
    partOfSpeech: "noun",
    pronunciation: "/ˌprɒp.əˈzɪʃ.ən/",
    definition: "A declarative statement or judgment asserting a truth or falsehood that forms the foundational claim in an author's argument.",
    etymology: "From Latin proponere ('to set forth, propose').",
  },
  syllogism: {
    word: "syllogism",
    partOfSpeech: "noun",
    pronunciation: "/ˈsɪl.ə.dʒɪz.əm/",
    definition: "A formal deductive argument composed of a major premise, a minor premise, and a logically necessary conclusion.",
    etymology: "From Greek syllogismos ('reckoning together, inference').",
  },
  dialectic: {
    word: "dialectic",
    partOfSpeech: "noun",
    pronunciation: "/ˌdaɪ.əˈlɛk.tɪk/",
    definition: "The art or practice of arriving at philosophical truth through structured dialogue, counter-arguments, and resolution of contradictions.",
    etymology: "From Greek dialektike (techne) ('conversational art').",
  },
  vernacular: {
    word: "vernacular",
    partOfSpeech: "noun",
    pronunciation: "/vəˈnæk.jə.lə/",
    definition: "The native language or common idiom spoken by ordinary people in a specific region or historical epoch.",
    etymology: "From Latin vernaculus ('native, indigenous, domestic').",
  },
  paradigm: {
    word: "paradigm",
    partOfSpeech: "noun",
    pronunciation: "/ˈpær.ə.daɪm/",
    definition: "A distinct set of concepts, thought patterns, or exemplary standards that define a legitimate contribution to a field.",
    etymology: "From Greek paradeigma ('pattern, example').",
  },
  fixation: {
    word: "fixation",
    partOfSpeech: "noun",
    pronunciation: "/fɪkˈseɪ.ʃən/",
    definition: "In physical reading mechanics, the brief stationary pause of the eyes on a specific word or group of characters to extract meaning.",
    etymology: "From Latin figere ('to fasten, fix').",
  },
  regression: {
    word: "regression",
    partOfSpeech: "noun",
    pronunciation: "/rɪˈɡrɛʃ.ən/",
    definition: "In reading mechanics, the involuntary backward movement of the eyes to re-read words or phrases already scanned, slowing reading speed.",
    etymology: "From Latin regredi ('to retreat, go back').",
  },
  vocalization: {
    word: "vocalization",
    partOfSpeech: "noun",
    pronunciation: "/ˌvoʊ.kə.laɪˈzeɪ.ʃən/",
    definition: "The habit of silently pronouncing words with the vocal cords or inner speech while reading, creating a bottleneck around 250 WPM.",
    etymology: "From Latin vocalis ('pertaining to voice').",
  },
  linearizability: {
    word: "linearizability",
    partOfSpeech: "noun",
    pronunciation: "/ˌlɪn.i.ə.raɪ.zəˈbɪl.ə.ti/",
    definition: "A consistency model in concurrent computing where operations appear to execute atomically in a sequential global real-time order.",
    etymology: "From Latin linearis ('consisting of lines').",
  },
  consensus: {
    word: "consensus",
    partOfSpeech: "noun",
    pronunciation: "/kənˈsɛn.səs/",
    definition: "General agreement; in distributed systems, the protocol mechanism ensuring distributed nodes agree on identical state values.",
    etymology: "From Latin consensus ('agreement, sympathy').",
  },
  elasticity: {
    word: "elasticity",
    partOfSpeech: "noun",
    pronunciation: "/ˌiː.læsˈtɪs.ə.ti/",
    definition: "A measure of how responsive economic variables are to changes in price, income, or other market parameters.",
    etymology: "From Greek elastikos ('impulsive, flexible').",
  },
  utility: {
    word: "utility",
    partOfSpeech: "noun",
    pronunciation: "/juːˈtɪl.ə.ti/",
    definition: "The total satisfaction, usefulness, or value a consumer derives from the consumption of a good, service, or state of affairs.",
    etymology: "From Latin utilitas ('usefulness, profit').",
  },
};

/** Looks up a word that `sanitizeLexiconWord` (`../lexiconApi.ts`) already cleaned. */
export function fallbackLookupDictionaryTerm(word: string): DictionaryEntry | null {
  return FALLBACK_LEXICON[word] || null;
}

export function fallbackSaveVocabulary(bookId: string, entry: VocabularyEntry): void {
  const key = `vocabulary_${bookId}`;
  const raw = localStorage.getItem(key);
  let list: VocabularyEntry[] = [];
  if (raw) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }

  const targetWord = entry.word.trim().toLowerCase();
  let updated = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].word.trim().toLowerCase() === targetWord) {
      list[i] = { ...list[i], ...entry };
      updated = true;
      break;
    }
  }

  if (!updated) {
    list.push(entry);
  }

  localStorage.setItem(key, JSON.stringify(list));
}

/**
 * The words this browser has saved for a book. `vocabularyFrom` (`../../backendShapes.ts`) checks the answer, so
 * a half-written entry left in browser storage is dropped here too, not only when the real backend answers.
 */
export function fallbackGetVocabulary(bookId: string): unknown {
  const raw = localStorage.getItem(`vocabulary_${bookId}`);
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
