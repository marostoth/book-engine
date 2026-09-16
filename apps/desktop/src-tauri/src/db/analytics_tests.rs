//! AN-02: the heatmap counts each review on the day you made it, in the time zone of the window.
//!
//! The cache counted the reviews of each UTC day. In UTC+1 (British Summer Time) a review made between midnight and
//! 1 a.m. is on the UTC day before, so the heatmap put it on the wrong day. The cache cannot know the time zone of the
//! window. So it counts the reviews in each 15-minute block of time, and the window puts every block on a day of its
//! own time zone (`src/lib/reviewDays.ts`). Every time zone is a whole number of 15-minute blocks from UTC, so a
//! midnight never falls inside a block.

use serde_json::{json, Value};

use super::analytics::{get_review_heatmap_blocking, get_study_analytics_blocking};
use super::deck_sync::sync_practice_deck_blocking;
use super::restore::restore_progress_blocking;
use crate::test_support::Sandbox;

/// 15 September 2026 at 23:40:05 UTC: 00:40 on 16 September in UTC+1.
const AFTER_MIDNIGHT: i64 = 1_789_515_605;
/// 15 September 2026 at 23:52:10 UTC: 00:52 on 16 September in UTC+1.
const LATER_AFTER_MIDNIGHT: i64 = 1_789_516_330;
/// 16 September 2026 at 10:05 UTC: 11:05 on 16 September in UTC+1.
const IN_THE_MORNING: i64 = 1_789_553_100;

/// The starts of the 15-minute blocks of these times: 23:30 and 23:45 UTC on 15 September, 10:00 UTC on 16 September.
const AFTER_MIDNIGHT_BLOCK: i64 = 1_789_515_000;
const LATER_AFTER_MIDNIGHT_BLOCK: i64 = 1_789_515_900;
const IN_THE_MORNING_BLOCK: i64 = 1_789_552_800;

/// Every day the cache put reviews on itself, as "<day>: <count>".
fn days_picked_by_the_cache(output: &Value) -> Vec<String> {
    match output {
        Value::Array(items) => items.iter().flat_map(days_picked_by_the_cache).collect(),
        Value::Object(fields) => match fields.get("date") {
            Some(day) => vec![format!("{}: {}", day.as_str().unwrap_or_default(), fields["count"])],
            None => fields.values().flat_map(days_picked_by_the_cache).collect(),
        },
        _ => Vec::new(),
    }
}

/// The analytics window and the heatmap command, as JSON, as the window gets them.
fn what_the_window_gets(book: Option<&str>) -> (Value, Value) {
    let analytics = get_study_analytics_blocking(book).expect("read the study analytics");
    let heatmap = get_review_heatmap_blocking(book).expect("read the review heatmap");
    (
        serde_json::to_value(analytics).expect("the analytics as JSON"),
        serde_json::to_value(heatmap).expect("the heatmap as JSON"),
    )
}

#[test]
fn the_cache_counts_the_reviews_of_each_15_minute_block_and_leaves_the_day_to_the_window() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    let review = |card: &str, reviewed_at: i64| {
        format!(r#"{{"cardId":"{card}","bookId":"sample","rating":3,"reviewedAt":{reviewed_at}}}"#)
    };
    sandbox.write(
        "notes/sample/reviews.jsonl",
        &format!(
            "{}\n{}\n{}\n",
            review("card-one", AFTER_MIDNIGHT),
            review("card-two", LATER_AFTER_MIDNIGHT),
            review("card-one", IN_THE_MORNING),
        ),
    );
    restore_progress_blocking().expect("start the app");

    let blocks = json!([
        { "started_at": AFTER_MIDNIGHT_BLOCK, "count": 1 },
        { "started_at": LATER_AFTER_MIDNIGHT_BLOCK, "count": 1 },
        { "started_at": IN_THE_MORNING_BLOCK, "count": 1 },
    ]);
    for book in [Some("sample"), None] {
        let (analytics, heatmap) = what_the_window_gets(book);
        for (name, output) in [("analytics", &analytics), ("heatmap", &heatmap)] {
            let days = days_picked_by_the_cache(output);
            assert!(
                days.is_empty(),
                "{book:?} {name}: the cache counted the reviews of UTC days, but in UTC+1 all 3 were on 16 September: {days:?}"
            );
        }
        assert_eq!(analytics["review_blocks"], blocks, "{book:?}: each review counts in its own 15-minute block");
        assert_eq!(heatmap, blocks, "{book:?}");
    }
}

#[test]
fn a_cache_with_no_review_history_counts_the_last_review_of_each_card_in_its_15_minute_block() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sync_practice_deck_blocking("sample").expect("open the book");
    // Lines that only say where a card stands: they set the last review of the card, but they are not reviews. So
    // the cache has no review history, and the heatmap counts the last review of each card.
    let standing = |card: String, reviewed_at: i64| {
        format!(
            r#"{{"cardId":"{card}","bookId":"sample","reviewedAt":{reviewed_at},"schedule":{{"state":2,"stability":3.0,"difficulty":5.0,"due":{},"reps":1}}}}"#,
            reviewed_at + 86_400
        )
    };
    sandbox.write(
        "notes/sample/reviews.jsonl",
        &format!(
            "{}\n{}\n",
            standing(sandbox.cloze_card_id(1), AFTER_MIDNIGHT),
            standing(sandbox.scenario_card_id(1), IN_THE_MORNING),
        ),
    );
    restore_progress_blocking().expect("start the app");

    let blocks = json!([
        { "started_at": AFTER_MIDNIGHT_BLOCK, "count": 1 },
        { "started_at": IN_THE_MORNING_BLOCK, "count": 1 },
    ]);
    for book in [Some("sample"), None] {
        let (analytics, heatmap) = what_the_window_gets(book);
        for (name, output) in [("analytics", &analytics), ("heatmap", &heatmap)] {
            let days = days_picked_by_the_cache(output);
            assert!(
                days.is_empty(),
                "{book:?} {name}: the cache counted the reviews of UTC days, but in UTC+1 both were on 16 September: {days:?}"
            );
        }
        assert_eq!(analytics["review_blocks"], blocks, "{book:?}");
        assert_eq!(heatmap, blocks, "{book:?}");
    }
}
