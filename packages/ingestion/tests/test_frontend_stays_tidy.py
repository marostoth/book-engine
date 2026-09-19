"""The app window keeps its hygiene: no `any`, checked data, the public Tauri door, one flag per setting (RD-09).

Six things made the frontend hard to change safely:

1. 14 `as any` casts. Four more read backend fields that nothing writes.
2. Nothing checked a backend answer or a `JSON.parse` result, so a damaged file failed far from its cause.
3. `lib/api.ts` reached into `window.__TAURI_INTERNALS__`, Tauri's own private object.
4. Bionic Reading had two flags. The button wrote one, the switch in Settings wrote the other, and nothing read the
   saved one back, so the app always started with Bionic off.
5. Four declared dependencies were never imported.
6. `App.tsx` passed 29 props to `TopNav`, 24 to `Reader` and 26 to `AppModals`.

This file is the guard. A reader that finds nothing looks the same as a repository with no faults, so every reader
here is checked against a case whose answer is known. Three of the readers below had a fault of their own first:

* A reader that looked only for `from "..."` called `@tauri-apps/api` unused, because `lib/api/clientBase.ts` reaches
  it through `await import("@tauri-apps/api/core")`, at the moment it is needed. Lazy imports count.
* Every reader that says "the app must not do X" first failed on the comments that explain what was taken away. A
  comment naming `concept_clusters` looks exactly like code reading it, so the readers strip comments first.
* The props guard first counted a hook's argument and a data type as props of a component. It reads only
  `interface <name>Props` inside `components/` now.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
APP = REPO / "apps" / "desktop"
SRC = APP / "src"
VAULT = REPO / "vault"

# The private object of the Tauri shell. Only the one file that asks "am I inside the app?" may name it.
PRIVATE_DOOR = "__TAURI_INTERNALS__"
MAY_NAME_THE_PRIVATE_DOOR = {"lib/api/clientBase.ts"}

# What was measured on 2026-09-19, and the most each may be. A number here may go down, never up.
#
# Each number is the count this guard prints today, never an estimate. A limit of 20 for TopNav, which really
# has 19, left room for one more prop, and a mutation that added one was not caught.
MOST_PROPS = {
    "components/TopNav.tsx": ("TopNavProps", 19),
    "components/Reader.tsx": ("ReaderProps", 21),
    "components/AppModals.tsx": ("AppModalsProps", 22),
}

# Field names that used to be read as a fallback, under the belief that an older import had written them. None is
# written by the Rust backend, by the Python import, or held in the vault.
NAMES_NOTHING_WRITES = [
    "concept_clusters",
    "opening_summary",
    "head_sample",
    "closing_summary",
    "tail_sample",
]


def sources(with_tests: bool = False) -> list[Path]:
    """Every TypeScript file of the app window.

    The path compared is the one under `src`, never the whole path: the repository itself lives in `C:/dev`, so a
    search for `/dev/` in the whole path throws away every file of the app and the reader goes blind.
    """
    found = [*SRC.rglob("*.ts"), *SRC.rglob("*.tsx")]
    if not with_tests:
        found = [path for path in found if ".test." not in path.name]
    return sorted(found)


def under_src(path: Path) -> str:
    return path.relative_to(SRC).as_posix()


def app_code() -> list[Path]:
    """The real code of the app: no tests, and not the browser stand-in of `lib/api/dev/`."""
    return [path for path in sources() if not under_src(path).startswith("lib/api/dev/")]


def without_comments(text: str) -> str:
    """The same text with every comment blanked out, and every line number kept.

    A guard that says "the app must not do X" has to read code, not prose. Every reader here first failed on the
    comments that explain what was taken away.

    The quote state is tracked, so the `//` inside "https://..." is not read as the start of a comment. A stripper
    without that cuts every URL of the app in half.
    """
    out: list[str] = []
    index = 0
    quote = ""
    while index < len(text):
        character = text[index]
        if quote:
            out.append(character)
            if character == "\\" and index + 1 < len(text):
                out.append(text[index + 1])
                index += 2
                continue
            if character == quote:
                quote = ""
            index += 1
            continue
        if character in "\"'`":
            quote = character
            out.append(character)
            index += 1
            continue
        if text.startswith("//", index):
            end = text.find("\n", index)
            end = len(text) if end == -1 else end
            out.append(" " * (end - index))
            index = end
            continue
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            end = len(text) if end == -1 else end + 2
            out.append("".join("\n" if c == "\n" else " " for c in text[index:end]))
            index = end
            continue
        out.append(character)
        index += 1
    return "".join(out)


def where(pattern: re.Pattern[str], paths: list[Path]) -> list[str]:
    """Every place a pattern matches in code, as `file:line  the line`. Comments do not count."""
    found = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        shown = text.splitlines()
        for number, line in enumerate(without_comments(text).splitlines(), 1):
            if pattern.search(line):
                found.append(f"{under_src(path)}:{number}  {shown[number - 1].strip()[:100]}")
    return found


# ---------------------------------------------------------------- the reader can see

def test_the_reader_sees_the_app():
    found = sources()
    assert len(found) > 100, f"only {len(found)} source files found, so every count in this file is worthless"
    names = {under_src(path) for path in found}
    for must in ("App.tsx", "lib/api.ts", "components/TopNav.tsx", "hooks/useSettings.ts", "lib/backendShapes.ts"):
        assert must in names, f"{must} is missing from the list, so the reader is blind"
    assert not [name for name in names if ".test." in name], "a test file got into the list of real code"
    with_tests = {under_src(path) for path in sources(with_tests=True)}
    assert [name for name in with_tests if ".test." in name], "tests do not appear even when they are asked for"


def test_the_reader_finds_a_fault_it_is_shown():
    """The `as any` reader must catch one that is put in front of it, or a clean result means nothing."""
    pattern = re.compile(r"\bas\s+any\b")
    assert pattern.search("const x = value as any;"), "the reader cannot see an `as any` it is handed"
    assert not pattern.search("const x = value as unknown;"), "the reader sees one that is not there"


def test_the_comment_stripper_keeps_code_and_drops_prose():
    code = 'const url = "https://a.test/x"; // as any\n/* as any */\nconst y = 1 as any;\n'
    stripped = without_comments(code)
    assert '"https://a.test/x"' in stripped, "the stripper cut a URL in half at its //"
    assert stripped.count("as any") == 1, "a comment naming a fault must not be read as the fault"
    assert len(stripped.splitlines()) == len(code.splitlines()), "every line number must still match the file"


# ---------------------------------------------------------------- 1: no `any`

def test_no_file_of_the_app_turns_the_type_check_off():
    found = where(re.compile(r"\bas\s+any\b|:\s*any\b|<any>|\bany\[\]"), sources(with_tests=True))
    assert not found, "an `any` switches the type check off for everything it touches:\n" + "\n".join(found)


def test_no_file_of_the_app_casts_through_unknown():
    """`as unknown as T` is the same escape hatch with more words. Four of these read fields nothing writes."""
    found = where(re.compile(r"\bas\s+unknown\s+as\b"), app_code())
    assert not found, "\n".join(found)


def test_the_linter_forbids_any():
    config = (APP / "eslint.config.js").read_text(encoding="utf-8")
    assert '"@typescript-eslint/no-explicit-any": "error"' in config, (
        "the count is zero today only because somebody counted. The linter must keep it there."
    )


def test_no_field_name_is_read_that_nothing_writes():
    for name in NAMES_NOTHING_WRITES:
        found = where(re.compile(re.escape(name)), app_code())
        assert not found, f"{name} is read by the app but written by nothing:\n" + "\n".join(found)


# ---------------------------------------------------------------- 2: what comes in is checked

def test_the_book_file_is_checked_before_the_app_believes_it():
    api = without_comments((SRC / "lib" / "api.ts").read_text(encoding="utf-8"))
    assert "bookMetaFrom(json, bookId)" in api, "the text of a book file must be checked, not cast"
    assert "JSON.parse" not in api, "a bare JSON.parse in api.ts sends an unchecked object to the reader"


def test_saved_highlights_are_checked_before_they_are_drawn():
    for file in ("lib/api/highlightsApi.ts", "lib/highlights.ts"):
        text = without_comments((SRC / file).read_text(encoding="utf-8"))
        assert "highlightsFrom(" in text, f"{file} must drop a damaged highlight and keep the rest"


def test_the_checks_have_tests_of_their_own():
    tests = (SRC / "lib" / "backendShapes.test.ts").read_text(encoding="utf-8")
    assert "with no spine is refused" in tests, "the check for a book with no chapters needs a test"
    assert "damaged highlight is dropped" in tests, "the check that keeps the good highlights needs a test"


@pytest.mark.skipif(not (VAULT / "books").is_dir(), reason="no vault on this machine")
def test_every_real_book_passes_the_check_the_app_now_makes():
    """The check must not shut the reader out of their own books.

    This reads the vault of this machine. A fresh clone has none, and the test is skipped there.
    """
    metas = sorted((VAULT / "books").rglob("_meta.json"))
    assert metas, "the vault has books but no _meta.json, so this test proves nothing"
    for meta in metas:
        book = json.loads(meta.read_text(encoding="utf-8-sig"))
        name = meta.parent.name
        assert isinstance(book.get("book_id"), str), f"{name}: no book_id, and the app would now refuse it"
        assert isinstance(book.get("title"), str), f"{name}: no title"
        assert isinstance(book.get("spine"), list) and book["spine"], f"{name}: no chapters"
        for index, chapter in enumerate(book["spine"], 1):
            for field in ("id", "title", "file_path"):
                assert isinstance(chapter.get(field), str), f"{name}: chapter {index} has no {field}"


# ---------------------------------------------------------------- 3: the public Tauri door

def test_only_one_file_names_the_private_tauri_object():
    named = {
        under_src(path)
        for path in app_code()
        if PRIVATE_DOOR in without_comments(path.read_text(encoding="utf-8"))
    }
    extra = named - MAY_NAME_THE_PRIVATE_DOOR
    assert not extra, (
        f"{sorted(extra)} reach into Tauri's private object. It is in no promise Tauri makes, so an update can "
        "rename it and the app breaks with no error. Use the public functions of `@tauri-apps/api`."
    )


def test_the_one_file_that_names_it_only_asks_whether_it_is_inside_the_app():
    text = without_comments((SRC / "lib" / "api" / "clientBase.ts").read_text(encoding="utf-8"))
    for line in text.splitlines():
        if PRIVATE_DOOR in line:
            assert f'"{PRIVATE_DOOR}" in window' in line, (
                f"clientBase.ts may only test for the name, never call through it: {line.strip()}"
            )


def test_the_app_calls_the_public_door_for_a_book_picture():
    api = without_comments((SRC / "lib" / "api.ts").read_text(encoding="utf-8"))
    assert 'from "@tauri-apps/api/core"' in api, "the public `convertFileSrc` must come from the package"
    assert "convertFileSrc(fullPath" in api, "the public function must be the one that is called"


# ---------------------------------------------------------------- 4: one flag per setting

def test_bionic_reading_is_one_saved_setting():
    hook = without_comments((SRC / "hooks" / "useSettings.ts").read_text(encoding="utf-8"))
    assert "bionicFixationEnabled" in hook, "the one place that reads the saved setting is `useSettings.ts`"
    app = without_comments((SRC / "App.tsx").read_text(encoding="utf-8"))
    assert "setIsBionic" not in app, (
        "App.tsx held a second Bionic flag in memory. The button wrote that one and the app forgot it on restart."
    )
    for file in ("components/TopNav.tsx", "components/Reader.tsx", "components/settings/ElementaryTab.tsx"):
        text = without_comments((SRC / file).read_text(encoding="utf-8"))
        assert "useBionic()" in text or "bionicOn(" in text, f"{file} must read the one saved setting"


def test_the_saved_bionic_setting_is_read_and_not_only_written():
    """The fault was exactly this: `bionicFixationEnabled` was written by one screen and read by nobody."""
    readers = [
        line
        for line in where(re.compile(r"bionicFixationEnabled"), app_code())
        if "useSettings.ts" in line or "preferences.ts" in line or "types.ts" in line
    ]
    assert readers, "nothing reads the saved Bionic setting, so turning it on does nothing"


def test_bionic_has_a_test_that_proves_a_restart_remembers_it():
    tests = (SRC / "hooks" / "useSettings.test.tsx").read_text(encoding="utf-8")
    assert "so a restart remembers it" in tests


# ---------------------------------------------------------------- 5: dependencies

IMPORTS = [
    re.compile(r"""(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']"""),
    re.compile(r"""(?:^|\n)\s*import\s+["']([^"']+)["']"""),
    # `clientBase.ts` reaches the Tauri API only this way. A reader that misses this shape calls it unused.
    re.compile(r"""\bimport\(\s*["']([^"']+)["']\s*\)"""),
    re.compile(r"""\brequire\(\s*["']([^"']+)["']\s*\)"""),
]
CONFIG_FILES = ("vite.config.ts", "eslint.config.js", "tailwind.config.js", "postcss.config.js")


