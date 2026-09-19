"""Git must not track a file that a build writes again, nor one the app writes while you use it (TL-08).

A tracked generated file has two costs. It shows as changed after every build, so `git status` stops meaning
anything and a real change hides among the noise. And it is committed from whichever machine built last, so two
people's commits fight over bytes neither of them wrote.

A tracked file that the APP writes is worse: using the program dirties the repository.

This was measured, not guessed. `apps/desktop/src-tauri/gen/schemas/` was rewritten by **every** `cargo build` of
the session that fixed this finding, and had to be restored by hand each time.

The `.gitignore` rule and the tracked set must agree. An ignore rule for a file git already tracks does nothing at
all: git keeps tracking it, and the rule reads as a promise that was never kept. `test_no_ignore_rule_is_a_lie`
holds that.
"""

import re
import subprocess

from conftest import REPO

#: Folders and patterns whose contents a build writes. None of them may be tracked.
BUILD_WRITES = {
    "apps/desktop/src-tauri/gen/": "cargo build writes it from src-tauri/capabilities/",
    "apps/desktop/src-tauri/target/": "cargo build writes it",
    "target/": "cargo build writes it",
    "node_modules/": "npm install writes it",
    "dist/": "vite build writes it",
    ".egg-info/": "pip writes it on every build (IN-11)",
}

#: The icons an NSIS Windows bundle needs, plus the two masters every other size is made from.
#: `npx tauri icon apps/desktop/src-tauri/icons/source-icon.svg` writes any platform's set again.
ICONS_TO_KEEP = {
    "32x32.png",
    "128x128.png",
    "128x128@2x.png",
    "icon.ico",
    "icon.png",
    "source-icon.svg",
}

ICON_DIR = "apps/desktop/src-tauri/icons/"

#: Vault paths the app itself writes. A file here that git tracks means using the reader dirties the repository.
#: `vault/_ledger.json` is deliberately NOT here: only an import writes it, and it is the one vault file git keeps,
#: which matters while DS-14 is open and the vault has no second copy.
APP_WRITES_IN_VAULT = (
    "vault/syntopicon/",
    "vault/preferences.json",
    "vault/.import/",
)


def tracked_files() -> list[str]:
    run = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True)
    return [line for line in run.stdout.splitlines() if line]


def test_git_can_be_asked_what_it_tracks():
    """Prove the reader sees a real answer, before any "nothing is tracked" conclusion below means anything."""
    tracked = tracked_files()

    assert len(tracked) > 100, f"this repository has hundreds of files; git ls-files gave {len(tracked)}"
    assert "package.json" in tracked, "git ls-files did not name package.json, so this reader is not reading git"


def test_git_tracks_nothing_a_build_writes():
    """A file a build writes again does not belong in git."""
    tracked = tracked_files()
    found = {}
    for path in tracked:
        for pattern, why in BUILD_WRITES.items():
            if pattern in path:
                found.setdefault(f"{pattern}  ({why})", []).append(path)

    assert not found, "git tracks files that a build writes again:\n" + "\n".join(
        f"  {pattern}\n" + "\n".join(f"    {path}" for path in sorted(paths))
        for pattern, paths in sorted(found.items())
    )


def test_git_tracks_no_vault_file_the_app_writes():
    """Using the reader must never dirty the repository."""
    tracked = tracked_files()
    found = sorted(path for path in tracked if path.startswith(APP_WRITES_IN_VAULT))

    assert not found, (
        "git tracks vault files that the app writes, so saving a topic or a report makes the repository dirty:\n"
        + "\n".join(f"  {path}" for path in found)
    )


def test_git_tracks_only_the_icons_the_build_names():
    """53 icons were tracked for a bundle that names four. The rest came with the Tauri template."""
    tracked = tracked_files()
    icons = [path for path in tracked if path.startswith(ICON_DIR)]

    assert icons, f"no icon is tracked under {ICON_DIR}; this test is watching the wrong place"

    extra = sorted(path for path in icons if path[len(ICON_DIR) :] not in ICONS_TO_KEEP)
    assert not extra, (
        "git tracks icons that the Windows bundle does not name. Delete them, or add the name to ICONS_TO_KEEP and "
        "say in tauri.conf.json which bundle needs it. `npx tauri icon <source-icon.svg>` writes any set again:\n"
        + "\n".join(f"  {path}" for path in extra)
    )


def test_every_icon_the_build_names_is_tracked():
    """The other half. A bundle that names a file git does not keep cannot be built from a fresh clone."""
    config = (REPO / "apps/desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8")
    named = re.findall(r'"(icons/[^"]+)"', config)
    assert named, "tauri.conf.json names no icon, so this test would pass on an empty list"

    tracked = set(tracked_files())
    missing = sorted(name for name in named if f"apps/desktop/src-tauri/{name}" not in tracked)
    assert not missing, "tauri.conf.json names icons that git does not track: " + ", ".join(missing)


