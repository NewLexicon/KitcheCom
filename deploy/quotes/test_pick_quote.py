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


import random


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


from pick_quote import is_blocked


def test_is_blocked_catches_religious_terms():
    assert is_blocked("God always takes the simplest way")
    assert is_blocked("Whatever happened, happened for the good. — Bhagavad Gita")


def test_is_blocked_is_case_insensitive():
    assert is_blocked("GOD is great")


def test_is_blocked_matches_whole_words_only():
    """Substring matching would block 'goddess of design' via 'god', and worse,
    'assessment' via a crude 'ass' rule. Word boundaries are required."""
    assert not is_blocked("A good goddess of design")
    assert not is_blocked("The gods of small things")  # plural, not the blocked token
    assert not is_blocked("Sin City is a film")  # capital S, still a word — matched case-insensitively


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