def package_of(specifier: str) -> str | None:
    """The npm package a specifier names, or None when it points inside this app."""
    if specifier.startswith((".", "/", "@/", "~")):
        return None
    parts = specifier.split("/")
    return "/".join(parts[:2]) if specifier.startswith("@") else parts[0]


def packages_used() -> dict[str, set[str]]:
    used: dict[str, set[str]] = {}
    texts = [(under_src(path), path.read_text(encoding="utf-8")) for path in sources(with_tests=True)]
    for name in CONFIG_FILES:
        config = APP / name
        if config.exists():
            texts.append((name, config.read_text(encoding="utf-8")))
    for name, text in texts:
        code = without_comments(text)
        for pattern in IMPORTS:
            for match in pattern.finditer(code):
                package = package_of(match.group(1))
                if package:
                    used.setdefault(package, set()).add(name)
    return used


def test_the_package_reader_sees_a_lazy_import():
    used = packages_used()
    assert "@tauri-apps/api" in used, (
        "`clientBase.ts` loads the Tauri API with `await import(...)`. A reader that misses that shape calls the "
        "package unused and asks for it to be removed."
    )
    assert "react" in used and "@tiptap/react" in used, "the reader cannot see the packages the app is built on"


def test_every_declared_dependency_is_imported_somewhere():
    manifest = json.loads((APP / "package.json").read_text(encoding="utf-8"))
    used = packages_used()
    unused = sorted(name for name in manifest["dependencies"] if name not in used)
    assert not unused, f"declared and imported nowhere: {unused}"


