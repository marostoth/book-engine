"""The rule pages are reachable by every agent, and every rule lives in exactly one place.

`AGENTS.md` had grown to 35,596 bytes and 56 rules, and every session paid for all of it. The Claude Code
guidance is blunt about what that costs: a bloated always-loaded file makes Claude ignore the instructions
inside it, and knowledge that matters only sometimes should load only when it matters. 38 of those 56 rules
were tagged with a review finding and applied to one area each.

They moved to **`docs/rules/*.md`**, and `AGENTS.md` keeps the 18 every task needs, one line each, plus a
table saying which page to open for which folder.

**The rules are NOT in `.claude/skills/`.** This repository is agent-neutral by design: `AGENTS.md` is
canonical and `CLAUDE.md` and `GEMINI.md` point at it, so a rule kept in one vendor's folder is a rule every
other agent has lost. Each `.claude/skills/<name>/SKILL.md` is a pointer at a `docs/rules/` page and holds no
rule of its own. It buys one thing: Claude Code opens that page by itself when you touch matching files.
Every other agent reaches the same page from the table in `AGENTS.md`.

**A pointer has one failure mode, and it is silent.** Claude Code reads frontmatter only when the opening
`---` is the file's first line and the YAML parses; if either is wrong it loads the body with empty metadata,
so `/skill-name` still works and a human sees nothing wrong, but it never loads by itself again. A `paths:`
pattern matching no file fails the same quiet way, and so does a pointer at a page that has been renamed.

These tests are the answer to that. They parse the frontmatter the way Claude Code does, hold every `paths:`
pattern to real tracked files, follow every pointer to a page that exists, and check that no rule was dropped
or left in two places on the way out.
"""

import re
import subprocess
from pathlib import Path

import pytest
import yaml
from conftest import REPO

SKILLS = REPO / ".claude" / "skills"
RULE_PAGES = REPO / "docs" / "rules"
AGENTS = REPO / "AGENTS.md"

#: How a pointer names its page: a Markdown link or backticks around `docs/rules/<name>.md`.
POINTS_AT = re.compile(r"`(docs/rules/[a-z-]+\.md)`")

#: Every frontmatter field Claude Code knows. A key outside this list is a typo that does nothing, and the
#: loader reports the whole file as having unexpected keys.
KNOWN_KEYS = {
    "name",
    "description",
    "when_to_use",
    "argument-hint",
    "arguments",
    "disable-model-invocation",
    "user-invocable",
    "allowed-tools",
    "disallowed-tools",
    "model",
    "effort",
    "context",
    "agent",
    "background",
    "hooks",
    "paths",
    "shell",
}

#: The skill listing truncates `description` plus `when_to_use` at this many characters, so anything past it
#: is never read when Claude decides whether the skill applies.
LISTING_CAP = 1536

#: `AGENTS.md` loads in every session, and it was 35,596 bytes. The cap is the measured size after the split
#: rounded up to the next 500 bytes, so a new rule has to be paid for: shorten another one, or move it to the
#: `docs/rules/` page for its area and leave one line here.
AGENTS_CAP = 13000

#: A named rule of `AGENTS.md` or of a skill body.
RULE = re.compile(r"^- \*\*(.+?):?\*\*")

#: Rule names that are meant to repeat, because there is one per language: the `Tooling:` line of each
#: section, and `Line Endings:`, which says the same thing to Rust and to Python in their own words.
REPEATABLE = {"Tooling", "Line Endings"}


def skill_files() -> list[Path]:
    return sorted(SKILLS.glob("*/SKILL.md"))


