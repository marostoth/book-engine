//! LC-01: the vault is found by the folder the reader picked, not only by where the app was started.
//!
//! `locate_vault` reads the working folder and the program folder, which a test cannot change safely, so
//! these tests cover the two parts a reader meets: what counts as a vault, and what the app remembers.
//! In a test build the search takes only a folder inside the sandbox, so a test run from the repository
//! never finds the real vault above its working folder (DS-10).

use crate::test_support::Sandbox;
use crate::vault::locate::{forget_vault, is_vault, locate_vault, not_found_message, remember_vault, FoundBy};

/// A folder inside the sandbox, made empty.
fn folder(sandbox: &Sandbox, name: &str) -> std::path::PathBuf {
    let path = sandbox.vault().parent().expect("sandbox root").join(name);
    std::fs::create_dir_all(&path).expect("make the folder");
    path
}

/// A folder inside the sandbox that is a vault: it has `books` inside it.
fn vault_folder(sandbox: &Sandbox, name: &str) -> std::path::PathBuf {
    let path = folder(sandbox, name);
    std::fs::create_dir_all(path.join("books")).expect("make the books folder");
    path
}

#[test]
fn a_folder_with_books_inside_is_a_vault() {
    let sandbox = Sandbox::new();

    assert!(is_vault(&vault_folder(&sandbox, "my-library")));
}

#[test]
fn a_folder_without_books_inside_is_not_a_vault() {
    let sandbox = Sandbox::new();

    assert!(!is_vault(&folder(&sandbox, "downloads")));
}

#[test]
fn a_file_is_not_a_vault() {
    let sandbox = Sandbox::new();
    let path = sandbox.vault().parent().expect("root").join("notes.txt");
    std::fs::write(&path, "hello").expect("write the file");

    assert!(!is_vault(&path));
}

#[test]
fn a_folder_that_does_not_exist_is_not_a_vault() {
    let sandbox = Sandbox::new();

    assert!(!is_vault(&sandbox.vault().join("nowhere")));
}

#[test]
fn a_test_never_finds_the_real_vault() {
    let _sandbox = Sandbox::new();

    // The tests run inside the repository, so a search up from the working folder would find the real vault.
    assert_eq!(locate_vault(), None, "a test may only find a vault it made");
}

#[test]
fn the_folder_the_reader_picks_is_remembered_and_used() {
    let sandbox = Sandbox::new();
    let picked = vault_folder(&sandbox, "my-library");

    let saved = remember_vault(&picked).expect("remember the folder");

    let (found, how) = locate_vault().expect("the vault must be found");
    assert_eq!(found, saved, "the app must use the folder the reader picked");
    assert_eq!(how, FoundBy::Saved);
}

#[test]
fn a_folder_with_no_books_inside_is_refused_and_nothing_is_remembered() {
    let sandbox = Sandbox::new();
    let not_a_vault = folder(&sandbox, "downloads");

    let error = remember_vault(&not_a_vault).expect_err("a folder with no books must be refused");

    let message = format!("{error:#}");
    assert!(
        message.contains("not a vault folder"),
        "the message must say so: {message}"
    );
    assert!(message.contains("books"), "and what a vault looks like: {message}");
    assert!(
        !crate::test_support::settings_path().expect("path").exists(),
        "nothing may be remembered when the folder is refused"
    );
}

#[test]
fn a_path_that_is_not_a_folder_is_refused() {
    let sandbox = Sandbox::new();
    let path = sandbox.vault().parent().expect("root").join("book.md");
    std::fs::write(&path, "# a file, not a folder").expect("write the file");

    let error = remember_vault(&path).expect_err("a file must be refused");

    assert!(format!("{error:#}").contains("not a folder"), "{error:#}");
}

#[test]
fn a_second_pick_replaces_the_first() {
    let sandbox = Sandbox::new();
    remember_vault(&vault_folder(&sandbox, "first")).expect("first pick");
    let second = remember_vault(&vault_folder(&sandbox, "second")).expect("second pick");

    let (found, _) = locate_vault().expect("the vault must be found");
    assert_eq!(found, second, "the newest pick wins");
}

#[test]
fn a_saved_folder_that_is_gone_is_not_used() {
    let sandbox = Sandbox::new();
    let picked = vault_folder(&sandbox, "on-a-usb-stick");
    remember_vault(&picked).expect("remember the folder");
    std::fs::remove_dir_all(&picked).expect("the stick is pulled out");

    // Nothing else in the sandbox is a vault.
    let found = locate_vault();

    assert_eq!(found, None, "a folder that is gone must not be used");
}

#[test]
fn forgetting_the_folder_leaves_the_settings_readable() {
    let sandbox = Sandbox::new();
    remember_vault(&vault_folder(&sandbox, "my-library")).expect("remember the folder");

    forget_vault().expect("forget the folder");

    let text = std::fs::read_to_string(crate::test_support::settings_path().expect("path")).expect("read the settings");
    assert!(!text.contains("vaultPath"), "the saved folder must be gone: {text}");
    assert!(
        serde_json::from_str::<serde_json::Value>(&text).is_ok(),
        "and the file must still parse"
    );
}

#[test]
fn a_damaged_settings_file_does_not_stop_the_app() {
    let sandbox = Sandbox::new();
    let picked = vault_folder(&sandbox, "my-library");
    remember_vault(&picked).expect("remember the folder");
    std::fs::write(
        crate::test_support::settings_path().expect("path"),
        "{ this is not json",
    )
    .expect("damage the settings");

    // It must not panic and must not use the damaged file.
    let found = locate_vault();

    assert_eq!(found, None, "a damaged settings file must not be trusted");
    // And the reader can pick again, which writes the file afresh.
    remember_vault(&picked).expect("pick again");
    let (found, how) = locate_vault().expect("the vault must be found");
    assert_eq!(found, std::fs::canonicalize(&picked).expect("full path"));
    assert_eq!(how, FoundBy::Saved);
}

#[test]
fn the_message_for_no_vault_says_what_to_look_for() {
    let message = not_found_message();

    assert!(message.contains("books"), "it must name the books folder: {message}");
    assert!(message.contains("Choose"), "and tell the reader what to do: {message}");
}
