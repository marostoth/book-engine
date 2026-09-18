use anyhow::Result;
use rusqlite::Connection;

/// Tuple representing (word, part_of_speech, pronunciation, definition, etymology)
pub const SEED_LEXICON: &[(&str, &str, &str, &str, &str)] = &[
    (
        "elementary",
        "adjective",
        "/ˌɛl.əˈmɛn.tə.ɹi/",
        "Pertaining to the first rudiments or fundamental mechanics of reading, focusing on basic word recognition, syntax, and surface comprehension.",
        "From Latin elementarius ('belonging to first principles or rudiments')."
    ),
    (
        "inspectional",
        "adjective",
        "/ɪnˈspɛk.ʃən.əl/",
        "Relating to systematic skimming, superficial reading, and blueprint sampling to discern a book's structure and unity in limited time.",
        "From Latin inspicere ('to examine, look into')."
    ),
    (
        "analytical",
        "adjective",
        "/ˌæn.əˈlɪt.ɪ.kəl/",
        "Thorough, uninterrupted reading aimed at deep comprehension by coming to terms with the author, grasping propositions, and evaluating arguments.",
        "From Greek analytikos ('resolving into first principles')."
    ),
    (
        "syntopical",
        "adjective",
        "/sɪnˈtɒp.ɪ.kəl/",
        "Comparative reading across multiple works on the same subject to construct an objective dialectic overview beyond any single author's perspective.",
        "Coined by Mortimer Adler from Greek syn ('together') + topos ('place/subject')."
    ),
    (
        "lexicon",
        "noun",
        "/ˈlɛk.sɪ.kən/",
        "The vocabulary of a person, language, or branch of knowledge; an offline dictionary repository for word decoding and comprehension.",
        "From Greek lexikon (biblion) ('word-book')."
    ),
    (
        "hermeneutics",
        "noun",
        "/ˌhɜː.məˈnjuː.tɪks/",
        "The theory and methodological discipline of text interpretation, especially concerning philosophical, scriptural, and literary works.",
        "From Greek hermeneutikos ('relating to interpretation, from Hermes')."
    ),
    (
        "heuristic",
        "adjective",
        "/hjuːˈrɪs.tɪk/",
        "Serving to discover or learn; practical rule-of-thumb methods that aid in problem-solving and rapid mental orientation.",
        "From Greek heuriskein ('to find or discover')."
    ),
    (
        "epistemology",
        "noun",
        "/ɪˌpɪs.təˈmɒl.ə.dʒi/",
        "The branch of philosophy that investigates the nature, origin, scope, and validation of human knowledge and justified belief.",
        "From Greek episteme ('knowledge') + -logia ('study of')."
    ),
    (
        "proposition",
        "noun",
        "/ˌprɒp.əˈzɪʃ.ən/",
        "A declarative statement or judgment asserting a truth or falsehood that forms the foundational claim in an author's argument.",
        "From Latin proponere ('to set forth, propose')."
    ),
    (
        "syllogism",
        "noun",
        "/ˈsɪl.ə.dʒɪz.əm/",
        "A formal deductive argument composed of a major premise, a minor premise, and a logically necessary conclusion.",
        "From Greek syllogismos ('reckoning together, inference')."
    ),
    (
        "dialectic",
        "noun",
        "/ˌdaɪ.əˈlɛk.tɪk/",
        "The art or practice of arriving at philosophical truth through structured dialogue, counter-arguments, and resolution of contradictions.",
        "From Greek dialektike (techne) ('conversational art')."
    ),
    (
        "vernacular",
        "noun",
        "/vəˈnæk.jə.lə/",
        "The native language or common idiom spoken by ordinary people in a specific region or historical epoch.",
        "From Latin vernaculus ('native, indigenous, domestic')."
    ),
    (
        "paradigm",
        "noun",
        "/ˈpær.ə.daɪm/",
        "A distinct set of concepts, thought patterns, or exemplary standards that define a legitimate contribution to a field.",
        "From Greek paradeigma ('pattern, example')."
    ),
    (
        "discourse",
        "noun",
        "/ˈdɪs.kɔːs/",
        "Written or spoken communication, debate, or formal exposition that develops ideas systematically across a coherent subject.",
        "From Latin discursus ('running to and fro')."
    ),
    (
        "monograph",
        "noun",
        "/ˈmɒn.ə.ɡrɑːf/",
        "A detailed, comprehensive written study or treatise on a single specialized topic or individual work of scholarship.",
        "From Greek monos ('single') + graphein ('to write')."
    ),
    (
        "propaedeutic",
        "adjective",
        "/ˌproʊ.piːˈdjuː.tɪk/",
        "Serving as preliminary instruction or introductory preparation for an art, science, or advanced systematic discipline.",
        "From Greek propaideuein ('to teach beforehand')."
    ),
    (
        "fixation",
        "noun",
        "/fɪkˈseɪ.ʃən/",
        "In physical reading mechanics, the brief stationary pause of the eyes on a specific word or group of characters to extract meaning.",
        "From Latin figere ('to fasten, fix')."
    ),
    (
        "regression",
        "noun",
        "/rɪˈɡrɛʃ.ən/",
        "In reading mechanics, the involuntary backward movement of the eyes to re-read words or phrases already scanned, slowing reading speed.",
        "From Latin regredi ('to retreat, go back')."
    ),
    (
        "vocalization",
        "noun",
        "/ˌvoʊ.kə.laɪˈzeɪ.ʃən/",
        "The habit of silently pronouncing words with the vocal cords or inner speech while reading, creating a bottleneck around 250 WPM.",
        "From Latin vocalis ('pertaining to voice')."
    ),
    (
        "linearizability",
        "noun",
        "/ˌlɪn.i.ə.raɪ.zəˈbɪl.ə.ti/",
        "A consistency model in concurrent computing where operations appear to execute atomically in a sequential global real-time order.",
        "From Latin linearis ('consisting of lines')."
    ),
    (
        "consensus",
        "noun",
        "/kənˈsɛn.səs/",
        "General agreement; in distributed systems, the protocol mechanism ensuring distributed nodes agree on identical state values.",
        "From Latin consensus ('agreement, sympathy')."
    ),
    (
        "quorum",
        "noun",
        "/ˈkwɔː.rəm/",
        "The minimum subset of nodes or participants required to be present and responsive for a distributed transaction to commit.",
        "From Latin quorum ('of whom')."
    ),
    (
        "partition",
        "noun",
        "/pɑːˈtɪʃ.ən/",
        "A network severance condition where distributed nodes become isolated into subsets that cannot communicate with one another.",
        "From Latin partitio ('division, sharing')."
    ),
    (
        "idempotent",
        "adjective",
        "/ˌaɪ.dəmˈpoʊ.tənt/",
        "Denoting an operation that produces identical side effects whether invoked once or repeated across multiple identical requests.",
        "From Latin idem ('same') + potens ('having power')."
    ),
    (
        "elasticity",
        "noun",
        "/ˌiː.læsˈtɪs.ə.ti/",
        "A measure of how responsive economic variables (such as quantity demanded or supplied) are to changes in price or income.",
        "From Greek elastikos ('impulsive, flexible')."
    ),
    (
        "utility",
        "noun",
        "/juːˈtɪl.ə.ti/",
        "The total satisfaction, usefulness, or value a consumer derives from the consumption of a good, service, or state of affairs.",
        "From Latin utilitas ('usefulness, profit')."
    ),
    (
        "mercantilism",
        "noun",
        "/ˈmɜː.kən.taɪ.lɪz.əm/",
        "An economic doctrine dominant in early modern Europe positing that national wealth is maximized through bullion accumulation and export surpluses.",
        "From French mercantile ('commercial, merchant-like')."
    ),
    (
        "division",
        "noun",
        "/dɪˈvɪʒ.ən/",
        "The organizational separation of complex production into discrete, specialized tasks carried out by distinct workers to enhance productivity.",
        "From Latin divisio ('distribution, separation')."
    ),
    (
        "capital",
        "noun",
        "/ˈkæp.ɪ.təl/",
        "Durable accumulated assets and financial resources employed in production to yield future revenue rather than immediate consumption.",
        "From Latin capitalis ('of the head, chief')."
    ),
    (
        "inference",
        "noun",
        "/ˈɪn.fər.əns/",
        "A rational derivation of new propositions or conclusions based on established premises and evidence.",
        "From Latin inferre ('to bring in, deduce')."
    ),
    (
        "exposition",
        "noun",
        "/ˌɛk.spəˈzɪʃ.ən/",
        "A systematic, explanatory statement of facts, principles, or an author's overarching thesis.",
        "From Latin exponere ('to put forth, explain')."
    ),
    (
        "treatise",
        "noun",
        "/ˈtriː.tɪs/",
        "A formal, thorough, and methodical written discourse examining the foundational principles of a subject.",
        "From Anglo-Norman tretiz ('treatment, discussion')."
    ),
    (
        "rhetoric",
        "noun",
        "/ˈrɛt.ə.rɪk/",
        "The art of effective and persuasive discourse in speech and writing, employing reasoned structure and stylistic tropes.",
        "From Greek rhetorike ('art of the orator')."
    ),
    (
        "syntax",
        "noun",
        "/ˈsɪn.tæks/",
        "The structural rules governing how words and morphemes combine to construct grammatical phrases, clauses, and sentences.",
        "From Greek syntaxis ('coordination, arrangement')."
    ),
    (
        "semantics",
        "noun",
        "/sɪˈmæn.tɪks/",
        "The branch of linguistics and philosophical logic concerned with linguistic meaning, reference, and truth conditions.",
        "From Greek semantikos ('significant, pertaining to signs')."
    ),
    (
        "abstraction",
        "noun",
        "/æbˈstræk.ʃən/",
        "The cognitive process of isolating universal properties or general patterns from concrete, empirical instances.",
        "From Latin abstrahere ('to draw away')."
    ),
];

/// Checks if `dictionary_entries` is empty; if so, batch seeds the curated entries.
pub fn seed_dictionary_if_empty(conn: &Connection) -> Result<usize> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM dictionary_entries", [], |row| row.get(0))?;

    if count > 0 {
        return Ok(0);
    }

    let mut stmt = conn.prepare(
        "INSERT OR IGNORE INTO dictionary_entries (word, part_of_speech, pronunciation, definition, etymology)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;

    let mut inserted = 0;
    for (word, pos, pron, def, etym) in SEED_LEXICON {
        stmt.execute([*word, *pos, *pron, *def, *etym])?;
        inserted += 1;
    }

    Ok(inserted)
}
