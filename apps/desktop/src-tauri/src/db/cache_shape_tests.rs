//! The cache's shape is pinned, so a change to its tables asks for a new `CACHE_SCHEMA_VERSION` (TL-16).
//!
//! The version is what keeps an older build from opening a file a newer build made. The only tests of it compared
//! the stamp in the file with the constant that wrote it, so both sides were the same number. Column names were
//! pinned by accident, through the SQL of about eight test files, but only against a rename or a drop: a new table
//! or a new nullable column broke nothing, the version stayed at 1, and an older build opened the newer file.
//!
//! `cache_shapes/<version>.txt` holds the shape of the cache each version makes. A new cache must have the shape of
//! the version this build stamps, and each of those files is held by its hash, because a file that has shipped is a
//! file some user's cache already has.

use crate::db::schema::{get_db_path, open_or_create_db, CACHE_SCHEMA_VERSION};
use crate::test_support::Sandbox;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

/// The SHA-256 of each shape file, with its line endings taken out. A version is added here once, when it is made,
/// and never changed after.
const SHAPE_HASHES: &[(i64, &str)] = &[(1, "f032caea28c08169d2718cc12f6af1d0c37ab3fd51c455d544bce9ffa77eaa54")];

/// The folder of the shape files.
fn shapes_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("db")
        .join("cache_shapes")
}

/// The shape file of `version`, with Windows line endings taken out: git gives this repository CRLF on Windows.
fn shape_file(version: i64) -> Option<String> {
    let text = std::fs::read_to_string(shapes_dir().join(format!("{version}.txt"))).ok()?;
    Some(text.replace('\r', ""))
}

