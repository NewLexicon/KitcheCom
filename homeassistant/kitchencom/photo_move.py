#!/usr/bin/env python3
"""Hide / unhide / list screensaver photos. Runs INSIDE the HA container.

Called by shell_command (homeassistant/packages/photos.yaml):
    photo_move.py list
    photo_move.py hide   <utf-8 filename as lowercase hex>
    photo_move.py unhide <utf-8 filename as lowercase hex>

WHY HEX: HA renders a templated shell_command and shlex-splits it, then runs it
without a shell. A filename with a space or a quote would arrive mangled or split.
Hex has nothing to split or quote. Spec: docs/superpowers/specs/
2026-10-21-sleep-settings-photos-design.md §5.

WHY A SIBLING FOLDER: screensaver-card recurses into subfolders of photos/, so
photos/hidden/ would stay in rotation. Hidden files live in photos-hidden/.

Always exits 0 and prints exactly one JSON object; the card reads stdout.
"""
import json
import os
import sys

DEFAULT_PHOTOS = "/config/media/photos"
DEFAULT_HIDDEN = "/config/media/photos-hidden"
HEX = set("0123456789abcdef")


class Rejected(Exception):
    pass


def decode_name(arg):
    if not arg or len(arg) % 2 or not set(arg) <= HEX:
        raise Rejected("filename is not lowercase hex")
    try:
        name = bytes.fromhex(arg).decode("utf-8")
    except UnicodeDecodeError:
        raise Rejected("filename is not UTF-8")
    if (not name or name.startswith(".") or "/" in name or "\\" in name
            or "\x00" in name):
        raise Rejected("not a bare filename")
    return name


def inside(folder, name):
    """Full path of name in folder, refusing anything that resolves elsewhere."""
    real_folder = os.path.realpath(folder)
    path = os.path.realpath(os.path.join(folder, name))
    if os.path.dirname(path) != real_folder:
        raise Rejected("path escapes the folder")
    return path


def move(name, src_dir, dst_dir):
    src = inside(src_dir, name)
    if not os.path.isfile(src):
        raise Rejected("no such photo")
    os.makedirs(dst_dir, exist_ok=True)
    stem, ext = os.path.splitext(name)
    for n in range(1, 1000):
        candidate = name if n == 1 else f"{stem} ({n}){ext}"
        dst = inside(dst_dir, candidate)
        try:
            # link() refuses to overwrite, so a collision can never destroy a file
            # even if two moves race. Same filesystem: both folders are under /config/media.
            os.link(src, dst)
        except FileExistsError:
            continue
        os.unlink(src)
        return candidate
    raise Rejected("too many files with that name")


def list_dir(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(
        n for n in os.listdir(folder)
        if not n.startswith(".") and os.path.isfile(os.path.join(folder, n))
    )


def run(argv, photos_dir, hidden_dir):
    try:
        if len(argv) == 2 and argv[1] == "list":
            return {"ok": True, "photos": list_dir(photos_dir), "hidden": list_dir(hidden_dir)}
        if len(argv) == 3 and argv[1] == "hide":
            return {"ok": True, "name": move(decode_name(argv[2]), photos_dir, hidden_dir)}
        if len(argv) == 3 and argv[1] == "unhide":
            return {"ok": True, "name": move(decode_name(argv[2]), hidden_dir, photos_dir)}
        raise Rejected("usage: list | hide <hex> | unhide <hex>")
    except Rejected as e:
        return {"ok": False, "error": str(e)}
    except OSError as e:
        return {"ok": False, "error": f"file error: {e.strerror}"}


def main(argv):
    out = run(
        argv,
        os.environ.get("KC_PHOTOS_DIR", DEFAULT_PHOTOS),
        os.environ.get("KC_HIDDEN_DIR", DEFAULT_HIDDEN),
    )
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
