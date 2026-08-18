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
