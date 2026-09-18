"""This repository does not sit inside a folder that a cloud client syncs (TL-09).

Measured on 2026-09-18, with the repository still at `C:\\Users\\maros\\OneDrive\\Documents\\Antigravity\\book-engine`:

- git kept **424** files. The folder held **37,083** files and **24.22 GB**.
- `apps/desktop/src-tauri/target` alone was **23.79 GB**, which is what cargo writes again on every build. The
  review that opened this entry measured 8.3 GB four days earlier, so it had almost tripled.
- **Every** file was a OneDrive placeholder, including the files inside `.git`. A stale `.git/worktrees` folder
  could not be removed by git at all, because the client had marked it read-only, and every commit printed
  `failed to delete ... Permission denied` until it was cleared by hand.

Three pieces of this code exist only to survive that: `vault/safe_write.rs` tries a rename again when the client
holds the file, `ingest/vault_changes.py` tries a move again and takes the read-only mark off a folder before it
removes it, and `db/indexer.rs` keeps the rows of a file it could not read. They stay, because a reader can still
keep a vault in a synced folder on purpose. What must not be synced is the repository, which git already keeps.
"""

import os
from pathlib import Path

from conftest import REPO

#: The variable each client sets for the folder it syncs, whatever the computer calls that folder.
SYNC_VARIABLES = ("OneDrive", "OneDriveConsumer", "OneDriveCommercial", "Dropbox", "iCloudDrive")

#: The name of a synced folder on a computer that sets no variable for it. `OneDrive - <company>` is the shape a
#: work account gives it, so it is matched by its start.
SYNC_NAMES = ("onedrive", "dropbox", "google drive", "googledrive", "icloud drive", "iclouddrive")

WHERE_TO_PUT_IT = (
    "Move it somewhere the client does not reach, for example C:\\dev\\book-engine, or point CARGO_TARGET_DIR "
    "at a folder outside it. git keeps 424 files of this repository; the build writes tens of thousands more."
)


def syncing_folder_over(path: Path) -> str | None:
    """The name of the cloud folder that holds `path`, or nothing when no client syncs it."""
    path = path.resolve()
    for variable in SYNC_VARIABLES:
        named = os.environ.get(variable, "").strip()
        if not named:
            continue
        root = Path(named).resolve()
        if root == path or root in path.parents:
            return str(root)
    for part in path.parts:
        plain = part.lower()
        if plain in SYNC_NAMES or plain.startswith("onedrive -"):
            return part
    return None


def build_output() -> Path:
    """Where cargo writes, which is `CARGO_TARGET_DIR` when it is set and the folder beside the manifest when not."""
    named = os.environ.get("CARGO_TARGET_DIR", "").strip()
    return Path(named) if named else REPO / "apps" / "desktop" / "src-tauri" / "target"


def test_the_repository_is_not_inside_a_folder_a_cloud_client_syncs():
    """The client uploads every file the build writes, marks folders read-only while it works, and holds a file
    open long enough for a rename to fail."""
    holder = syncing_folder_over(REPO)
    assert holder is None, f"This repository is inside {holder}, which a cloud client syncs. {WHERE_TO_PUT_IT}"


def test_what_the_build_writes_is_not_inside_a_folder_a_cloud_client_syncs():
    """Moving the repository is one answer and `CARGO_TARGET_DIR` is the other, so this reads whichever is in use."""
    holder = syncing_folder_over(build_output())
    assert holder is None, f"cargo writes into {holder}, which a cloud client syncs. {WHERE_TO_PUT_IT}"


def test_the_readme_and_the_rules_say_where_to_keep_this_repository():
    """A check that fails must say what to do about it somewhere a person and an agent both read, and it must say
    it under a heading someone looking for it can find."""
    for name, heading in (("README.md", "### Where to keep this repository"), ("AGENTS.md", "No Cloud Client Syncs")):
        text = (REPO / name).read_text(encoding="utf-8")
        assert heading in text, f"{name} has no section about where to keep this repository"
        for word in ("OneDrive", "CARGO_TARGET_DIR"):
            assert word in text, f"{name} does not name {word}"


def test_git_does_not_keep_what_the_build_writes():
    """The 23.79 GB was never in git. It is `.gitignore` that keeps it out, and this fails if that stops."""
    ignored = (REPO / ".gitignore").read_text(encoding="utf-8")
    for pattern in ("target/", "node_modules/"):
        assert pattern in ignored, f".gitignore no longer keeps out {pattern}"
