//! Tests for `book_pictures.rs`: the window may load the pictures of each book, and no other folder (SEC-02).

#[cfg(windows)]
use crate::test_support::junction;
use crate::test_support::Sandbox;
use crate::vault::book_pictures::book_picture_folders;

#[test]
fn only_the_picture_folder_of_each_book_is_opened() {
    let sandbox = Sandbox::new();
    sandbox.write("books/economics/ch-01.md", "# Chapter 1\n");
    sandbox.write("books/economics/assets/figure-1.png", "png");
    sandbox.write("books/marketing/assets/figure-2.png", "png");
    // A book with no pictures, a file beside the books, and a book whose `assets` is a file.
    sandbox.write("books/wealth/ch-01.md", "# Chapter 1\n");
    sandbox.write("books/readme.txt", "not a book");
    sandbox.write("books/odd/assets", "a file, not a folder");
    // Pictures outside the books.
    sandbox.write("notes/economics/assets/figure-1.png", "png");
    sandbox.write("assets/figure-1.png", "png");

    let books = sandbox.vault().join("books");
    assert_eq!(
        book_picture_folders(&sandbox.vault()).expect("list the picture folders"),
        vec![
            books.join("economics").join("assets"),
            books.join("marketing").join("assets")
        ]
    );
}

/// Tauri follows a link when it allows a folder. So a book folder or a picture folder that is a link to another place
/// would let the window load every file in that place.
#[cfg(windows)]
#[test]
fn a_book_folder_or_picture_folder_that_is_a_link_is_not_opened() {
    let sandbox = Sandbox::new();
    sandbox.write("books/economics/assets/figure-1.png", "png");
    let outside = sandbox.vault().parent().expect("sandbox folder").join("outside");
    std::fs::create_dir_all(outside.join("assets")).expect("create the outside folder");
    std::fs::write(outside.join("assets").join("secret.txt"), "secret").expect("write the outside file");

    let books = sandbox.vault().join("books");
    junction(&books.join("linked-book"), &outside);
    std::fs::create_dir_all(books.join("linked-pictures")).expect("create the book folder");
    junction(&books.join("linked-pictures").join("assets"), &outside.join("assets"));

    let folders = book_picture_folders(&sandbox.vault());

    // The junctions go first, so the sandbox clean-up never reaches the folder they point at.
    std::fs::remove_dir(books.join("linked-book")).expect("remove a junction");
    std::fs::remove_dir(books.join("linked-pictures").join("assets")).expect("remove a junction");
    assert_eq!(
        folders.expect("list the picture folders"),
        vec![books.join("economics").join("assets")]
    );
    assert!(
        outside.join("assets").join("secret.txt").exists(),
        "the folder a junction pointed at stays"
    );
}