def frontmatter(path: Path) -> dict:
    """The parsed frontmatter, read the way Claude Code reads it."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    assert lines and lines[0] == "---", (
        f"{path.relative_to(REPO)} does not open with `---` on its very first line, so Claude Code takes the "
        f"whole file as skill content and the skill never loads by itself."
    )
    end = next((i for i in range(1, len(lines)) if lines[i] == "---"), None)
    assert end is not None, f"{path.relative_to(REPO)} never closes its frontmatter with a second `---`"
    block = "\n".join(lines[1:end])
    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as broken:
        pytest.fail(
            f"{path.relative_to(REPO)} has frontmatter YAML that will not parse, so Claude Code loads the "
            f"body with no metadata and the skill never triggers on its own:\n{broken}"
        )
    assert isinstance(data, dict), f"{path.relative_to(REPO)} frontmatter is not a mapping: {data!r}"
    return data


def rules_in(text: str) -> list[str]:
    return [m.group(1) for line in text.splitlines() if (m := RULE.match(line))]


def tracked() -> list[str]:
    done = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True)
    return done.stdout.splitlines()


def pattern_matches(pattern: str, paths: list[str]) -> bool:
    """Whether a `paths:` pattern covers at least one tracked file.

    Claude Code matches these the way a path rule does. Only the shapes this repository uses are read here:
    a folder prefix ending in `/**`, a bare folder, or a plain path.
    """
    stem = pattern.strip().rstrip("*").rstrip("/")
    return any(p == stem or p.startswith(stem + "/") for p in paths)


# --------------------------------------------------------------------------------------------------------
# Sight checks
# --------------------------------------------------------------------------------------------------------


def test_the_readers_of_this_file_find_something():
    """Every check below compares two lists. Two empty lists agree and prove nothing."""
    files = skill_files()
    assert len(files) >= 5, f"only {len(files)} SKILL.md files were found under {SKILLS}"

    agents_rules = rules_in(AGENTS.read_text(encoding="utf-8"))
    assert len(agents_rules) > 10, f"only {len(agents_rules)} rules were read from AGENTS.md"
    assert "Process Hygiene" in agents_rules, "the rule reader did not find a rule it should have"

    assert pattern_matches("packages/ingestion/**", tracked()), "the pattern reader matches nothing real"
    assert not pattern_matches("packages/ingest/**", tracked()), (
        "the pattern reader accepted a folder that does not exist, so a typo would pass"
    )

    pages = sorted(RULE_PAGES.glob("*.md"))
    assert len(pages) >= 5, f"only {len(pages)} rule pages were found under {RULE_PAGES}"
    assert POINTS_AT.findall("read `docs/rules/backend.md` first") == ["docs/rules/backend.md"]
    assert POINTS_AT.findall("no page named here") == []


# --------------------------------------------------------------------------------------------------------
# Every agent can reach the rules
# --------------------------------------------------------------------------------------------------------


def test_every_skill_points_at_a_rule_page_that_is_there():
    """A pointer at a renamed page leaves Claude Code opening nothing, and says so to nobody."""
    for path in skill_files():
        named = POINTS_AT.findall(path.read_text(encoding="utf-8"))
        assert named, (
            f"{path.relative_to(REPO)} names no `docs/rules/<page>.md`. A skill file holds no rules of its "
            f"own: it points at the page every other agent reads, so there is one copy of each rule."
        )
        for page in set(named):
            assert (REPO / page).exists(), f"{path.relative_to(REPO)} points at `{page}`, which is not there"


def test_no_rule_hides_where_only_one_agent_reads():
    """`CLAUDE.md` and `GEMINI.md` both point at `AGENTS.md`, so a rule kept under `.claude/` is lost to Gemini."""
    for path in skill_files():
        body = path.read_text(encoding="utf-8").split("---", 2)[-1]
        rules = rules_in(body)
        assert not rules, (
            f"{path.relative_to(REPO)} carries {len(rules)} rules of its own: {rules[:3]}. Only Claude Code "
            f"reads that folder. Move them to a `docs/rules/` page and leave the pointer."
        )


def test_agents_md_sends_every_agent_to_every_rule_page():
    text = AGENTS.read_text(encoding="utf-8")
    for page in sorted(RULE_PAGES.glob("*.md")):
        named = f"docs/rules/{page.name}"
        assert named in text, (
            f"AGENTS.md never names `{named}`, so an agent that does not read `.claude/` has no way to find "
            f"those rules. Every rule page needs its row in the table at the top."
        )


# --------------------------------------------------------------------------------------------------------
# The silent failure: frontmatter Claude Code cannot read
# --------------------------------------------------------------------------------------------------------


def test_every_skill_frontmatter_parses_and_says_when_to_use_the_skill():
    for path in skill_files():
        data = frontmatter(path)
        described = str(data.get("description") or "").strip()
        assert described, (
            f"{path.relative_to(REPO)} has no `description`, so Claude has nothing to match a request "
            f"against and the skill only ever runs when you type its name."
        )
        assert len(described) > 40, f"{path.relative_to(REPO)}: the description is too short to match on"


def test_no_skill_uses_a_frontmatter_key_claude_code_does_not_know():
    for path in skill_files():
        unknown = sorted(set(frontmatter(path)) - KNOWN_KEYS)
        assert not unknown, (
            f"{path.relative_to(REPO)} sets {unknown}, which Claude Code does not know. It rejects the whole "
            f"frontmatter over an unexpected key, and the skill then loads with no metadata."
        )


def test_every_skill_listing_fits_inside_the_cap():
    for path in skill_files():
        data = frontmatter(path)
        listing = str(data.get("description") or "") + str(data.get("when_to_use") or "")
        assert len(listing) <= LISTING_CAP, (
            f"{path.relative_to(REPO)}: description plus when_to_use is {len(listing)} characters and the "
            f"listing is cut at {LISTING_CAP}. Put the key use case first and shorten the rest."
        )


def test_every_paths_pattern_matches_a_file_this_repository_has():
    """A `paths:` typo does not fail: it quietly stops the skill loading for the files it is meant for."""
    paths = tracked()
    checked = 0
    for path in skill_files():
        raw = frontmatter(path).get("paths")
        if raw is None:
            continue
        patterns = raw if isinstance(raw, list) else [p for p in str(raw).split(",") if p.strip()]
        for pattern in patterns:
            checked += 1
            assert pattern_matches(pattern, paths), (
                f"{path.relative_to(REPO)} limits itself to `{pattern.strip()}`, which matches no file git "
                f"tracks. The skill would never load by itself for anything."
            )
    assert checked >= 3, f"only {checked} paths patterns were checked; the reader is not finding them"


# --------------------------------------------------------------------------------------------------------
# One rule, one home
# --------------------------------------------------------------------------------------------------------


def test_a_rule_is_in_exactly_one_place():
    """A rule in two files drifts apart, which is how the four command tables of TL-07 happened."""
    homes: dict[str, list[str]] = {}
    for name in rules_in(AGENTS.read_text(encoding="utf-8")):
        homes.setdefault(name, []).append("AGENTS.md")
    for path in sorted(RULE_PAGES.glob("*.md")):
        for name in rules_in(path.read_text(encoding="utf-8")):
            homes.setdefault(name, []).append(str(path.relative_to(REPO)).replace("\\", "/"))

    twice = {n: where for n, where in homes.items() if len(where) > 1 and n not in REPEATABLE}
    assert not twice, "these rules are in more than one place, and two copies of a rule drift apart:\n  " + "\n  ".join(
        f"{n}: {', '.join(where)}" for n, where in sorted(twice.items())
    )


def test_no_rule_was_lost_on_the_way_out_of_agents_md():
    """56 rules went in. The count is a floor, so adding a rule is fine and dropping one is not."""
    total = len(rules_in(AGENTS.read_text(encoding="utf-8")))
    for path in sorted(RULE_PAGES.glob("*.md")):
        total += len(rules_in(path.read_text(encoding="utf-8")))
    assert total >= 56, (
        f"AGENTS.md and the rule pages hold {total} rules between them, and there were 56 before they were "
        f"split up. A rule was dropped rather than moved."
    )


def test_agents_md_stays_small_enough_to_be_read():
    size = len(AGENTS.read_bytes())
    assert size <= AGENTS_CAP, (
        f"AGENTS.md is {size} bytes and loads in every session; the cap is {AGENTS_CAP}. A bloated "
        f"always-loaded file makes its own rules get ignored. Shorten a rule, or move it into the skill for "
        f"its area and leave one line here."
    )


def test_every_rule_page_is_pointed_at_by_a_skill():
    """The page is what every agent reads; the pointer is what makes Claude Code open it without being asked."""
    pointed: set[str] = set()
    for path in skill_files():
        pointed.update(POINTS_AT.findall(path.read_text(encoding="utf-8")))
    for page in sorted(RULE_PAGES.glob("*.md")):
        named = f"docs/rules/{page.name}"
        assert named in pointed, (
            f"no skill points at `{named}`, so Claude Code never opens it by itself. Other agents still find "
            f"it from AGENTS.md, but the automatic half is missing: add `.claude/skills/<name>/SKILL.md`."
        )
