# Daily Quotes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an hourly-rotating, content-filtered inspirational quote on the KitchenCOM wall panel, drawn from two HTTPS APIs plus a 5,421-quote local dataset, with no visible failure state.

**Architecture:** One Python script picks a source at random, fetches it, and normalises every response shape to `{"text", "author"}` on stdout. Any failure falls back to the local dataset, so there is always something valid to print. A `command_line` sensor runs it hourly; a markdown card renders it.

**Tech Stack:** Python 3 (stdlib + `requests`), Home Assistant `command_line` sensor, Lovelace markdown card, pytest.

**Spec:** `docs/superpowers/specs/2026-08-18-daily-quotes-design.md`

---

## Environment facts (verified 2026-08-18 — do not re-derive)

- **Local Python is 3.9.6; the Pi's HA container is 3.14.5.** Tests run locally, so the script
  **must be 3.9-compatible**: no `match`, no `X | Y` unions, no `list[str]` in annotations
  evaluated at runtime. Use `typing.Optional` / `typing.Dict`.
- `requests` 2.34.2 IS available inside the container. It is NOT guaranteed locally — the script
  must import it lazily inside the fetch function so unit tests can run without it.
- The container can execute a script at `/config/<name>.py` — verified by probe.
- **There are no existing `command_line` sensors in this repo.** This is the first.
- **There is no Python test suite in this repo yet.** This plan creates the first one.
  (`deploy/choreops-content/gen_content.py` has no tests; the only `pytest.ini` belongs to the
  vendored `reference/ChoreOps-main` and is unrelated.)
- **The local dataset is cp1252, not UTF-8.** `json.load()` on it raises
  `UnicodeDecodeError: 'utf-8' codec can't decode byte 0x97 in position 21269`.
- Package YAML convention: `homeassistant/packages/<name>.yaml`, loaded by
  `homeassistant: packages: !include_dir_named packages`.

---

## File structure

| File | Responsibility |
|---|---|
| `deploy/quotes/convert_dataset.py` | **create** — one-shot cp1252→UTF-8 conversion of the raw dataset |
| `deploy/quotes/quotes.json` | **generated** — the UTF-8 dataset, committed, deployed to `/config/quotes.json` |
| `deploy/quotes/pick_quote.py` | **create** — source selection, fetch, fallback, shape normalisation |
| `deploy/quotes/test_pick_quote.py` | **create** — pytest suite |
| `deploy/quotes/README.md` | **create** — what this is, how to deploy it |
| `homeassistant/packages/quotes.yaml` | **create** — the `command_line` sensor |
| `homeassistant/dashboards/kitchen.yaml` | **modify** — add the "Perspective" markdown card |

Rationale: everything quote-related lives in one directory so the pieces that change together
stay together, matching how `deploy/choreops-content/` is organised.

---

## Chunk 1: The dataset and the script

### Task 1: Convert the dataset to UTF-8

**Files:**
- Create: `deploy/quotes/convert_dataset.py`
- Generate: `deploy/quotes/quotes.json`

- [ ] **Step 1: Write the failing test**

Create `deploy/quotes/test_pick_quote.py`:

```python
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.path.join(HERE, "quotes.json")


def test_dataset_is_valid_utf8_json():
    """The raw upstream file is cp1252; a mis-converted file puts mojibake on the wall."""
    with open(DATASET, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 5421


def test_dataset_entries_have_the_expected_shape():
    with open(DATASET, encoding="utf-8") as f:
        data = json.load(f)
    assert all("quoteText" in q for q in data)
    assert all("quoteAuthor" in q for q in data)


def test_conversion_preserved_non_ascii_characters():
    """0x97 in cp1252 is an em dash. If conversion silently dropped or mangled
    non-ascii, this is where it shows up."""
    with open(DATASET, encoding="utf-8") as f:
        raw = f.read()
    assert any(ord(ch) > 127 for ch in raw), "no non-ascii survived — conversion likely lossy"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd deploy/quotes && python3 -m pytest test_pick_quote.py -v`
Expected: FAIL — `FileNotFoundError: quotes.json`