def test_every_imported_package_is_declared():
    manifest = json.loads((APP / "package.json").read_text(encoding="utf-8"))
    declared = set(manifest["dependencies"]) | set(manifest["devDependencies"])
    missing = sorted(name for name in packages_used() if name not in declared and not name.startswith("node:"))
    assert not missing, f"imported but not declared, so a fresh clone may not build: {missing}"


# ---------------------------------------------------------------- 6: prop drilling

def props_of(path: Path, interface: str) -> int:
    """How many properties a props interface declares, counting a name at the top level only."""
    text = without_comments(path.read_text(encoding="utf-8"))
    start = text.find(f"interface {interface}")
    assert start != -1, f"{interface} is not in {path.name}, so nothing is counted"
    index = text.find("{", start)
    depth = 0
    count = 0
    while index < len(text):
        character = text[index]
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return count
        elif depth == 1 and re.match(r"[A-Za-z_][\w]*\??\s*:", text[index:]):
            line_start = text.rfind("\n", 0, index) + 1
            if not text[line_start:index].strip():
                count += 1
        index += 1
    raise AssertionError(f"{interface} in {path.name} never closes")


def component_props_blocks() -> list[tuple[str, str]]:
    """Every `interface <name>Props { ... }` of every component, as (where it is, the text inside the braces).

    A hook that takes the settings as an argument is not prop drilling, and neither is a data type that holds them.
    `useElementaryMechanics` and `lib/preferences.ts` both failed the first version of this guard for that reason.
    """
    blocks = []
    for path in app_code():
        if not under_src(path).startswith("components/"):
            continue
        text = without_comments(path.read_text(encoding="utf-8"))
        for match in re.finditer(r"interface\s+(\w*Props)\s*\{", text):
            start = text.index("{", match.start())
            depth = 0
            for index in range(start, len(text)):
                if text[index] == "{":
                    depth += 1
                elif text[index] == "}":
                    depth -= 1
                    if depth == 0:
                        blocks.append((f"{under_src(path)} {match.group(1)}", text[start : index + 1]))
                        break
    return blocks


