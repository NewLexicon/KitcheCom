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
