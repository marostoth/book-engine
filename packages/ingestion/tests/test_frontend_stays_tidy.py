"""The app window keeps its hygiene: no `any`, checked data, the public Tauri door, one flag per setting (RD-09).

Seven things made the frontend hard to change safely:

1. 14 `as any` casts. Four more read backend fields that nothing writes.
2. Nothing checked a backend answer or a `JSON.parse` result, so a damaged file failed far from its cause.
3. `lib/api.ts` reached into `window.__TAURI_INTERNALS__`, Tauri's own private object.
4. Bionic Reading had two flags. The button wrote one, the switch in Settings wrote the other, and nothing read the
   saved one back, so the app always started with Bionic off.
5. Four declared dependencies were never imported.
6. `App.tsx` passed 29 props to `TopNav`, 24 to `Reader` and 26 to `AppModals`.
7. One test built a new date formatter for each of the 360 cells of the review heatmap. It took 66 ms, about 60 times
   the next slowest test of its file, and 7778 ms on a cold CI runner, where it went past vitest's 5000 ms default and
   read as a broken test (TL-12).

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

# Every call that builds a date or number formatter. `toLocaleDateString` and its family build a new
# `Intl.DateTimeFormat` on each call, and the first one of a process also starts the locale data up.
FORMATS_A_DATE = re.compile(
    r"\btoLocale(?:Date|Time)?String\b|\bIntl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)\b"
)

# What was measured on 2026-09-19, and the most calls each test file may hold. A number here may go down, never up.
#
# A test file is counted, not the app. One call sat in a helper the row check of the heatmap called for each of its 360
# cells, so one test built 360 formatters: 66 ms, about 60 times the next slowest test of that file, and 7778 ms on a
# cold CI runner, where it went past vitest's 5000 ms default and read as a broken test (TL-12). Measured here: 360
# calls cost 34.2 ms, 360 `getDay()` reads cost 0.2 ms, and both give the same names.
#
# The one call left is the test of the date the reader is shown, which is what that test is about. It runs five times,
# and it pays the one-time locale start-up of about 30 ms that no test of `Intl` can avoid. A second call in this file
# is what the fault looked like, so the number stays at 1: a new one has to be measured and written here on purpose.
MOST_DATE_FORMATS_IN_A_TEST = {
    "lib/reviewDays.test.ts": 1,
}


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
    # The list a save writes over the file is refused whole, so no save erases a dropped entry (TL-14). The old
    # comment in a notes file is only read, so it drops a damaged entry and keeps the rest (RD-09).
    for file, check in (
        ("lib/api/highlightsApi.ts", " highlightsFrom("),
        ("lib/highlights.ts", "readableHighlightsFrom("),
    ):
        text = without_comments((SRC / file).read_text(encoding="utf-8"))
        assert check in text, f"{file} must check its highlights with{check}"


def test_the_checks_have_tests_of_their_own():
    tests = (SRC / "lib" / "backendShapes.test.ts").read_text(encoding="utf-8")
    assert "with no spine is refused" in tests, "the check for a book with no chapters needs a test"
    assert "damaged highlight rejects the list" in tests, "the check that refuses a damaged list needs a test"
    assert "drops a damaged highlight" in tests, "the check that keeps the good highlights needs a test"
    assert "damaged word is dropped" in tests, "the check that keeps the good saved words needs a test"


def check_book(meta: Path) -> None:
    """Holds one real `_meta.json` to the check the app now makes, and names the book when it fails."""
    book = json.loads(meta.read_text(encoding="utf-8-sig"))
    name = meta.parent.name
    assert isinstance(book.get("book_id"), str), f"{name}: no book_id, and the app would now refuse it"
    assert isinstance(book.get("title"), str), f"{name}: no title"
    assert isinstance(book.get("spine"), list) and book["spine"], f"{name}: no chapters"
    for index, chapter in enumerate(book["spine"], 1):
        for field in ("id", "title", "file_path"):
            assert isinstance(chapter.get(field), str), f"{name}: chapter {index} has no {field}"


def test_the_book_check_of_this_test_can_pass_and_can_fail(tmp_path: Path):
    """The sight check for the test below, which has no book to read on a fresh clone or in CI.

    `vault/books/.gitkeep` is in the repository, so that folder is on every machine and its being there proves
    nothing. Without this test, a `check_book` that had stopped checking would look exactly like a machine
    with no books in it.
    """
    whole = {"book_id": "a-book", "title": "A Book", "spine": [{"id": "ch-01", "title": "One", "file_path": "a.md"}]}

    good = tmp_path / "a-book" / "_meta.json"
    good.parent.mkdir(parents=True)
    good.write_text(json.dumps(whole), encoding="utf-8")
    check_book(good)

    broken = tmp_path / "no-chapters" / "_meta.json"
    broken.parent.mkdir(parents=True)
    broken.write_text(json.dumps({**whole, "spine": []}), encoding="utf-8")
    with pytest.raises(AssertionError, match="no-chapters: no chapters"):
        check_book(broken)


def test_every_real_book_passes_the_check_the_app_now_makes():
    """The check must not shut the reader out of their own books. `test_vault_of_the_tests.py` names this test (TL-19).

    This reads the vault of this machine. It skips on the books, not on the folder: a fresh clone and CI both
    have `vault/books`, because `.gitkeep` is in it, and neither has a book inside.
    """
    metas = sorted((VAULT / "books").rglob("_meta.json"))
    if not metas:
        pytest.skip("no book in the vault of this machine, so there is no real book to hold the check to")
    for meta in metas:
        check_book(meta)


# ---------------------------------------------------------------- 3: the public Tauri door


def test_only_one_file_names_the_private_tauri_object():
    named = {
        under_src(path) for path in app_code() if PRIVATE_DOOR in without_comments(path.read_text(encoding="utf-8"))
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
        name for name, body in component_props_blocks() if re.search(r"\bpreferences\??:\s*ReaderPreferences\b", body)
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


# ---------------------------------------------------------------- 7: a test is not slow for nothing


def test_the_date_format_reader_finds_a_call_it_is_shown():
    """The reader must catch a formatter it is handed, or a clean count means nothing."""
    assert FORMATS_A_DATE.search('day.toLocaleDateString("en-GB", { weekday: "short" })'), "a plain call is missed"
    assert FORMATS_A_DATE.search("new Intl.DateTimeFormat(locale)"), "a formatter built by hand is missed"
    assert FORMATS_A_DATE.search("total.toLocaleString()"), "toLocaleString builds one as well"
    assert not FORMATS_A_DATE.search("startOfLocalDay(day).getDay()"), "the reader sees a call that is not there"


def test_no_test_file_builds_more_date_formatters_than_it_did_on_the_day_this_was_measured():
    tests = [path for path in sources(with_tests=True) if ".test." in path.name]
    assert len(tests) > 20, f"only {len(tests)} test files found, so this guard sees almost nothing"
    counted: dict[str, list[str]] = {}
    for line in where(FORMATS_A_DATE, tests):
        counted.setdefault(line.split(":", 1)[0], []).append(line)
    too_many = [
        f"{name}: {len(lines)} calls, and {MOST_DATE_FORMATS_IN_A_TEST.get(name, 0)} is the most it had\n"
        + "\n".join("    " + line for line in lines)
        for name, lines in sorted(counted.items())
        if len(lines) > MOST_DATE_FORMATS_IN_A_TEST.get(name, 0)
    ]
    assert not too_many, (
        "a locale formatter is built on every call, so a test that builds one for each item of a list can time out on "
        "CI with nothing wrong with it. Read the day number against a list of names instead, or measure the new call "
        "and write its number in MOST_DATE_FORMATS_IN_A_TEST on purpose:\n" + "\n".join(too_many)
    )


# ---------------------------------------------------------------- 8: the bytes of a source file

#: Tab, newline and carriage return. Every other byte below a space is a control character that does not belong in
#: source, and git reads a file holding one as binary.
ALLOWED_CONTROL_BYTES = {0x09, 0x0A, 0x0D}


def control_bytes_in(raw: bytes) -> list[int]:
    """Every control byte of a file that is not tab, newline or carriage return, once each, in order."""
    return sorted({byte for byte in raw if byte < 0x20 and byte not in ALLOWED_CONTROL_BYTES})


def test_no_source_file_of_the_app_holds_a_byte_that_makes_git_call_it_binary():
    r"""A control character written into source turns the file into a blob: no diff, no review, no blame.

    `lib/formStart.ts` was written with a real NUL character in a string literal, where the six-character escape for it means
    the same thing at run time. It behaved identically and all 406 frontend tests passed, so nothing found it
    except one word of `git diff --stat`: `Bin`. A reviewer would have been shown 11,014 bytes and no lines.
    """
    found = [
        f"{under_src(path)}: " + ", ".join(f"0x{byte:02x}" for byte in odd)
        for path in sources(with_tests=True)
        if (odd := control_bytes_in(path.read_bytes()))
    ]
    assert not found, (
        "these files hold a control character in their bytes, so git reads them as binary and a change to one "
        "shows as a size and nothing else. Write the escape instead of the character:\n" + "\n".join(found)
    )


def test_the_byte_reader_can_see_a_control_character():
    """Without this, the test above would pass on a list of files it never read, and nobody would know."""
    escaped = ('const BETWEEN_PARTS = "' + chr(92) + 'u0000";').encode("utf-8")
    real_nul = ('const BETWEEN_PARTS = "' + chr(0) + '";').encode("utf-8")

    assert control_bytes_in(escaped) == [], "the escape is ordinary source and must read as clean"
    assert control_bytes_in(escaped + b"\r\n\t") == [], "a tab and a Windows line ending are allowed"
    assert control_bytes_in(real_nul) == [0x00], "a real NUL is the fault this catches, and it was not seen"
    assert len(sources(with_tests=True)) > 100, "the test above read almost no files"


# ---------------------------------------------------------------- 9: a rule that is switched off

#: Every line that switches an ESLint rule off, on 2026-09-20, when TL-11 made all five React rules errors. This
#: number may go DOWN, never up. A rule is switched off only where the rule is wrong about that one line, and a
#: line that switches one off is a line nothing checks any more unless something else does.
MOST_RULES_SWITCHED_OFF = 4

#: What a line that switches a rule off must look like: the rule by name, then ` -- ` and a reason.
#:
#: The directive has to come straight after the `//` or `/*`, which is the only place ESLint itself reads one.
#: Without that, this reader finds every COMMENT that merely names the directive, and the write-up of the three
#: exceptions in `lib/nothingIsReadWhileDrawing.test.ts` counted as a fourth exception.
SWITCHED_OFF = re.compile(r"(?://|/\*)\s*eslint-disable(?:-next-line|-line)?\s*(?P<rest>[^\r\n]*)")


def rules_switched_off() -> list[tuple[str, str]]:
    """Every `(file:line, the text after eslint-disable)` in the app window, tests included."""
    found: list[tuple[str, str]] = []
    for path in sources(with_tests=True):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if (hit := SWITCHED_OFF.search(line)) is not None:
                found.append((f"{under_src(path)}:{number}", hit.group("rest").strip()))
    return found


def test_a_rule_that_is_switched_off_names_the_rule_and_says_why():
    """A bare `eslint-disable` switches EVERY rule off for that line, and says nothing about why."""
    nameless = [where for where, rest in rules_switched_off() if not rest.split(" --")[0].strip()]
    assert not nameless, (
        "these lines switch every rule off at once, which hides faults nobody was thinking about. Name the one "
        "rule: `eslint-disable-next-line the-rule -- why`:\n" + "\n".join(nameless)
    )
    reasonless = [f"{where}: {rest}" for where, rest in rules_switched_off() if " -- " not in f"{rest} "]
    assert not reasonless, (
        "these lines switch a rule off and do not say why. A reader cannot tell a measured exception from a "
        "silenced fault, so every one carries ` -- ` and the reason:\n" + "\n".join(reasonless)
    )


def test_the_number_of_rules_switched_off_only_goes_down():
    """Each of these is a line the linter no longer reads. Four is the most there have ever been."""
    found = rules_switched_off()
    assert len(found) <= MOST_RULES_SWITCHED_OFF, (
        f"{len(found)} lines switch a rule off, and {MOST_RULES_SWITCHED_OFF} is the most there have been. Fix the "
        "code instead, or lower the number above with the reason in the commit:\n"
        + "\n".join(f"{where}: {rest}" for where, rest in found)
    )


def test_the_reader_of_switched_off_rules_can_see_one():
    """Without this, the two tests above would pass on a list of files where the pattern never matched."""
    assert rules_switched_off(), "no line switches a rule off, so both tests above read nothing"
    assert SWITCHED_OFF.search("// eslint-disable-next-line a-rule -- why").group("rest") == "a-rule -- why"
    assert SWITCHED_OFF.search("// eslint-disable-next-line").group("rest") == ""
    assert SWITCHED_OFF.search("  code(); // eslint-disable-line a-rule -- why") is not None, "a trailing one counts"
    named_in_prose = " * three places carry an `eslint-disable-next-line` for it, and this is not one of them"
    assert SWITCHED_OFF.search(named_in_prose) is None, "a comment that NAMES the directive is not one"
