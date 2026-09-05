#!/usr/bin/env python3
"""Pick one quote at random from a mix of online APIs and a local dataset.

Prints a single JSON line: {"text": "...", "author": "..."}

Design note: any API failure falls back to the local dataset rather than erroring,
because the output lands on a permanent kitchen wall panel. An error message sitting
on that panel reads as "the thing is broken", which is worse than a repeated quote.
The local dataset is what makes a visible failure state impossible.

MUST stay Python 3.9 compatible: tests run on 3.9.6 locally while the Pi's HA
container is on 3.14.5. No match statements, no `X | Y` unions.
"""
import json
import os
import random
import re
import sys
from typing import Any, Dict, Optional

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.path.join(HERE, "quotes.json")

# Short: this runs on a sensor tick and must never block the panel on a dead host.
TIMEOUT_SECONDS = 5

# Shown only if literally everything fails, including reading the local file.
LAST_RESORT = {"text": "Take a deep breath and start the day fresh.", "author": ""}


def _clean(value: Any) -> str:
    """Coerce to a stripped string. None becomes "" so the card never renders "None"."""
    if value is None:
        return ""
    return str(value).strip()


def normalise_zenquotes(raw: Any) -> Optional[Dict[str, str]]:
    """ZenQuotes returns a LIST: [{"q": ..., "a": ..., "h": "<html>"}]. `h` is ignored."""
    if not raw or not isinstance(raw, list):
        return None
    first = raw[0]
    if not isinstance(first, dict):
        return None
    text = _clean(first.get("q"))
    if not text:
        return None
    return {"text": text, "author": _clean(first.get("a"))}


def normalise_local(raw: Any) -> Optional[Dict[str, str]]:
    """The local dataset uses {"quoteText": ..., "quoteAuthor": ...}.

    349 of 5,421 entries have a blank author; that is expected, not an error."""
    if not raw or not isinstance(raw, dict):
        return None
    text = _clean(raw.get("quoteText"))
    if not text:
        return None
    return {"text": text, "author": _clean(raw.get("quoteAuthor"))}


def load_local_quote() -> Optional[Dict[str, str]]:
    """Pick one random quote from the local dataset.

    Returns None rather than raising on a missing or corrupt file: this is the
    fallback path, and an exception here would make the sensor unavailable, which
    is the exact outcome the fallback exists to prevent.
    """
    try:
        with open(DATASET, encoding="utf-8") as f:
            data = json.load(f)
    except (IOError, OSError, ValueError, UnicodeDecodeError):
        return None
    if not data:
        return None
    return normalise_local(random.choice(data))


# Quotable (api.quotable.io) is deliberately ABSENT: its TLS certificate has
# expired, so it works only over plain HTTP, which usually signals an
# unmaintained service. See the spec, section 2.
SOURCES = {
    "zenquotes": ("https://zenquotes.io/api/random", normalise_zenquotes),
}


def _http_get(url):
    """Isolated so tests can replace it without patching requests itself.

    requests is imported lazily: it is present in the Pi's HA container but is not
    guaranteed in the local test environment, and the unit tests must not need it.
    """
    import requests

    return requests.get(url, timeout=TIMEOUT_SECONDS)


def fetch_api(name: str) -> Optional[Dict[str, str]]:
    """Fetch and normalise one API. Returns None on ANY failure.

    Deliberately broad: every failure mode here has the same correct response —
    fall back to a local quote. Distinguishing a timeout from a 503 would add no
    value on a wall panel.
    """
    entry = SOURCES.get(name)
    if entry is None:
        return None
    url, normalise = entry
    try:
        response = _http_get(url)
        if getattr(response, "status_code", None) != 200:
            return None
        return normalise(response.json())
    except Exception:
        return None


# "local" is a first-class source, not merely the fallback: without it the 5,421-quote
# dataset would only ever surface when the network was down.
#
# Weighted 65% local / 35% zenquotes: the 5,421-quote local dataset is deep enough
# to carry most of the rotation, while ZenQuotes adds daily freshness on top. This
# replaces a prior uniform three-way split that also included affirmations.dev,
# which was dropped after an empirical check found only 17 unique affirmations
# across 25 consecutive fetches (several repeating 2-3 times) — a shallow pool that
# was getting 1/3 of the rotation while the much deeper local dataset was underused.
#
# Weights are relative, not counts that must sum to anything in particular: adding
# a third source is appending a name and a weight below, no renormalising the rest.
SOURCE_NAMES = ["local", "zenquotes"]
SOURCE_WEIGHTS = [65, 35]


def _choose_source() -> str:
    return random.choices(SOURCE_NAMES, weights=SOURCE_WEIGHTS)[0]


# Applied to EVERY source. Deliberately short: this is a wall panel in a family
# kitchen, not a content-moderation system. Word-boundary matched, because a
# substring rule would block "goddess" via "god" and far worse false positives.
# Single words ONLY: the \b(...)\b alternation matches individual tokens, so a
# multi-word phrase (e.g. "in god we trust") would silently never match.
BLOCKED_WORDS = [
    "god", "jesus", "christ", "bible", "scripture", "holy", "prayer",
    "devil", "satan", "gita",
]
_BLOCK_RE = re.compile(r"\b(" + "|".join(BLOCKED_WORDS) + r")\b", re.IGNORECASE)

# How many rounds to try before giving up and using the last resort. Each round
# attempts at most one API fetch AND at most one local read, so N rounds means at
# most N network calls and at most 2N quote attempts. Bounded so a pathological
# blocklist cannot spin forever on a sensor tick.
MAX_ATTEMPT_ROUNDS = 5


def is_blocked(text: str) -> bool:
    """True when the text contains a blocked word as a WHOLE word."""
    if not text:
        return False
    return _BLOCK_RE.search(text) is not None


def pick() -> Dict[str, str]:
    """Return one quote. Never raises, always returns a usable dict.

    A blocked result re-rolls rather than being returned, bounded by
    MAX_ATTEMPT_ROUNDS so a pathological blocklist cannot spin forever on a
    sensor tick.
    """
    try:
        for _ in range(MAX_ATTEMPT_ROUNDS):
            source = _choose_source()
            if source != "local":
                result = fetch_api(source)
                if result and not is_blocked(result["text"]):
                    return result
            local = load_local_quote()
            if local and not is_blocked(local["text"]):
                return local
    except Exception:
        pass
    return LAST_RESORT


def main() -> None:
    # ensure_ascii=False so curly quotes and em dashes survive to the panel; the
    # whole point of the cp1252 conversion was to keep them.
    sys.stdout.write(json.dumps(pick(), ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