- [ ] **Step 3: Write the converter**

Create `deploy/quotes/convert_dataset.py`:

```python
"""One-shot cp1252 -> UTF-8 conversion of the upstream quote dataset.

The upstream file (Database-Quotes-JSON-master/quotes.json) is cp1252-encoded.
json.load() on it raises UnicodeDecodeError at byte 0x97 (an em dash). Converting
at runtime would mean doing it on every sensor tick, so it happens once here and
the UTF-8 result is committed.

Usage:  python3 convert_dataset.py <source.json> <dest.json>
"""
import json
import sys


def convert(src_path, dest_path):
    with open(src_path, "rb") as f:
        raw = f.read()
    # cp1252 rather than latin-1: both decode every byte, but cp1252 maps 0x91-0x97
    # to the correct curly quotes and dashes, where latin-1 yields control characters.
    data = json.loads(raw.decode("cp1252"))
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return len(data)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    count = convert(sys.argv[1], sys.argv[2])
    print("converted %d quotes" % count)
```

- [ ] **Step 4: Run the conversion**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/deploy/quotes
python3 convert_dataset.py \
  ../../git/Database-Quotes-JSON-master/quotes.json \
  quotes.json
```
Expected: `converted 5421 quotes`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add deploy/quotes/convert_dataset.py deploy/quotes/quotes.json deploy/quotes/test_pick_quote.py
git commit -m "feat(quotes): convert the 5,421-quote dataset from cp1252 to UTF-8

The upstream file is cp1252-encoded and json.load() fails on it outright with
UnicodeDecodeError at byte 0x97. Converting once at prep time rather than on every
sensor tick, and committing the UTF-8 result. A test asserts non-ascii survived, so
a lossy re-conversion cannot silently put mojibake on the kitchen wall."
```

---

### Task 2: Normalise the three response shapes

Each source returns a different shape. Normalising at the boundary keeps the Jinja in the card
trivial.

**Files:**
- Create: `deploy/quotes/pick_quote.py`
- Modify: `deploy/quotes/test_pick_quote.py`

- [ ] **Step 1: Write the failing tests**

Append to `deploy/quotes/test_pick_quote.py`:

```python
from pick_quote import normalise_zenquotes, normalise_affirmation, normalise_local


def test_normalise_zenquotes():
    raw = [{"q": "Stay hungry.", "a": "Steve Jobs", "h": "<blockquote>ignored</blockquote>"}]
    assert normalise_zenquotes(raw) == {"text": "Stay hungry.", "author": "Steve Jobs"}


def test_normalise_affirmation_has_no_author():
    raw = {"affirmation": "It is a marathon, not a sprint"}
    assert normalise_affirmation(raw) == {
        "text": "It is a marathon, not a sprint",
        "author": "",
    }


def test_normalise_local():
    raw = {"quoteText": "You can observe a lot just by watching.", "quoteAuthor": "Yogi Berra"}
    assert normalise_local(raw) == {
        "text": "You can observe a lot just by watching.",
        "author": "Yogi Berra",
    }


def test_normalise_local_tolerates_a_blank_author():
    """349 of the 5,421 local quotes have no author. The card must get "", not None."""
    assert normalise_local({"quoteText": "A saying.", "quoteAuthor": ""})["author"] == ""
    assert normalise_local({"quoteText": "A saying."})["author"] == ""


def test_normalisers_reject_an_empty_payload():
    """A 200 response with an empty body must not yield an empty quote on the wall."""
    for fn, empty in (
        (normalise_zenquotes, []),
        (normalise_affirmation, {}),
        (normalise_local, {}),
    ):
        assert fn(empty) is None


def test_normalisers_strip_surrounding_whitespace():
    assert normalise_zenquotes([{"q": "  spaced  ", "a": "  Someone  "}]) == {
        "text": "spaced",
        "author": "Someone",
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pick_quote'`

- [ ] **Step 3: Write the normalisers**

Create `deploy/quotes/pick_quote.py`:

```python
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add deploy/quotes/pick_quote.py deploy/quotes/test_pick_quote.py
git commit -m "feat(quotes): normalise three source shapes to {text, author}

ZenQuotes returns a list with q/a, Affirmations.dev a dict with only an
affirmation and no author, and the local dataset quoteText/quoteAuthor. Doing
this at the boundary keeps the card's Jinja trivial and means a missing author
is always \"\" rather than None, which would render as the string None on the wall.

Empty payloads return None so a 200 with an empty body falls back rather than
putting a blank quote on the panel."
```

---

### Task 3: The local fallback reader

**Files:**
- Modify: `deploy/quotes/pick_quote.py`, `deploy/quotes/test_pick_quote.py`

- [ ] **Step 1: Write the failing tests**

```python
from pick_quote import load_local_quote


def test_load_local_quote_returns_a_usable_quote():
    q = load_local_quote()
    assert q is not None
    assert q["text"]
    assert isinstance(q["author"], str)


def test_load_local_quote_survives_a_missing_file(monkeypatch):
    """A missing dataset must not raise — the sensor would go unavailable."""
    monkeypatch.setattr("pick_quote.DATASET", "/nonexistent/path/quotes.json")
    assert load_local_quote() is None


def test_load_local_quote_survives_a_corrupt_file(tmp_path, monkeypatch):
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr("pick_quote.DATASET", str(bad))
    assert load_local_quote() is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest test_pick_quote.py -v -k local_quote`
Expected: FAIL — `ImportError: cannot import name 'load_local_quote'`

- [ ] **Step 3: Implement**

Append to `pick_quote.py`:

```python
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: 12 passed

- [ ] **Step 5: Commit**

```bash
git add deploy/quotes/pick_quote.py deploy/quotes/test_pick_quote.py
git commit -m "feat(quotes): local dataset reader that cannot raise

Returns None on a missing or corrupt dataset rather than propagating. This is the
fallback path — an exception here would make the sensor unavailable, which is
precisely what the fallback exists to prevent."
```

---

## Chunk 2: Fetching, selection, and the CLI

### Task 4: Fetch with a guaranteed fallback

**Files:**
- Modify: `deploy/quotes/pick_quote.py`, `deploy/quotes/test_pick_quote.py`

- [ ] **Step 1: Write the failing tests**

```python
import pick_quote


class _FakeResponse:
    def __init__(self, status_code=200, payload=None, raises=None):
        self.status_code = status_code
        self._payload = payload
        self._raises = raises

    def json(self):
        if self._raises:
            raise self._raises
        return self._payload


def test_fetch_returns_a_normalised_quote_on_success(monkeypatch):
    monkeypatch.setattr(
        pick_quote, "_http_get",
        lambda url: _FakeResponse(payload=[{"q": "Fetched.", "a": "Someone"}]),
    )
    assert pick_quote.fetch_api("zenquotes") == {"text": "Fetched.", "author": "Someone"}


def test_fetch_returns_none_on_a_non_200(monkeypatch):
    monkeypatch.setattr(pick_quote, "_http_get", lambda url: _FakeResponse(status_code=503))
    assert pick_quote.fetch_api("zenquotes") is None


def test_fetch_returns_none_on_malformed_json(monkeypatch):
    monkeypatch.setattr(
        pick_quote, "_http_get",
        lambda url: _FakeResponse(raises=ValueError("no json")),
    )
    assert pick_quote.fetch_api("zenquotes") is None


def test_fetch_returns_none_when_the_request_itself_raises(monkeypatch):
    """Covers DNS failure, timeout, and connection refused. The Pi logs
    intermittent DNS errors, so this path is routine, not exceptional."""
    def boom(url):
        raise IOError("dns failure")
    monkeypatch.setattr(pick_quote, "_http_get", boom)
    assert pick_quote.fetch_api("zenquotes") is None