def test_the_prop_counter_counts_only_the_top_level():
    """`AppModalsProps` holds `analyticalSession`, an object with 17 fields of its own. Those are not props."""
    count = props_of(SRC / "components" / "AppModals.tsx", "AppModalsProps")
    assert 10 < count < 30, f"the counter gave {count}, which means it is counting the wrong thing"


def test_the_props_reader_finds_the_props_of_components():
    names = [name for name, _ in component_props_blocks()]
    assert len(names) > 20, f"only {len(names)} props interfaces found, so this guard sees almost nothing"
    assert any("TopNavProps" in name for name in names), "TopNavProps is missing, so the reader is blind"


def test_no_component_takes_more_props_than_it_did_on_the_day_this_was_measured():
    too_many = []
    for file, (interface, most) in MOST_PROPS.items():
        count = props_of(SRC / file, interface)
        if count > most:
            too_many.append(f"{interface}: {count} props, and {most} is the most it had")
    assert not too_many, (
        "these numbers may go down, never up. A new prop here means `App.tsx` and every component on the way must "
        "change as well:\n" + "\n".join(too_many)
    )


def test_the_settings_are_not_passed_as_props_any_more():
    found = [
        name
        for name, body in component_props_blocks()
        if re.search(r"\bpreferences\??:\s*ReaderPreferences\b", body)
    ]
    assert not found, (
        "the settings travel through a context now (`hooks/useSettings.ts`). A component that takes them as a prop "
        "puts them back on every component between it and `App.tsx`:\n" + "\n".join(found)
    )


def test_the_settings_context_keeps_its_value_still():
    """A value built fresh on each render draws the chapter again on every scroll, and undoes RD-06."""
    hook = (SRC / "hooks" / "useSettings.ts").read_text(encoding="utf-8")
    assert "useMemo(() => ({ settings, change }), [settings, change])" in hook
    tests = (SRC / "hooks" / "useSettings.test.tsx").read_text(encoding="utf-8")
    assert "does not draw the reader again" in tests, "that guard needs a test, or the next edit can drop the useMemo"
