"""The line ceiling counts every source file git sees, in whatever folder it sits (TL-17).

`AGENTS.md` sets a ceiling of about 300 lines a file, and check 12 of the audit held the repository to it. It found the
files by walking four folders it named, so it held the Rust and TypeScript tests to the ceiling and never saw the tests
of the import, where 22 files were past it, or the scripts. Git names the files now, which also keeps out every folder
the repository ignores: books, builds and scratch work are not source.

Every test here builds its own little repository, so none of them reads this one.
"""

import json
import subprocess
from pathlib import Path
from types import ModuleType

from conftest import load_skill


def system() -> ModuleType:
    return load_skill("audit-system.py")


def a_repository_holding(root: Path, files: dict[str, int], new: dict[str, int]) -> Path:
    """A git repository with `files` staged and `new` written but never staged, each of that many lines."""
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    for group in (files, new):
        for name, lines in group.items():
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text(chr(10).join(["x"] * lines), encoding="utf-8")
        if group is files:
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
    return root


def test_a_source_file_in_any_folder_is_counted(tmp_path: Path):
    files = {
        "packages/ingestion/tests/test_long.py": 640,
        "scripts/free-a-port.mjs": 180,
        "apps/desktop/src/App.tsx": 12,
        "apps/desktop/src-tauri/build.rs": 3,
        "apps/desktop/eslint.config.js": 69,
    }
    root = a_repository_holding(tmp_path, files, new={"packages/ingestion/new_module.py": 301})

    counts = system().source_line_counts(root)

    assert counts == {**files, "packages/ingestion/new_module.py": 301}, "a file not yet staged is a file too"


def test_what_is_not_source_is_not_counted(tmp_path: Path):
    files = {
        ".gitignore": 1,
        "apps/desktop/src/vite-env.d.ts": 1,
        "docs/notes.md": 400,
        "gone.py": 400,
        "kept.py": 2,
    }
    root = a_repository_holding(tmp_path, files, new={"scratch/probe.py": 900, "vault/books/b/tool.js": 900})
    (root / ".gitignore").write_text("scratch/" + chr(10) + "vault/", encoding="utf-8")
    (root / "gone.py").unlink()

    counts = system().source_line_counts(root)

    assert counts == {"kept.py": 2}, "a declaration, a document, an ignored folder or a deleted file was counted"


def test_with_no_repository_to_ask_the_check_fails_and_says_why(tmp_path: Path, monkeypatch):
    """Check 12 runs last, so a count that raised would lose the table of all twelve. It must not pass either."""
    monkeypatch.setenv("GIT_DIR", str(tmp_path / "no-repository"))
    (tmp_path / "vault").mkdir()
    (tmp_path / "skills").mkdir()
    (tmp_path / "skills" / "long-files.json").write_text(json.dumps({"files": {"long.py": 400}}), encoding="utf-8")
    (tmp_path / "long.py").write_text(chr(10).join(["x"] * 400), encoding="utf-8")
    mod = system()
    mod.ROOT_DIR, mod.VAULT_DIR, mod.SKILLS_DIR = tmp_path, tmp_path / "vault", tmp_path / "skills"

    result = mod.check_modularity_and_vault_isolation()

    assert result.passed is False
    assert len(result.errors) == 1, "the held files were reported gone, which hides the reason"
    assert "git could not list the source files" in result.errors[0], result.errors
