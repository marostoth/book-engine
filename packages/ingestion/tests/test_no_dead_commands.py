"""Every backend command must be reachable, and something on screen must ask for it (LC-03).

A Tauri command is a Rust function the app's window can call by name. It is live only when three things line up:
the function carries `#[command]`, `lib.rs` lists it in `generate_handler![...]`, and some real frontend file
names it. Break any one and the code is dead, but it still has to compile, still has to pass review, and still
looks alive to the next reader.

The 2026-09-14 review found seven such commands by reading the code by hand. Two were defined and never
registered, three were registered and nothing asked for them, one was registered and by then a button did ask for
it, and one was never written at all. Reading by hand is how they got in, so reading by hand cannot be the guard.

WHAT THIS FILE LEARNED THE HARD WAY. The first three readers written for this job all answered "everything is
dead", and every one of them was wrong:

1. it looked for `#[tauri::command]`, and this repository writes `#[command]` after `use tauri::command`;
2. it looked for `invoke("name")`, and every call goes through `callBackend("name", ...)`;
3. its `callBackend<...>` pattern stopped at the first `>`, so a nested generic
   (`callBackend<Record<string, unknown> | null>("get_preferences", ...)`) read as no call at all.

A reader that finds nothing reports every command as dead, which is the loudest possible way to say nothing at
all. So `test_the_reader_can_see_a_live_command` and `test_the_reader_can_see_a_registered_command` run first:
until the reader is shown to find something, its silence means nothing.
"""

import re

from conftest import REPO

RUST = REPO / "apps" / "desktop" / "src-tauri" / "src"
FRONTEND = REPO / "apps" / "desktop" / "src"
LIB_RS = RUST / "lib.rs"

#: The layer between the window and the backend. Every command name lives in one of these files, inside an
#: exported function that the rest of the app calls. A name that reaches no further than this folder is a command
#: the app can make, and never does.
API_LAYER = ("apps/desktop/src/lib/api/", "apps/desktop/src/lib/api.ts")

#: An exported function of the API layer: `export function x`, `export async function x`, or `export const x =`.
API_FUNCTION = re.compile(r"^export\s+(?:async\s+)?(?:function|const)\s+(\w+)", re.M)

#: A command function, however many other attributes or `#[cfg]` lines sit between the attribute and the `fn`.
COMMAND_ATTR = re.compile(r"#\[(?:tauri::)?command[^\]]*\]\s*(?:#\[[^\]]*\]\s*)*pub\s+(?:async\s+)?fn\s+(\w+)")

#: One command every reader must be able to see. It is the app's search, so it cannot quietly go away: if it does,
#: this test fails and says to pick another, which is cheaper than a reader that has gone blind in silence.
A_LIVE_COMMAND = "search_vault"


def rust_files() -> list:
    return sorted(RUST.rglob("*.rs"))


def frontend_files() -> list:
    """Real app code only.

    The browser stand-in under `lib/api/dev/` answers for the backend when there is no backend, so it names
    commands the app may no longer use. A test file names whatever it tests. Neither is the app asking the
    backend for something, so neither may keep a command alive.
    """
    return sorted(
        path for path in FRONTEND.rglob("*.ts*") if ".test." not in path.name and "/api/dev/" not in path.as_posix()
    )


def defined_commands() -> dict[str, str]:
    """Every `#[command]` function in the backend, and the file it is in."""
    found = {}
    for path in rust_files():
        for match in COMMAND_ATTR.finditer(path.read_text(encoding="utf-8")):
            found[match.group(1)] = path.relative_to(REPO).as_posix()
    return found


def registered_commands() -> set[str]:
    """Every name inside `generate_handler![...]` in `lib.rs`."""
    block = re.search(r"generate_handler!\[(.*?)\]", LIB_RS.read_text(encoding="utf-8"), re.S)
    assert block, "lib.rs has no generate_handler![...] block, so no command is registered at all"
    return set(re.findall(r"\w+", block.group(1)))


def files_naming(command: str) -> list[str]:
    """The real frontend files that hold the command's name in quotes.

    It looks for the quoted name, not for a call, because the call syntax is what the first three readers each
    got wrong. A name in quotes is what Tauri sends over the wire, whatever wraps it.
    """
    quoted = re.compile(r"""["'`]""" + re.escape(command) + r"""["'`]""")
    return [
        path.relative_to(REPO).as_posix()
        for path in frontend_files()
        if quoted.search(path.read_text(encoding="utf-8"))
    ]


def in_api_layer(path) -> bool:
    where = path.relative_to(REPO).as_posix()
    return where.startswith(API_LAYER[0]) or where == API_LAYER[1]


def api_function_for(command: str) -> tuple[str, str] | None:
    """The exported API function whose body holds this command's name, and the file it is in.

    It cuts each file at every `export`, so a function reaches from its own line to the next export. That is a
    rough cut, not a parser, and a cut that reaches too far can only tie a command to the wrong neighbouring
    function, never invent a caller for it.
    """
    quoted = re.compile(r"""["'`]""" + re.escape(command) + r"""["'`]""")
    for path in frontend_files():
        if not in_api_layer(path):
            continue
        text = path.read_text(encoding="utf-8")
        starts = [(match.group(1), match.start()) for match in API_FUNCTION.finditer(text)]
        for index, (name, start) in enumerate(starts):
            end = starts[index + 1][1] if index + 1 < len(starts) else len(text)
            if quoted.search(text[start:end]):
                return name, path.relative_to(REPO).as_posix()
    return None


