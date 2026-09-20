//! One safe way to ask whether something is already saved at a path.
//!
//! `Path::exists` is `fs::metadata(..).is_ok()`. The standard library's own documentation says a permission
//! error answers `false`, so a file that is locked, offline or not allowed reads as "nothing saved yet". The
//! caller then hands back empty data and the next save writes over the reader's work (DS-16). That is the loss
//! `json_store` was written to stop, reached through the stat call instead of the parse.
//!
//! So an answer that could not be got means **the file is there**. `is_taken` and `book_is_in_vault` already
//! read it that way, for DS-12 and LC-02. This is that reading, in one place, for everybody.

use std::path::Path;

/// Whether something is already saved at `path`. An answer that could not be got means yes.
///
/// A caller that hears "no" is free to hand back empty data and write over the file, so "no" must mean the file
/// was really looked at and was really not there.
pub fn file_is_there(path: &Path) -> bool {
    an_answer_that_could_not_be_got_means_yes(path.try_exists())
}

/// What `file_is_there` makes of one `try_exists` answer. It is its own function because the disk cannot be
/// made to refuse inside a test, and this is the rule the whole finding turns on.
pub(crate) fn an_answer_that_could_not_be_got_means_yes(answer: std::io::Result<bool>) -> bool {
    answer.unwrap_or(true)
}
