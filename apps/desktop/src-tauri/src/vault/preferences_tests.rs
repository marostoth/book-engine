//! DS-11: your settings are kept in the vault, whole, and a damaged settings file is never saved over.

use std::fs;
use std::path::PathBuf;

use serde_json::json;

use crate::test_support::Sandbox;
use crate::vault::preferences::{load_preferences, save_preferences, Preferences, PREFERENCES_FILE};

fn settings_file(sandbox: &Sandbox) -> PathBuf {
    sandbox.vault().join(PREFERENCES_FILE)
}

fn settings(value: serde_json::Value) -> Preferences {
    value.as_object().expect("settings are an object").clone()
}

#[test]
fn saved_settings_come_back() {
    let sandbox = Sandbox::new();
    let chosen = settings(json!({
        "general": { "theme": "nord", "fontSize": 18 },
        "elementary": { "pacerWpm": 325 },
        "study": { "gatekeeperMode": true, "dailyTargetCards": 35 }
    }));

    save_preferences(&chosen).expect("save the settings");

    assert_eq!(load_preferences().expect("read the settings"), Some(chosen));
    assert!(settings_file(&sandbox).exists(), "the settings must be at the top of the vault");
}

#[test]
fn no_settings_file_means_no_settings_saved_yet() {
    let _sandbox = Sandbox::new();

    assert_eq!(load_preferences().expect("no file is not an error"), None);
}

#[test]
fn a_setting_this_build_does_not_know_is_kept_in_its_place() {
    let sandbox = Sandbox::new();
    let from_a_newer_build = settings(json!({
        "general": { "theme": "sepia" },
        "readingRuler": { "height": 3, "colour": "amber" },
        "study": { "dailyTargetCards": 20 }
    }));

    save_preferences(&from_a_newer_build).expect("save the settings");

    let text = fs::read_to_string(settings_file(&sandbox)).expect("read the file");
    let ruler = text.find("readingRuler").expect("the unknown setting must be kept");
    assert!(
        text.find("general").expect("general") < ruler && ruler < text.find("study").expect("study"),
        "the keys must keep their order: {text}"
    );
    assert_eq!(load_preferences().expect("read"), Some(from_a_newer_build));
}

#[test]
fn a_damaged_settings_file_is_kept_and_never_saved_over() {
    let sandbox = Sandbox::new();
    let damaged = "{\"general\": {\"theme\": \"no";
    sandbox.write(PREFERENCES_FILE, damaged);

    let error = load_preferences().expect_err("damaged settings must not read as no settings");
    assert!(error.to_string().contains(PREFERENCES_FILE), "the error must name the file: {error}");

    save_preferences(&settings(json!({ "general": { "theme": "paper" } })))
        .expect_err("a save must not write the default settings over the reader's own");
    assert_eq!(fs::read_to_string(settings_file(&sandbox)).expect("read"), damaged);

    let copies = fs::read_dir(sandbox.vault())
        .expect("list the vault")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("preferences.json.corrupt-"))
        .count();
    assert_eq!(copies, 1, "one copy of the damaged file must be kept");
}

#[test]
fn a_file_that_holds_no_settings_object_is_refused() {
    let sandbox = Sandbox::new();
    sandbox.write(PREFERENCES_FILE, "[\"paper\"]");

    load_preferences().expect_err("a list is not settings, and must not read as no settings");
    assert_eq!(fs::read_to_string(settings_file(&sandbox)).expect("read"), "[\"paper\"]");
}
