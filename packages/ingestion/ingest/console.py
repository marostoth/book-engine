"""What a command of this package prints, and what printing may never do (IN-09).

Two rules live here, and every command of the repository keeps both.

A command may print any letter of any book. Windows gives a command that writes into a pipe or into a file the
code page of the machine, such as cp1252, and a book title of Cyrillic or Greek letters is not in it. Such a
title used to stop the import with `UnicodeEncodeError` AFTER every file was written, so the command said
"Ingestion failed" and gave back 1 when nothing had failed. A real console already takes UTF-8, so
`allow_any_letter` changes nothing there and cures the pipe and the log file.

Saying what a command has already done may never make the command fail. The book is in the vault by then, so a
console that cannot take a letter, or a pipe that a reader closed early, must not turn finished work into a
report of failure. `say_what_was_done` prints such lines and keeps the command whole.
"""

from __future__ import annotations

import sys
from typing import IO, Iterable, List


def allow_any_letter() -> None:
    """Lets this command print any letter of any book, into a console, a pipe or a log file (IN-09).

    Call it first thing in a command. A letter that the stream still cannot take is printed as `?`, never as a
    crash. A stream that cannot be changed at all, such as one that a test holds, is left as it is: what it
    already takes, it still takes.
    """
    for stream in (sys.stdout, sys.stderr):
        change = getattr(stream, "reconfigure", None)
        if change is None:
            continue
        try:
            change(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            continue


def say_what_was_done(sentences: Iterable[str], *, to_errors: bool = False) -> None:
    """Prints what a command has already done, and never makes the command fail for saying it (IN-09).

    The work is finished before these lines are printed, so a console that cannot take a letter of the book, or a
    reader that closed the pipe, may not turn that work into a report of failure. When a line cannot be printed,
    one short line of plain letters says so instead, and the command carries on.

    Every sentence is made first and printed after, so a fault in making one is a fault of the command and is
    never swallowed here.
    """
    lines: List[str] = list(sentences)
    where: IO[str] = sys.stderr if to_errors else sys.stdout
    try:
        for line in lines:
            print(line, file=where, flush=True)
    except Exception as error:  # the console or the pipe, not the work: the work is done
        _say_the_stream_could_not(error)


def _say_the_stream_could_not(error: BaseException) -> None:
    """One line of plain letters about a stream that could not take what a command wanted to say."""
    try:
        print(
            f"[!] The work is done. This console or log could not print what was done ({type(error).__name__}).",
            file=sys.stderr,
            flush=True,
        )
    except Exception:  # nothing is left to say it with, and the work is still done
        pass
