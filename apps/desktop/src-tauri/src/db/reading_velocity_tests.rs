//! AN-01: the reading analytics show how long you read each chapter and whether you finished it.
//!
//! The app sees how long a chapter is on screen and how far down it you scrolled. It cannot see how many words you
//! read, so it keeps no word count and shows no reading speed. It used to save the word count of the whole chapter
//! with every piece of reading time, so a chapter that was open for 20 seconds showed 21,357 words a minute.

use super::reading_velocity::{get_reading_velocity_blocking, record_reading_session_blocking};
use super::restore::restore_progress_blocking;
use crate::test_support::Sandbox;

/// Reading time as the app wrote it to the vault before AN-01, with the numbers of a real log: every line holds the
/// word count of the whole chapter, whatever was read.
const LINES_FROM_BEFORE: &str = concat!(
    r#"{"bookId":"sample","chapterFile":"ch-01.md","secondsSpent":750,"wordsRead":2467,"completed":false,"readAt":1789404788}"#,
    "\n",
    r#"{"bookId":"sample","chapterFile":"ch-02.md","secondsSpent":20,"wordsRead":7119,"completed":true,"readAt":1789397781}"#,
    "\n",
    r#"{"bookId":"sample","chapterFile":"ch-01.md","secondsSpent":15,"wordsRead":2453,"completed":false,"readAt":1789573900}"#,
    "\n",
);

#[test]
fn reading_analytics_show_the_time_and_the_finished_chapters_but_no_word_count_or_speed() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();
    sandbox.write("notes/sample/reading.jsonl", LINES_FROM_BEFORE);
    restore_progress_blocking().expect("start the app");

    for book in [Some("sample"), None] {
        let stats = serde_json::to_value(get_reading_velocity_blocking(book).expect("read the analytics"))
            .expect("the analytics as the window gets them");
        let chapters = stats["chapter_stats"].as_array().expect("one row for each chapter");

        let mut made_up = Vec::new();
        for key in ["total_words_read", "average_wpm"] {
            if let Some(value) = stats.get(key) {
                made_up.push(format!("{key} {value}"));
            }
        }
        for chapter in chapters {
            for key in ["words_read", "wpm"] {
                if let Some(value) = chapter.get(key) {
                    made_up.push(format!("{} {key} {value}", chapter["chapter_file"]));
                }
            }
        }
        assert!(
            made_up.is_empty(),
            "{book:?}: the app cannot see how many words you read: {made_up:?}"
        );

        assert_eq!(stats["total_seconds"], 785, "{book:?}: every second of reading counts");
        assert_eq!(stats["completed_chapters"], 1, "{book:?}");
        let rows: Vec<(&str, i64, bool)> = chapters
            .iter()
            .map(|chapter| {
                (
                    chapter["chapter_file"].as_str().expect("a chapter file"),
                    chapter["seconds_spent"].as_i64().expect("seconds"),
                    chapter["completed"].as_bool().expect("finished or not"),
                )
            })
            .collect();
        assert_eq!(rows, [("ch-01.md", 765, false), ("ch-02.md", 20, true)], "{book:?}");
    }
}

#[test]
fn reading_time_is_saved_with_no_word_count_and_a_finished_chapter_stays_finished() {
    let sandbox = Sandbox::new();
    sandbox.write_sample_book();

    record_reading_session_blocking("sample", "ch-01.md", 15, false).expect("read a while");
    record_reading_session_blocking("sample", "ch-01.md", 15, true).expect("reach the end");
    record_reading_session_blocking("sample", "ch-01.md", 4, false).expect("read on after the end");

    let log = std::fs::read_to_string(sandbox.vault().join("notes/sample/reading.jsonl")).expect("read the study log");
    assert_eq!(log.lines().count(), 3, "one line for each piece of reading time");
    assert!(!log.contains("wordsRead"), "the vault holds no word count: {log}");

    let stats = get_reading_velocity_blocking(Some("sample")).expect("read the analytics");
    assert_eq!(stats.total_seconds, 34);
    assert_eq!(stats.completed_chapters, 1, "a finished chapter stays finished");
    assert!(stats.chapter_stats[0].completed);
}