/// The SQL of a table or index as one line, without its comments, so a comment or a line break is not a new shape.
fn one_line(sql: &str) -> String {
    sql.lines()
        .map(|line| line.split("--").next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Every table, column and index of the file `conn` has open, one per line, in name order.
///
/// A plain table is described by its columns, because a column added later with `ALTER TABLE` changes the stored
/// SQL of the table but not what the table is. A search table and an index are described by their SQL, because
/// that is the only place their options are.
fn shape_of(conn: &Connection) -> String {
    let mut shape = String::new();
    let tables: Vec<(String, String)> = conn
        .prepare(
            "SELECT name, type FROM pragma_table_list
             WHERE schema = 'main' AND type IN ('table', 'virtual') AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )
        .and_then(|mut stmt| stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect())
        .expect("list the tables");
    for (table, kind) in tables {
        if kind == "virtual" {
            let sql: String = conn
                .query_row("SELECT sql FROM sqlite_master WHERE name = ?1", [&table], |row| {
                    row.get(0)
                })
                .expect("read the SQL of a search table");
            shape.push_str(&format!("virtual {table}: {}\n", one_line(&sql)));
            continue;
        }
        shape.push_str(&format!("table {table}\n"));
        let columns: Vec<String> = conn
            .prepare("SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_xinfo(?1) ORDER BY cid")
            .and_then(|mut stmt| {
                stmt.query_map([&table], |row| {
                    Ok(format!(
                        "  {} {} notnull={} default={} pk={}",
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "none".to_string()),
                        row.get::<_, i64>(4)?
                    ))
                })?
                .collect()
            })
            .expect("list the columns");
        for column in columns {
            shape.push_str(&column);
            shape.push('\n');
        }
    }
    let indexes: Vec<(String, String)> = conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name")
        .and_then(|mut stmt| stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect())
        .expect("list the indexes");
    for (index, sql) in indexes {
        shape.push_str(&format!("index {index}: {}\n", one_line(&sql)));
    }
    shape
}

fn sha256_of(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

#[test]
fn a_new_cache_has_the_shape_of_the_version_it_is_stamped_with() {
    let _sandbox = Sandbox::new();
    let conn = open_or_create_db().expect("open the cache");
    let made = shape_of(&conn);

    let file = shapes_dir().join(format!("{CACHE_SCHEMA_VERSION}.txt"));
    let pinned = shape_file(CACHE_SCHEMA_VERSION)
        .unwrap_or_else(|| panic!("{} is missing. This build makes this shape:\n{made}", file.display()));
    assert!(
        made == pinned,
        "The cache tables changed and CACHE_SCHEMA_VERSION did not, so an older build would open this file and lose \
         what it does not know. Raise CACHE_SCHEMA_VERSION to {next}, save the shape below as cache_shapes/{next}.txt, \
         add its hash to SHAPE_HASHES, and make `make_the_tables` bring a file of every older shape to it. Never edit \
         {old}: a user's cache already has it.\n--- this build makes ---\n{made}--- {old} holds ---\n{pinned}",
        next = CACHE_SCHEMA_VERSION + 1,
        old = file.display()
    );
}

#[test]
fn no_shape_a_build_has_made_is_edited() {
    let versions: Vec<i64> = SHAPE_HASHES.iter().map(|(version, _)| *version).collect();
    assert_eq!(
        versions,
        (1..=CACHE_SCHEMA_VERSION).collect::<Vec<_>>(),
        "SHAPE_HASHES must hold every version from 1 to CACHE_SCHEMA_VERSION, once each and in order"
    );
    for (version, hash) in SHAPE_HASHES {
        let text = shape_file(*version).unwrap_or_else(|| panic!("cache_shapes/{version}.txt is missing"));
        assert_eq!(
            &sha256_of(&text),
            hash,
            "cache_shapes/{version}.txt changed. It is the shape a build of version {version} made, and a user's \
             cache already has it. Put it back, and give a new shape a new version."
        );
    }
}

#[test]
fn a_cache_from_before_the_version_is_brought_to_the_shape_of_this_build() {
    // A build before `user_version` made `fsrs_cards` without `card_type` and `payload` and left the stamp at 0.
    // `make_the_tables` adds the two columns and stamps the file. A column added to the `CREATE TABLE` of
    // `fsrs_cards` alone would reach a new cache and never this one, and this is the test that sees it.
    let _sandbox = Sandbox::new();
    let path = get_db_path().expect("the cache path");
    {
        let old = Connection::open(&path).expect("make the old cache");
        old.execute_batch(
            "CREATE TABLE fsrs_cards (
                 card_id TEXT PRIMARY KEY,
                 book_id TEXT NOT NULL,
                 chapter_file TEXT NOT NULL,
                 anchor TEXT,
                 item_type TEXT NOT NULL,
                 prompt TEXT NOT NULL,
                 answer TEXT NOT NULL,
                 state INTEGER NOT NULL DEFAULT 0,
                 stability REAL NOT NULL DEFAULT 0.0,
                 difficulty REAL NOT NULL DEFAULT 0.0,
                 due INTEGER NOT NULL DEFAULT 0,
                 last_review INTEGER NOT NULL DEFAULT 0,
                 reps INTEGER NOT NULL DEFAULT 0
             );
             INSERT INTO fsrs_cards (card_id, book_id, chapter_file, item_type, prompt, answer, reps)
             VALUES ('card-1', 'smith', 'ch-01.md', 'cloze', 'The {{c1::market}} sets the price.', 'market', 3);",
        )
        .expect("write the old shape");
    }

    let conn = open_or_create_db().expect("open the old cache");

    let pinned = shape_file(CACHE_SCHEMA_VERSION).expect("the shape file of this build");
    assert_eq!(
        shape_of(&conn),
        pinned,
        "the old cache did not reach the shape this build stamps"
    );
    let (card_type, reps): (String, i64) = conn
        .query_row(
            "SELECT card_type, reps FROM fsrs_cards WHERE card_id = 'card-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("the old card is still there");
    assert_eq!(
        (card_type.as_str(), reps),
        ("cloze", 3),
        "the old card lost its progress"
    );
}
