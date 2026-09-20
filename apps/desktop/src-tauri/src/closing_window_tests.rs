//! Tests for the window that holds a close back so the page can save what the reader typed (DS-17).
//!
//! The page side is tested in `src/lib/savingBeforeClose.test.tsx`, which also reads this crate's `lib.rs` to check
//! that the page and the window still use the same name for the event.

use super::ClosingGuard;
use std::sync::Arc;

/// The first close is held back and the page is asked. Every close after that goes through.
///
/// A reader who presses the X again must not meet a window that will not close, and a page that never answers must
/// not lock the app open for ever.
#[test]
fn the_first_close_asks_the_page_and_the_next_ones_do_not() {
    let guard = ClosingGuard::default();
    assert!(
        guard.should_ask_the_page(),
        "the first close did not ask the page to save"
    );
    assert!(
        !guard.should_ask_the_page(),
        "the second close asked again instead of closing the window"
    );
    assert!(
        !guard.should_ask_the_page(),
        "the third close asked again instead of closing the window"
    );
}

/// Two closes at the same moment ask once between them, not twice and not never.
///
/// The close arrives on the window's own thread and the answer arrives on another, so the two can meet.
#[test]
fn many_closes_at_once_ask_the_page_once() {
    let guard = Arc::new(ClosingGuard::default());
    let asked: Vec<bool> = (0..16)
        .map(|_| {
            let guard = Arc::clone(&guard);
            std::thread::spawn(move || guard.should_ask_the_page())
        })
        .map(|thread| thread.join().expect("the thread ends"))
        .collect();

    assert_eq!(
        asked.iter().filter(|&&yes| yes).count(),
        1,
        "16 closes at once did not ask the page exactly once"
    );
}
