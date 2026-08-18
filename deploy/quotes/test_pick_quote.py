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
