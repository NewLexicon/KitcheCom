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


def normalise_affirmation(raw: Any) -> Optional[Dict[str, str]]:
    """Affirmations.dev returns {"affirmation": ...} and has NO author field."""
    if not raw or not isinstance(raw, dict):
        return None
    text = _clean(raw.get("affirmation"))
    if not text:
        return None
    return {"text": text, "author": ""}


def normalise_local(raw: Any) -> Optional[Dict[str, str]]:
    """The local dataset uses {"quoteText": ..., "quoteAuthor": ...}.

    349 of 5,421 entries have a blank author; that is expected, not an error."""
    if not raw or not isinstance(raw, dict):
        return None
    text = _clean(raw.get("quoteText"))
    if not text:
        return None
    return {"text": text, "author": _clean(raw.get("quoteAuthor"))}