#: Ways to stop whatever holds a port, with no look at what it is. `npm run dev` used to start with `kill-port`, and
#: the desktop shortcut turned the port into a process id with `OwningProcess` and stopped that, so a day the reader
#: had another Vite project open, starting Book Engine stopped it with no message at all (TL-08).
#:
#: These are short on purpose. The first version of this list held the whole statement,
#: `"Stop-Process -Id $_.OwningProcess"`, and the real line writes `` `$_ `` with PowerShell's backtick escape, so
#: the pattern did not match the very code it was written for. A mutation run found it: putting that line back
#: changed nothing. `OwningProcess` is the honest anchor, because the only reason to read it is to turn a port into
#: a process to kill.
BLIND_KILLS = (
    "kill-port",
    "OwningProcess",
    "fkill",
)

#: Files that start the app. None of them may hold a blind kill.
STARTERS = ("package.json", "scripts/create_desktop_shortcut.ps1")


def without_powershell_escapes(text: str) -> str:
    """The text with PowerShell's backtick escape removed, so `` `$var `` reads as `$var`.

    Nothing in these two files uses a backtick for anything else, and dropping it can only make the search above
    find more, never less.
    """
    return text.replace("`", "")


def test_nothing_that_starts_the_app_kills_a_port_blind():
    """The port must be freed by something that first asks what is on it."""
    guilty = []
    for where in STARTERS:
        text = without_powershell_escapes((REPO / where).read_text(encoding="utf-8"))
        for pattern in BLIND_KILLS:
            if pattern in text:
                guilty.append(f"  {where} holds {pattern!r}")

    assert not guilty, (
        "these files stop whatever holds the dev port, without looking at what it is. Port 5173 is Vite's default, "
        "so this stops another project's dev server too. Use scripts/free-dev-port.mjs, which stops only this "
        "project's own leftover:\n" + "\n".join(guilty)
    )


def test_the_blind_kill_reader_can_see_the_line_it_is_looking_for():
    """Prove the patterns match the code they were written for, escapes and all.

    Without this, the test above passes because the fault was removed, and would keep passing if the fault came
    back in the shape it originally had. That is exactly what happened to its first version.
    """
    as_it_was = (
        "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue "
        "| ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force -ErrorAction SilentlyContinue }"
    )
    text = without_powershell_escapes(as_it_was)
    assert any(pattern in text for pattern in BLIND_KILLS), (
        f"none of {BLIND_KILLS} matches the line this test exists to forbid, so it forbids nothing: {as_it_was}"
    )

    assert any(pattern in "kill-port 5173" for pattern in BLIND_KILLS), (
        f"none of {BLIND_KILLS} matches the old predev command, so it forbids nothing either"
    )


def test_the_port_is_written_in_one_place_per_file_that_needs_it():
    """Three files must agree on the port, so each must name it and the names must match.

    `strictPort` is on, so Vite cannot move to another port, and `devUrl` must point at the one it uses. A change to
    one of the three and not the others gives a window that loads nothing, with no error from any check.
    """
    port = re.search(r"export const DEV_PORT = (\d+)", (REPO / "scripts/free-dev-port.mjs").read_text(encoding="utf-8"))
    assert port, "scripts/free-dev-port.mjs must name the port as `export const DEV_PORT = <number>`"
    number = port.group(1)

    vite = (REPO / "apps/desktop/vite.config.ts").read_text(encoding="utf-8")
    assert f"port: {number}" in vite, f"vite.config.ts must serve on port {number}"
    assert "strictPort: true" in vite, (
        "vite.config.ts must keep strictPort, or Vite moves to another port and devUrl points at nothing"
    )

    tauri = (REPO / "apps/desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8")
    assert f"localhost:{number}" in tauri, f"tauri.conf.json devUrl must point at port {number}"


def test_no_ignore_rule_is_a_lie():
    """An ignore rule for a file git already tracks does nothing. The rule must match the tracked set.

    `git check-ignore` answers for the rules alone; tracking wins over ignoring in git itself. So a path that is
    both tracked and ignored is a rule that reads as kept and is not.
    """
    tracked = tracked_files()
    # check=False: git check-ignore exits 1 when no path matches, which is the answer this test wants.
    run = subprocess.run(
        ["git", "check-ignore", "--no-index", "--", *tracked],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    both = sorted(line for line in run.stdout.splitlines() if line)

    assert not both, (
        "these files are tracked AND matched by a .gitignore rule, so the rule does nothing and the file stays in "
        "git. Untrack each one with `git rm --cached`, or drop the rule:\n" + "\n".join(f"  {path}" for path in both)
    )