def test_fetch_rejects_an_unknown_source_name():
    assert pick_quote.fetch_api("not-a-real-source") is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest test_pick_quote.py -v -k fetch`
Expected: FAIL — `AttributeError: module 'pick_quote' has no attribute 'fetch_api'`

- [ ] **Step 3: Implement**

Append to `pick_quote.py`:

```python
# Quotable (api.quotable.io) is deliberately ABSENT: its TLS certificate has
# expired, so it works only over plain HTTP, which usually signals an
# unmaintained service. See the spec, section 2.
SOURCES = {
    "zenquotes": ("https://zenquotes.io/api/random", normalise_zenquotes),
    "affirmations": ("https://www.affirmations.dev", normalise_affirmation),
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: 17 passed

- [ ] **Step 5: Commit**

```bash
git add deploy/quotes/pick_quote.py deploy/quotes/test_pick_quote.py
git commit -m "feat(quotes): API fetch that returns None on any failure

Every failure mode — non-200, malformed JSON, timeout, DNS — has the same correct
response on a wall panel: fall back to a local quote. So the except is deliberately
broad rather than enumerating cases that would all be handled identically.

_http_get is isolated so tests can replace it, and requests is imported lazily
because it exists in the Pi's container but not necessarily in the test env.

Quotable is absent by design: expired TLS cert, HTTP-only, likely abandoned."
```

---

### Task 5: Source selection and the CLI entry point

**Files:**
- Modify: `deploy/quotes/pick_quote.py`, `deploy/quotes/test_pick_quote.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_pick_falls_back_to_local_when_the_api_fails(monkeypatch):
    monkeypatch.setattr(pick_quote, "fetch_api", lambda name: None)
    result = pick_quote.pick()
    assert result["text"]
    assert isinstance(result["author"], str)


def test_pick_uses_the_api_result_when_it_succeeds(monkeypatch):
    monkeypatch.setattr(pick_quote, "_choose_source", lambda: "zenquotes")
    monkeypatch.setattr(
        pick_quote, "fetch_api", lambda name: {"text": "From API", "author": "A"}
    )
    assert pick_quote.pick() == {"text": "From API", "author": "A"}


def test_pick_returns_the_last_resort_when_everything_fails(monkeypatch):
    monkeypatch.setattr(pick_quote, "fetch_api", lambda name: None)
    monkeypatch.setattr(pick_quote, "load_local_quote", lambda: None)
    assert pick_quote.pick() == pick_quote.LAST_RESORT


def test_pick_never_raises_whatever_happens(monkeypatch):
    """The sensor must always get parseable output."""
    def boom(*a, **k):
        raise RuntimeError("catastrophe")
    monkeypatch.setattr(pick_quote, "_choose_source", boom)
    result = pick_quote.pick()
    assert result["text"]


def test_choose_source_can_return_local(monkeypatch):
    """'local' must be a first-class source, not only a fallback — otherwise the
    5,421-quote dataset would only ever appear when the network was down."""
    monkeypatch.setattr(random, "choice", lambda seq: "local")
    assert pick_quote._choose_source() == "local"


def test_main_prints_one_line_of_valid_json(capsys):
    pick_quote.main()
    captured = capsys.readouterr().out.strip()
    assert "\n" not in captured, "the command_line sensor parses a single line"
    parsed = json.loads(captured)
    assert set(parsed) == {"text", "author"}
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest test_pick_quote.py -v -k "pick or choose or main"`
Expected: FAIL — `AttributeError: module 'pick_quote' has no attribute 'pick'`

- [ ] **Step 3: Implement**

Append to `pick_quote.py`:

```python
# "local" is a first-class source, not merely the fallback: without it the 5,421-quote
# dataset would only ever surface when the network was down.
CHOICES = ["zenquotes", "affirmations", "local"]


def _choose_source() -> str:
    return random.choice(CHOICES)


def pick() -> Dict[str, str]:
    """Return one quote. Never raises, always returns a usable dict."""
    try:
        source = _choose_source()
        if source != "local":
            result = fetch_api(source)
            if result:
                return result
        local = load_local_quote()
        if local:
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
```

- [ ] **Step 4: Run the full suite**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: 23 passed

- [ ] **Step 5: Run it for real**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM/deploy/quotes
for i in 1 2 3 4 5; do python3 pick_quote.py; done
```
Expected: five single-line JSON objects, each with non-empty `text`. Some will have an empty
`author` (affirmations and the 349 author-less local quotes) — that is correct.

- [ ] **Step 6: Commit**

```bash
git add deploy/quotes/pick_quote.py deploy/quotes/test_pick_quote.py
git commit -m "feat(quotes): source selection and CLI entry point

pick() cannot raise: a bare except returns a hardcoded last-resort quote so the
sensor always receives parseable output. 'local' is a first-class choice rather
than only a fallback, or the 5,421-quote dataset would surface only when the
network was down.

main() writes one line with ensure_ascii=False so the curly quotes and em dashes
the cp1252 conversion preserved actually reach the panel."
```

---

### Task 5b: Content blocklist

Requested 2026-08-18 after a live ZenQuotes call returned a Bhagavad Gita quote, confirming the
unfiltered feed does carry religious content. The blocklist applies to **every** source, including
the ~0.9% of local quotes that mention God.

**Files:**
- Modify: `deploy/quotes/pick_quote.py`, `deploy/quotes/test_pick_quote.py`

- [ ] **Step 1: Write the failing tests**

```python
from pick_quote import is_blocked


def test_is_blocked_catches_religious_terms():
    assert is_blocked("God always takes the simplest way")
    assert is_blocked("Whatever happened, happened for the good. — Bhagavad Gita")


def test_is_blocked_is_case_insensitive():
    assert is_blocked("GOD is great")


def test_is_blocked_matches_whole_words_only():
    """Substring matching would block 'goddess of design' via 'god', and worse,
    'assessment' via a crude 'ass' rule. Word boundaries are required."""
    assert not is_blocked("A good goddamn-free sentence about godliness")  # see note
    assert not is_blocked("The gods of small things")  # plural, not the blocked token
    assert not is_blocked("Sin City is a film")  # capital S, still a word — see below


def test_is_blocked_leaves_ordinary_quotes_alone():
    assert not is_blocked("You can observe a lot just by watching.")
    assert not is_blocked("Stay hungry, stay foolish.")


def test_pick_rerolls_a_blocked_quote(monkeypatch):
    """A blocked API result must fall through to a local quote, not be returned."""
    monkeypatch.setattr(pick_quote, "_choose_source", lambda: "zenquotes")
    monkeypatch.setattr(
        pick_quote, "fetch_api", lambda name: {"text": "God is great", "author": "X"}
    )
    result = pick_quote.pick()
    assert result["text"] != "God is great"


def test_pick_rerolls_a_blocked_local_quote(monkeypatch):
    """Guards against infinite recursion when the local pick is itself blocked."""
    calls = {"n": 0}

    def fake_local():
        calls["n"] += 1
        if calls["n"] == 1:
            return {"text": "God is great", "author": "X"}
        return {"text": "A clean quote", "author": "Y"}

    monkeypatch.setattr(pick_quote, "_choose_source", lambda: "local")
    monkeypatch.setattr(pick_quote, "load_local_quote", fake_local)
    assert pick_quote.pick()["text"] == "A clean quote"
```

**Note on the whole-word test:** decide the exact token list when implementing, then make the test
match it. The point of that test is to pin the *word-boundary* behaviour, not a specific
vocabulary — adjust the example strings to whatever list you settle on.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest test_pick_quote.py -v -k block`
Expected: FAIL — `ImportError: cannot import name 'is_blocked'`

- [ ] **Step 3: Implement**

```python
import re

# Applied to EVERY source. Deliberately short: this is a wall panel in a family
# kitchen, not a content-moderation system. Word-boundary matched, because a
# substring rule would block "goddess" via "god" and far worse false positives.
BLOCKED_WORDS = [
    "god", "jesus", "christ", "lord", "bible", "scripture", "holy", "prayer",
    "sin", "damn", "hell", "devil", "satan",
]
_BLOCK_RE = re.compile(r"\b(" + "|".join(BLOCKED_WORDS) + r")\b", re.IGNORECASE)

# How many times to re-roll before giving up and using the last resort. Bounded so
# a pathological blocklist cannot spin forever on a sensor tick.
MAX_REROLLS = 5


def is_blocked(text: str) -> bool:
    """True when the text contains a blocked word as a WHOLE word."""
    if not text:
        return False
    return _BLOCK_RE.search(text) is not None
```

Then modify `pick()` so a blocked result re-rolls rather than being returned. Keep the re-roll
bounded by `MAX_REROLLS` and fall through to `LAST_RESORT`, which must itself pass `is_blocked`.

- [ ] **Step 4: Run the full suite**

Run: `python3 -m pytest test_pick_quote.py -v`
Expected: 29 passed

- [ ] **Step 5: Sanity-check the blocklist against the real dataset**

```bash
cd deploy/quotes && python3 -c "
import json, pick_quote
data = json.load(open('quotes.json', encoding='utf-8'))
blocked = [q for q in data if pick_quote.is_blocked(q['quoteText'])]
print('blocked: %d of %d (%.1f%%)' % (len(blocked), len(data), 100*len(blocked)/len(data)))
for q in blocked[:5]: print('  -', q['quoteText'][:70])
"
```
Expected: a low single-digit percentage. **If it blocks more than ~5%, the list is too
aggressive** — check for a word doing unintended work and trim it.

- [ ] **Step 6: Commit**

```bash
git add deploy/quotes/pick_quote.py deploy/quotes/test_pick_quote.py
git commit -m "feat(quotes): whole-word content blocklist across all sources

Requested after a live ZenQuotes call returned a Bhagavad Gita quote, confirming
the unfiltered feed carries religious content. Applies to every source including
the local dataset.

Word-boundary matched, not substring: a substring rule blocks 'goddess' via 'god'.
Re-rolls are bounded by MAX_REROLLS so a pathological list cannot spin on a sensor
tick, and LAST_RESORT must itself pass the filter."
```

---

## Chunk 3: Wiring it into Home Assistant

### Task 6: The command_line sensor

**Files:**
- Create: `homeassistant/packages/quotes.yaml`

- [ ] **Step 1: Write the package**

```yaml
# Daily quotes (spec: docs/superpowers/specs/2026-08-18-daily-quotes-design.md).
#
# pick_quote.py chooses among ZenQuotes, Affirmations.dev, and a local 5,421-quote
# dataset, and prints {"text","author"} on one line. Any API failure falls back to
# the local file, so this sensor has no visible failure mode on the wall panel —
# which matters because the Pi logs intermittent DNS errors as a matter of course.
#
# command_line rather than three rest sensors: three would each go `unavailable`
# on failure and leak error states into the card.
# VERIFIED against the Pi's HA 2026.6.3: the command_line sensor accepts EXACTLY
# these keys — command, command_timeout, json_attributes, json_attributes_path,
# name, scan_interval, value_template. `unique_id` is NOT supported here and adding
# it fails check_config. (Confirmed by inspecting the component's CONF_ constants.)
command_line:
  - sensor:
      name: Daily Quote
      command: "python3 /config/quotes/pick_quote.py"
      # The state is capped at 255 chars by HA, and the longest local quote is 208,
      # so the text fits — but attributes are the reliable place to read it from.
      value_template: "{{ value_json.text }}"
      json_attributes:
        - text
        - author
      scan_interval: 3600
      command_timeout: 15
```

- [ ] **Step 2: Deploy the script and dataset to the Pi**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
ssh kitchencom 'sudo mkdir -p /home/garrettdehart/homeassistant/quotes'
scp deploy/quotes/pick_quote.py deploy/quotes/quotes.json kitchencom:/tmp/
ssh kitchencom 'sudo cp /tmp/pick_quote.py /tmp/quotes.json /home/garrettdehart/homeassistant/quotes/ && \
  sudo chown -R garrettdehart:garrettdehart /home/garrettdehart/homeassistant/quotes && \
  sudo ls -la /home/garrettdehart/homeassistant/quotes'
```

> **Verified 2026-08-18 by probe — do not re-derive:** when HA invokes the command the working
> directory is **`/`**, not the script's directory. `__file__` still resolves correctly to
> `/config/quotes`, which is why `DATASET` is built from
> `os.path.dirname(os.path.abspath(__file__))`. A relative dataset path would break here.
> Also confirmed: the container runs scripts from a `/config` subdirectory, and `python3` is on
> PATH at `/usr/local/bin/python3`.

- [ ] **Step 3: Verify the script runs INSIDE the container**

The container is a different Python (3.14.5) from the laptop (3.9.6), so a local pass does not
prove it works there.

```bash
ssh kitchencom 'sudo docker exec homeassistant python3 /config/quotes/pick_quote.py'
```
Expected: one line of JSON with a non-empty `text`.

- [ ] **Step 4: Deploy the package and validate**

```bash
scp homeassistant/packages/quotes.yaml kitchencom:/tmp/
ssh kitchencom 'sudo cp /tmp/quotes.yaml /home/garrettdehart/homeassistant/packages/ && \
  sudo docker exec homeassistant python -m homeassistant --script check_config --config /config 2>&1 | tail -5'
```
Expected: no errors. **If check_config fails, stop and fix before restarting** — a bad package
takes down more than this sensor.

- [ ] **Step 5: Restart and confirm the entity exists**

```bash
ssh kitchencom 'sudo docker restart homeassistant >/dev/null
for i in $(seq 1 45); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:8123/); [ "$c" = "200" ] && break; sleep 2; done
sudo python3 -c "
import json
d=json.load(open(\"/home/garrettdehart/homeassistant/.storage/core.entity_registry\"))
print([e[\"entity_id\"] for e in d[\"data\"][\"entities\"] if \"daily_quote\" in e[\"entity_id\"]])
"'
```
Expected: `['sensor.daily_quote']`

- [ ] **Step 6: Commit**

```bash
git add homeassistant/packages/quotes.yaml
git commit -m "feat(quotes): command_line sensor, hourly

First command_line sensor in this repo. Chosen over three rest sensors because
each of those would go unavailable on failure and leak error states into the card;
the script handles fallback internally so this sensor always has a value."
```

---

### Task 7: The Perspective card

**Design decision (2026-08-18):** a **self-contained titled card**, styled like the existing
FAMILY and GROCERIES cards — not a full-width band, a header strip, or a clock-merged block.
Garrett's reasoning: a boxed card with a header can be dragged into any column on any dashboard,
while the other arrangements are welded to one layout. It is also stock Lovelace — no custom card
and no layout surgery.

**Title: "Perspective"** — chosen over "Daily Quote" because the quote rotates *hourly*, so
"daily" would be inaccurate.

**Initial position: the third column, below the Chores button.** Garrett intends a full layout
pass later; this is a starting point, not a final placement, and the card is movable by design.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

- [ ] **Step 1: Add the card**

Add to the THIRD grid section (the one holding the calendar and the Chores button), after the
Chores button:

```yaml
          # Perspective (spec: 2026-08-18-daily-quotes-design.md). A titled, movable
          # card by design — Garrett wants to drag it between columns and dashboards
          # during a later layout pass, so it must stay self-contained.
          #
          # Titled "Perspective", not "Daily Quote": the quote rotates hourly.
          #
          # Reads ATTRIBUTES, not the state. HA truncates state at 255 chars, and the
          # author only exists as an attribute.
          - type: markdown
            title: Perspective
            content: >-
              {% set q = state_attr('sensor.daily_quote', 'text') %}
              {% set a = state_attr('sensor.daily_quote', 'author') %}
              {% if q %}
              *"{{ q }}"*{% if a %}

              — **{{ a }}**{% endif %}
              {% else %}
              *Take a deep breath and start the day fresh.*
              {% endif %}
```

The `{% if a %}` guard is load-bearing: affirmations have no author and neither do 349 of the
5,421 local quotes, so without it the card renders a dangling em dash.

> **Template pre-verified 2026-08-18** by rendering it inside the Pi's HA container (jinja2 is
> not installed locally) against all four real cases. Confirmed output:
> quote + author renders attribution; **both author-less cases render the quote alone with NO
> dangling dash**; an unavailable sensor renders the fallback line. The guard works — if the
> panel shows a dangling dash, the template was altered, not mis-designed.

- [ ] **Step 2: Deploy and validate**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
scp homeassistant/dashboards/kitchen.yaml kitchencom:/tmp/
ssh kitchencom 'sudo cp /home/garrettdehart/homeassistant/dashboards/kitchen.yaml /home/garrettdehart/homeassistant/dashboards/kitchen.yaml.bak-prequote-$(date +%H%M)
sudo cp /tmp/kitchen.yaml /home/garrettdehart/homeassistant/dashboards/kitchen.yaml
sudo chown root:root /home/garrettdehart/homeassistant/dashboards/kitchen.yaml
sudo docker exec homeassistant python -m homeassistant --script check_config --config /config 2>&1 | tail -3'
```
Expected: no errors. **If check_config fails, stop and fix before restarting.**

- [ ] **Step 3: Restart HA and the kiosk**

```bash
ssh kitchencom 'sudo docker restart homeassistant >/dev/null
for i in $(seq 1 45); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:8123/); [ "$c" = "200" ] && break; sleep 2; done
pkill chromium; sleep 3
P=/home/garrettdehart/.config/chromium/Default
sudo -u garrettdehart rm -rf "$P/Service Worker" "$P/Cache" "$P/Code Cache"
sleep 12; pgrep -c chromium'
```

Clearing `Service Worker` is REQUIRED, not optional — a card change can otherwise look deployed
server-side and never reach the panel. Keep `Local Storage` or the panel is logged out.

- [ ] **Step 4: Confirm on the panel — HUMAN ONLY**

Look at the ViewSonic. Confirm:
- the card renders with the "Perspective" header, matching FAMILY and GROCERIES
- an author-less quote shows **no dangling dash** (wait for one, or temporarily force the
  affirmations source)
- a long quote grows the card rather than clipping

**Browser automation cannot verify this** — per project convention it nulls `customElements`,
renders nothing, and reports success while verifying nothing.

- [ ] **Step 5: Commit**

```bash
git add homeassistant/dashboards/kitchen.yaml
git commit -m "feat(quotes): Perspective card on the Kitchen dashboard

A self-contained titled card styled like FAMILY and GROCERIES, so it can be
dragged between columns and dashboards during a later layout pass. Stock Lovelace
markdown — no custom card, no layout surgery.

Titled Perspective rather than Daily Quote because the quote rotates hourly.

Reads attributes rather than state: HA truncates state at 255 chars and the author
only exists as an attribute. The {% if a %} guard is load-bearing — affirmations
and 349 of the 5,421 local quotes have no author, and without it the card renders
a dangling em dash."
```

### Task 8: Document it

**Files:**
- Create: `deploy/quotes/README.md`
- Modify: `docs/session-state/2026-08-17-chores-working-end-to-end-handoff.md`

- [ ] **Step 1: Write the README**

Cover: what the three sources are and why Quotable is excluded; the cp1252 trap and how to
re-run the conversion; how to deploy the script and dataset to the Pi; how to test a source
manually; and how to add a fourth source.

- [ ] **Step 2: Update the cold-open**

Move "Daily quotes — NOT STARTED" out of carry-forwards into a shipped section, naming the spec
and plan paths.

- [ ] **Step 3: Commit**

```bash
git add deploy/quotes/README.md docs/session-state/
git commit -m "docs(quotes): deployment README and cold-open update"
```

---

## Verification checklist

- [ ] `python3 -m pytest deploy/quotes/test_pick_quote.py -v` — 29 passed
- [ ] The blocklist rejects only a low single-digit % of the local dataset
- [ ] `python3 deploy/quotes/pick_quote.py` — one line of valid JSON, run 5× for variety
- [ ] `ssh kitchencom 'sudo docker exec homeassistant python3 /config/quotes/pick_quote.py'` — works on 3.14.5
- [ ] `check_config` exits 0 after both the package and the dashboard change
- [ ] `sensor.daily_quote` exists in the entity registry
- [ ] **A human has looked at the panel** and confirmed the quote renders, with no dangling dash
      on an author-less quote
