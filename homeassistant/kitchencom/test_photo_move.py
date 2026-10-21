import os

import pytest

import photo_move as pm


def hx(name):
    return name.encode("utf-8").hex()


@pytest.fixture
def dirs(tmp_path):
    photos = tmp_path / "photos"
    hidden = tmp_path / "photos-hidden"
    photos.mkdir()
    return photos, hidden


def run(dirs, *args):
    photos, hidden = dirs
    return pm.run(["photo_move.py", *args], str(photos), str(hidden))


@pytest.mark.parametrize("name", [
    "a.jpg",
    "Rowan's birthday.jpg",
    'the "best" day.jpg',
    "café.jpg",
    "🐟 fishy.jpg",
    "50%off.jpg",
])
def test_hide_moves_any_real_filename_to_the_sibling_folder(dirs, name):
    photos, hidden = dirs
    (photos / name).write_bytes(b"x")
    out = run(dirs, "hide", hx(name))
    assert out == {"ok": True, "name": name}
    assert not (photos / name).exists()
    assert (hidden / name).read_bytes() == b"x"


def test_unhide_restores(dirs):
    photos, hidden = dirs
    hidden.mkdir()
    (hidden / "a.jpg").write_bytes(b"x")
    assert run(dirs, "unhide", hx("a.jpg")) == {"ok": True, "name": "a.jpg"}
    assert (photos / "a.jpg").exists()


def test_unhide_collision_gets_a_suffix_and_never_overwrites(dirs):
    photos, hidden = dirs
    hidden.mkdir()
    (photos / "a.jpg").write_bytes(b"keep")
    (photos / "a (2).jpg").write_bytes(b"keep2")
    (hidden / "a.jpg").write_bytes(b"back")
    assert run(dirs, "unhide", hx("a.jpg")) == {"ok": True, "name": "a (3).jpg"}
    assert (photos / "a.jpg").read_bytes() == b"keep"
    assert (photos / "a (2).jpg").read_bytes() == b"keep2"
    assert (photos / "a (3).jpg").read_bytes() == b"back"


@pytest.mark.parametrize("arg", [
    "",              # empty
    "6",             # odd length
    "ZZ",            # not hex
    "6A",            # uppercase: the card only emits lowercase
    "ff",            # valid hex, invalid UTF-8
])
def test_rejects_bad_hex(dirs, arg):
    out = run(dirs, "hide", arg)
    assert out["ok"] is False


@pytest.mark.parametrize("name", ["a/b.jpg", "..", ".hidden.jpg", "a\\b.jpg", "a\x00.jpg"])
def test_rejects_names_that_are_not_a_bare_filename(dirs, name):
    out = run(dirs, "hide", hx(name))
    assert out["ok"] is False


def test_rejects_a_symlink_that_escapes_the_folder(dirs, tmp_path):
    photos, _ = dirs
    outside = tmp_path / "secret.jpg"
    outside.write_bytes(b"s")
    os.symlink(outside, photos / "evil.jpg")
    out = run(dirs, "hide", hx("evil.jpg"))
    assert out["ok"] is False
    assert outside.exists()


def test_missing_photo_is_an_error_not_a_crash(dirs):
    assert run(dirs, "hide", hx("nope.jpg")) == {"ok": False, "error": "no such photo"}


def test_extra_arguments_are_refused(dirs):
    # shell_command shlex-splits the rendered template; a caller smuggling a space
    # into name_hex arrives here as extra argv entries.
    assert run(dirs, "hide", "61", "62")["ok"] is False


def test_list_returns_sorted_files_and_skips_dotfiles_and_folders(dirs):
    photos, _ = dirs
    for n in ["b.jpg", "a.HEIC", ".DS_Store"]:
        (photos / n).write_bytes(b"x")
    (photos / "trip").mkdir()
    assert run(dirs, "list") == {"ok": True, "photos": ["a.HEIC", "b.jpg"], "hidden": []}


def test_main_always_exits_zero_and_prints_json(dirs, capsys, monkeypatch):
    photos, hidden = dirs
    monkeypatch.setenv("KC_PHOTOS_DIR", str(photos))
    monkeypatch.setenv("KC_HIDDEN_DIR", str(hidden))
    assert pm.main(["photo_move.py", "hide", "zz"]) == 0
    assert '"ok": false' in capsys.readouterr().out
