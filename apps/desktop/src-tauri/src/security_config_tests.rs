//! Tests for the security part of `tauri.conf.json`: what the app window may run and load (SEC-02).
//!
//! The content security policy works only in the built app. `tauri dev` loads the page from the Vite server, which
//! sends no policy, so a dev run never shows a rule that blocks something.

use serde_json::Value;

const CONFIG: &str = include_str!("../tauri.conf.json");
const PAGE: &str = include_str!("../../index.html");

fn security() -> Value {
    let config: Value = serde_json::from_str(CONFIG).expect("tauri.conf.json holds JSON");
    config["app"]["security"].clone()
}

/// Each directive of the content security policy with its sources. Empty when the config has no policy.
fn policy() -> Vec<(String, Vec<String>)> {
    let Some(directives) = security()["csp"].as_object().cloned() else {
        return Vec::new();
    };
    directives
        .into_iter()
        .map(|(name, sources)| {
            let sources = sources.as_str().expect("a directive is one string of sources");
            (name, sources.split_whitespace().map(str::to_string).collect())
        })
        .collect()
}

fn sources(directive: &str) -> Vec<String> {
    policy().into_iter().find(|(name, _)| name == directive).map(|(_, sources)| sources).unwrap_or_default()
}

/// A tag that a book or a hostile file puts into the page, such as `<img src=x onerror=...>`, runs nothing, and no page
/// code can load a script from another place.
#[test]
fn only_the_files_of_the_app_run_as_scripts() {
    assert_eq!(sources("default-src"), ["'self'"]);
    assert_eq!(sources("script-src"), ["'self'"]);
    assert_eq!(sources("object-src"), ["'none'"]);
    assert_eq!(sources("base-uri"), ["'none'"]);
    assert_eq!(sources("form-action"), ["'none'"]);
    let never = [
        "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'", "'strict-dynamic'", "*", "data:", "blob:", "http:", "https:",
    ];
    for (directive, sources) in policy() {
        for source in sources {
            let lower = source.to_ascii_lowercase();
            assert!(!never.contains(&lower.as_str()), "{directive} must not allow {source}");
            assert!(
                lower != "'unsafe-inline'" || directive == "style-src",
                "{directive} must not allow {source}: only styles may be inline"
            );
        }
    }
}

/// The window shows pictures only from the files of the app and from the asset protocol, which opens only the picture
/// folders of the books (`vault/book_pictures.rs`). A picture from the internet does not load.
#[test]
fn pictures_come_only_from_the_app_and_the_book_picture_folders() {
    assert_eq!(sources("img-src"), ["'self'", "asset:", "http://asset.localhost"]);
}

/// The window reaches no server but the two font hosts that `index.html` has always used, and the local hosts of the
/// app: the book pictures (`asset.localhost`) and the calls to the app backend (`ipc.localhost`).
#[test]
fn the_window_reaches_no_server_but_the_fonts_and_the_app() {
    let allowed = [
        ("style-src", "https://fonts.googleapis.com"),
        ("font-src", "https://fonts.gstatic.com"),
        ("img-src", "http://asset.localhost"),
        ("connect-src", "http://ipc.localhost"),
    ];
    assert!(!policy().is_empty(), "the config must have a content security policy");
    for (directive, sources) in policy() {
        for source in sources.iter().filter(|source| source.contains("://")) {
            assert!(
                allowed.contains(&(directive.as_str(), source.as_str())),
                "{directive} must not reach {source}"
            );
        }
    }
    assert_eq!(sources("connect-src"), ["'self'", "ipc:", "http://ipc.localhost"]);
    assert_eq!(sources("font-src"), ["'self'", "https://fonts.gstatic.com"]);
}

/// On its own, the asset protocol opens no file. A chapter load lets it open the picture folders of the books.
#[test]
fn the_asset_protocol_opens_no_file_on_its_own() {
    let asset_protocol = &security()["assetProtocol"];
    assert_eq!(asset_protocol["enable"], Value::Bool(true), "the reader shows book pictures through it");
    assert_eq!(asset_protocol["scope"], Value::Array(Vec::new()));
}

/// Tauri gives each `<style>` element of the page a nonce and adds that nonce to `style-src`. A browser then ignores
/// `'unsafe-inline'`, so the style element that TipTap adds to the page (the white space of the chapter text, among
/// others) would stop working, in the built app only.
#[test]
fn the_page_has_no_style_element_that_would_turn_off_inline_styles() {
    assert!(!PAGE.to_ascii_lowercase().contains("<style"), "index.html must not hold a <style> element");
}
