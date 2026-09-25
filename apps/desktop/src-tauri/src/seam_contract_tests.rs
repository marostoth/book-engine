//! Every shape that crosses between Rust and TypeScript is pinned by one file (TL-14).
//!
//! The TypeScript types are written by hand, so nothing made them match the Rust structs. A field renamed on one
//! side only, or a `rename_all` added to one struct, built and passed every test, and the reader lost what that
//! field held: a highlight whose `createdAt` came as `created_at` was thrown away.
//!
//! `src/lib/seamContract.json` holds one example of each shape, with every field filled in. This test reads each
//! example into its Rust type and writes it out again, and the two must be the same JSON: a field the Rust type
//! does not know is lost on the way, and a field it names another way comes out under the other name. The
//! TypeScript half is `src/lib/seamContract.test.ts`, which does not compile when a type and its example do not
//! name the same fields.

use crate::commands::VaultStatus;
use crate::db::{
    ChapterReadingStatItem, DictionaryEntry, IndexProblem, IndexSummary, PracticeCardItem, ReadingVelocityStats,
    RenamedBook, RetentionMetrics, ReviewBlock, ScenarioOption, ScenarioPayload, SearchResult, StateCounts,
    StudyAnalytics,
};
use crate::fsrs::CardSchedule;
use crate::vault::bookmark::{BookBookmark, Bookmark};
use crate::vault::{
    AggregatedNoteItem, AnalyticalStore, AnchoredCitation, ArgumentNode, AuthorInquiry, AuthorTerm, BookMetadata,
    BookSummary, ChapterMeta, ChapterNoteFile, CritiqueItem, CrossBookCitation, ElementaryMetrics,
    ExitAssessmentPayload, HighlightItem, InquiryDomain, InquiryPriority, InspectionalBlueprint, InspectionalSampling,
    NeutralTerm, ResolutionStatus, SyntopicControversy, SyntopicPerspective, SyntopicQuestion, SyntopicTopic,
    SyntopicTopicSummary, TermMapping, VocabularyEntry,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeSet;

const CONTRACT: &str = include_str!("../../src/lib/seamContract.json");

/// Reads `example` into `T` and writes it out again. Says what is wrong when the two are not the same JSON.
fn same_both_ways<T: DeserializeOwned + Serialize>(name: &str, example: &Value) -> Result<(), String> {
    let read: T = serde_json::from_value(example.clone())
        .map_err(|e| format!("{name}: Rust cannot read the example of the contract: {e}"))?;
    let written = serde_json::to_value(&read).map_err(|e| format!("{name}: Rust cannot write it: {e}"))?;
    if &written != example {
        return Err(format!(
            "{name}:\n  Rust writes    {written}\n  the contract   {example}"
        ));
    }
    Ok(())
}

/// The same for an enum: the example is the list of every value it can take.
fn every_value_both_ways<T: DeserializeOwned + Serialize>(name: &str, example: &Value) -> Result<(), String> {
    let values = example
        .as_array()
        .ok_or(format!("{name}: the example of an enum is a list of its values"))?;
    values.iter().try_for_each(|value| same_both_ways::<T>(name, value))
}

type Check = fn(&str, &Value) -> Result<(), String>;

/// Each shape of the contract, with the Rust type that must write it.
fn pinned() -> Vec<(&'static str, Check)> {
    macro_rules! shapes {
        ($($shape:ident),* $(,)?) => { vec![$((stringify!($shape), same_both_ways::<$shape> as Check)),*] };
    }
    macro_rules! enums {
        ($($shape:ident),* $(,)?) => { vec![$((stringify!($shape), every_value_both_ways::<$shape> as Check)),*] };
    }
    let mut all = shapes![
        AggregatedNoteItem,
        AnalyticalStore,
        AnchoredCitation,
        ArgumentNode,
        AuthorInquiry,
        AuthorTerm,
        BookMetadata,
        BookBookmark,
        BookSummary,
        Bookmark,
        CardSchedule,
        ChapterMeta,
        ChapterNoteFile,
        ChapterReadingStatItem,
        CritiqueItem,
        CrossBookCitation,
        DictionaryEntry,
        ElementaryMetrics,
        ExitAssessmentPayload,
        HighlightItem,
        IndexProblem,
        IndexSummary,
        InspectionalBlueprint,
        InspectionalSampling,
        NeutralTerm,
        PracticeCardItem,
        ReadingVelocityStats,
        RenamedBook,
        RetentionMetrics,
        ReviewBlock,
        ScenarioOption,
        ScenarioPayload,
        SearchResult,
        StateCounts,
        StudyAnalytics,
        SyntopicControversy,
        SyntopicPerspective,
        SyntopicQuestion,
        SyntopicTopic,
        SyntopicTopicSummary,
        TermMapping,
        VaultStatus,
        VocabularyEntry,
    ];
    all.extend(enums![InquiryDomain, InquiryPriority, ResolutionStatus]);
    all
}

fn contract() -> Map<String, Value> {
    serde_json::from_str(CONTRACT).expect("src/lib/seamContract.json must be a JSON object")
}

#[test]
fn every_shape_comes_out_of_rust_as_the_contract_writes_it() {
    let contract = contract();
    let wrong: Vec<String> = pinned()
        .into_iter()
        .filter_map(|(name, check)| match contract.get(name) {
            Some(example) => check(name, example).err(),
            None => Some(format!("{name}: the contract has no example")),
        })
        .collect();
    assert!(
        wrong.is_empty(),
        "{} shapes differ from src/lib/seamContract.json. Change the Rust type, its TypeScript type and the \
         contract together:\n{}",
        wrong.len(),
        wrong.join("\n")
    );
}

#[test]
fn the_contract_holds_the_pinned_shapes_and_no_other() {
    let in_contract: BTreeSet<String> = contract().keys().cloned().collect();
    let in_rust: BTreeSet<String> = pinned().into_iter().map(|(name, _)| name.to_string()).collect();
    assert_eq!(
        in_contract, in_rust,
        "a shape of the contract must have its Rust type in `pinned`, and back"
    );
    assert_eq!(in_rust.len(), 46, "43 structs and 3 enums cross the seam");
}

#[test]
fn a_field_under_another_name_is_caught() {
    // The control: the check itself must see a field that one side names another way
    let mut example = contract()["HighlightItem"].clone();
    let at = example.as_object_mut().unwrap().remove("createdAt").unwrap();
    example.as_object_mut().unwrap().insert("created_at".into(), at);
    let said = same_both_ways::<HighlightItem>("HighlightItem", &example).unwrap_err();
    assert!(said.contains("createdAt"), "{said}");
}

#[test]
fn a_field_the_rust_type_does_not_know_is_caught() {
    let mut example = contract()["AggregatedNoteItem"].clone();
    example
        .as_object_mut()
        .unwrap()
        .insert("chapterTitle".into(), Value::from("renamed"));
    assert!(same_both_ways::<AggregatedNoteItem>("AggregatedNoteItem", &example).is_err());
}