def screens_using(api_function: str) -> list[str]:
    """Files outside the API layer that name this API function: components, hooks and the rest of `lib`."""
    word = re.compile(r"\b" + re.escape(api_function) + r"\b")
    return [
        path.relative_to(REPO).as_posix()
        for path in frontend_files()
        if not in_api_layer(path) and word.search(path.read_text(encoding="utf-8"))
    ]


def test_the_reader_can_see_a_live_command():
    """The reader must find a command that is certainly there, before its silence about others means anything."""
    defined = defined_commands()

    assert len(defined) > 20, f"the backend has more than 20 commands; this reader found {len(defined)}"
    assert A_LIVE_COMMAND in defined, (
        f"the reader cannot see {A_LIVE_COMMAND}, which is the app's search. Either the attribute or the function "
        f"is written a way this reader does not match, or the command was renamed and this test needs a new one."
    )


def test_the_reader_can_see_a_registered_command():
    """Same for the other two halves: registration, and a frontend file that asks for it."""
    assert A_LIVE_COMMAND in registered_commands(), f"{A_LIVE_COMMAND} must be in generate_handler![...]"

    asks = files_naming(A_LIVE_COMMAND)
    assert asks, (
        f"no frontend file names {A_LIVE_COMMAND!r}. The frontend reader is blind, so every 'nothing asks for "
        f"this' answer below would be false."
    )


def test_every_command_is_registered():
    """A command the app can never call is dead code that still has to be kept working."""
    defined = defined_commands()
    unreachable = sorted(set(defined) - registered_commands())

    assert not unreachable, (
        "these commands carry #[command] but are not in generate_handler![...] in lib.rs, so the app can never "
        "call them. Register each one, or delete it:\n"
        + "\n".join(f"  {name}  in {defined[name]}" for name in unreachable)
    )


def test_every_registered_command_is_defined():
    """A registered name with no function does not compile, so this only ever catches a half-finished delete."""
    missing = sorted(registered_commands() - set(defined_commands()))

    assert not missing, "generate_handler![...] names commands that no #[command] function defines: " + ", ".join(
        missing
    )


def test_something_on_screen_asks_for_every_registered_command():
    """A command nothing asks for is dead, however correct it is."""
    nobody_asks = sorted(name for name in registered_commands() if not files_naming(name))

    assert not nobody_asks, (
        "these commands are registered, but no real frontend file names them, so nothing in the app ever asks "
        "for them. Wire each one to something on screen, or delete it:\n"
        + "\n".join(f"  {name}" for name in nobody_asks)
    )


def test_the_reader_can_follow_a_command_out_to_a_screen():
    """The two-layer reader must trace one command all the way, before its silence about others means anything.

    Without this, a rename inside the API layer would make every command look unused, and the test below would
    demand the whole backend be deleted.
    """
    wrapper = api_function_for(A_LIVE_COMMAND)

    assert wrapper, f"no API function holds {A_LIVE_COMMAND!r}; the API-layer reader cannot see"
    name, _ = wrapper
    assert screens_using(name), (
        f"nothing outside the API layer names {name}(), which is the app's search. The screen reader cannot see."
    )


def test_every_command_reaches_something_outside_the_api_layer():
    """A command wrapped by an API function that nothing calls is still dead.

    This is the layer the review named "registered but never called by any component". The test above it cannot
    see it: the API function holds the command's name, so the command looks asked-for, and the file that would
    have called that function was deleted with the feature.
    """
    stops_at_the_api = []
    for command in sorted(registered_commands()):
        wrapper = api_function_for(command)
        if wrapper and not screens_using(wrapper[0]):
            stops_at_the_api.append(f"  {command}  wrapped by {wrapper[0]}() in {wrapper[1]}")

    assert not stops_at_the_api, (
        "these commands have an API function, but nothing outside the API layer calls it, so no screen ever asks "
        "for them. Wire each one to something on screen, or delete the command and its API function:\n"
        + "\n".join(stops_at_the_api)
    )


def test_the_browser_stand_in_does_not_keep_a_command_alive():
    """`lib/api/dev/` answers instead of the backend, so a name only it holds is not a live command.

    This is the reason `frontend_files()` leaves that folder out. Without it, a stand-in that was never cleaned up
    would report a deleted feature as live for ever, and `fallbackBooks.ts` really does name four commands.

    The first version of this test compared absolute paths against the relative ones `files_naming` returns, so the
    two could never be equal and the test could never fail. A mutation run found it: deleting the filter it guards
    changed nothing here.
    """
    stand_in = REPO / "apps" / "desktop" / "src" / "lib" / "api" / "dev"
    assert stand_in.is_dir(), f"the browser stand-in moved; {stand_in} is not there any more"

    inside = {path.relative_to(REPO).as_posix() for path in stand_in.rglob("*.ts")}
    assert inside, "the browser stand-in has no files, so this test is watching an empty folder"

    names_a_command = {where for command in registered_commands() for where in files_naming(command) if where in inside}
    assert not names_a_command, (
        "these browser stand-in files reached the list of files that ask the backend for a command, so a command "
        "the app no longer uses would still read as live: " + ", ".join(sorted(names_a_command))
    )
