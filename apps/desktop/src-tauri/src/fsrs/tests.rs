//! FSRS-5 reference tests for `crate::fsrs`.
//!
//! Reference numbers come from the official py-fsrs 5.1.3 with the same 19 weights:
//! Scheduler(learning_steps=(10 min,), relearning_steps=(10 min,), enable_fuzzing=False).
//! Due times follow this app: Again after 10 minutes, Hard/Good/Easy after whole days
//! (py-fsrs keeps a Hard learning card for a 15-minute step instead).

use super::*;

const DAY: i64 = 86_400;
const T0: i64 = 1_767_225_600; // 2026-01-01 00:00 UTC

fn assert_close(actual: f64, expected: f64, what: &str) {
    assert!((actual - expected).abs() < 5e-6, "{what}: got {actual}, expected {expected}");
}

/// Rates a new card (`None`) or the card from an earlier review at time `now`.
fn review(card: Option<&CardSchedule>, rating: Rating, now: i64) -> CardSchedule {
    match card {
        None => schedule_card("c1", CardState::New, 0.0, 0.0, 0, 0, now, rating),
        Some(c) => schedule_card(
            "c1",
            CardState::from(i64::from(c.state)),
            c.stability,
            c.difficulty,
            c.reps,
            c.last_review,
            now,
            rating,
        ),
    }
}

fn assert_card(card: &CardSchedule, state: CardState, wait: i64, stability: f64, difficulty: f64) {
    assert_eq!(card.state, state as u8, "state");
    assert_eq!(card.due - card.last_review, wait, "seconds until due");
    assert_close(card.stability, stability, "stability");
    assert_close(card.difficulty, difficulty, "difficulty");
}

#[test]
fn test_forgetting_curve_and_interval_match_fsrs5() {
    assert_close(calculate_retrievability(10.0, 10.0), 0.9, "R(S, S)");
    assert_eq!(next_interval_days(100.0, 0.9), 100);
    assert_eq!(next_interval_days(365.0, 0.9), 365);
    assert_eq!(next_interval_days(1.0e6, 0.9), 36_500, "maximum interval");
}

#[test]
fn test_new_card_ratings_match_fsrs5() {
    assert_card(&review(None, Rating::Again, T0), CardState::Learning, 600, 0.40255, 7.1949);
    assert_card(&review(None, Rating::Hard, T0), CardState::Review, DAY, 1.18385, 6.488305);
    assert_card(&review(None, Rating::Good, T0), CardState::Review, 3 * DAY, 3.173, 5.282434);
    assert_card(&review(None, Rating::Easy, T0), CardState::Review, 16 * DAY, 15.69105, 3.224502);
}

#[test]
fn test_good_at_every_due_date_matches_fsrs5() {
    // (days until due, stability, difficulty) after each Good rating.
    let expected = [
        (3, 3.173, 5.282434),
        (11, 10.738926, 5.272968),
        (35, 34.577624, 5.263545),
        (101, 100.748313, 5.254165),
        (269, 269.283835, 5.244829),
        (669, 669.309326, 5.235535),
        (1563, 1563.237654, 5.226285),
        (3454, 3453.862383, 5.217076),
    ];
    let mut card = review(None, Rating::Good, T0);
    for (i, (days, stability, difficulty)) in expected.into_iter().enumerate() {
        if i > 0 {
            card = review(Some(&card), Rating::Good, card.due);
        }
        assert_eq!(card.reps, i as i64 + 1, "reps");
        assert_card(&card, CardState::Review, days * DAY, stability, difficulty);
    }
}

#[test]
fn test_later_reviews_match_fsrs5() {
    let good = review(None, Rating::Good, T0);
    let hard = review(Some(&good), Rating::Hard, good.due);
    assert_card(&hard, CardState::Review, 5 * DAY, 4.924512, 6.03495);
    let easy = review(Some(&good), Rating::Easy, good.due);
    assert_card(&easy, CardState::Review, 26 * DAY, 25.793605, 4.510986);
    let overdue = review(Some(&good), Rating::Good, T0 + 10 * DAY);
    assert_card(&overdue, CardState::Review, 24 * DAY, 23.895876, 5.272968);
    let same_day = review(Some(&good), Rating::Good, T0 + 2 * 3600);
    assert_card(&same_day, CardState::Review, 4 * DAY, 4.466858, 5.272968);
}

#[test]
fn test_lapse_and_learning_match_fsrs5() {
    let good = review(None, Rating::Good, T0);
    let good = review(Some(&good), Rating::Good, good.due);
    let lapse = review(Some(&good), Rating::Again, good.due);
    assert_card(&lapse, CardState::Relearning, 600, 2.185775, 6.790568);
    let relearned = review(Some(&lapse), Rating::Good, lapse.due);
    assert_card(&relearned, CardState::Review, 3 * DAY, 3.077071, 6.774164);

    let again = review(None, Rating::Again, T0);
    let again = review(Some(&again), Rating::Again, again.due);
    assert_card(&again, CardState::Learning, 600, 0.201689, 8.082797);
    let learned = review(Some(&again), Rating::Good, again.due);
    assert_card(&learned, CardState::Review, DAY, 0.283932, 8.060449);
}
