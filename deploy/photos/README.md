# Screensaver photos

Everything about the photos the kitchen panel shows when idle. Verified against the
live Pi 2026-09-04.

## Where they live

```
kitchencom:/home/garrettdehart/homeassistant/media/photos/
```

**Currently 122 photos, 207 MB.**

Two things make this path work, and both are easy to break:

- `configuration.yaml` maps `media_dirs: local: /config/media`. The container's default
  media root is `/media`, which is **empty** (only `/config` is bind-mounted) — that
  mismatch is what once made the screensaver render black.
- The card builds `media-source://media_source/local/<media_path>`, and `kitchen.yaml`
  sets `media_path: photos`. So photos **must** sit in a subfolder, not directly in
  `/config/media`.

The folder is writable as `garrettdehart` — **no `sudo` needed** to add or remove.

## Adding photos

```bash
./deploy/photos/add-photos.sh ~/Pictures/some-folder     # a whole folder
./deploy/photos/add-photos.sh ~/Pictures/a.heic          # individual files
DRY_RUN=1 ./deploy/photos/add-photos.sh ~/Pictures/x     # preview, uploads nothing
```

It resizes to 1920px long edge, converts anything (including HEIC) to `.jpg`, and
uploads. Uses `sips`, built into macOS — nothing to install.

Manual equivalent, if you'd rather:

```bash
scp ~/Pictures/*.jpg kitchencom:/home/garrettdehart/homeassistant/media/photos/
```

## Removing photos

```bash
ssh kitchencom 'rm /home/garrettdehart/homeassistant/media/photos/NAME.jpg'

# see the largest first
ssh kitchencom 'ls -lS /home/garrettdehart/homeassistant/media/photos | head -20'
```

**New and removed photos take effect on the next screensaver activation** — the card
re-browses the folder every time it starts. No Home Assistant restart, no kiosk restart.

## What formats work

The card's own list (`custom_cards/screensaver-card/src/screensaver-card.ts:19`):

```
.jpg  .jpeg  .png  .webp  .mp4  .webm
```

Matching is **case-insensitive**, so `.JPG` is fine — 13 of the current 122 are uppercase.

| Format | Works? | Notes |
|---|---|---|
| `.jpg` / `.jpeg` | ✅ | What everything should be |
| `.png` | ✅ | Fine, but larger than jpg for photos |
| `.webp` | ✅ | Smallest, fully supported |
| `.mp4` / `.webm` | ✅ | Video is supported by the card |
| **`.heic`** | ❌ | **iPhone default.** Home Assistant serves it, but the card filters it out and Chromium can't decode it. **Convert to jpg** — `add-photos.sh` does this automatically. |
| `.gif`, `.tiff`, `.bmp` | ❌ | HA would serve them; the card's list excludes them |

Home Assistant additionally skips any file whose extension yields no image/video MIME
type, and any **dotfile** (`._foo.jpg` from a Mac-formatted drive is silently ignored —
which is convenient, since those are metadata, not photos).

## Size limits

There is **no hard limit** on photo count or file size — not in the card, not in Home
Assistant's `local_source`. Free disk is 99 GB, so a few hundred photos is nothing.

The practical limits are different:

- **The panel is 1920×1080.** The current largest photos are ~9 MB at 4819×3247 — about
  6× more pixels than the screen can display. The Pi decodes and downscales every one on
  display. Resizing to 1920px long edge is visually identical and much cheaper.
- **A full pass takes a long time.** At `photo_duration: 10`:

  | Photos | One full pass |
  |---|---|
  | 122 (today) | **20 minutes** |
  | 322 (+200) | **54 minutes** |
  | 422 (+300) | **70 minutes** |

## ⚠️ Why you only ever see "some of" the photos

Two behaviours combine, and neither is a bug or a limit:

1. **The order is reshuffled on every activation.** `_startLoop` calls
   `shuffleOrder(items, Math.random)` and resets to index 0 each time the screensaver
   starts (`screensaver-card.ts:456`). It does *not* resume where it left off.
2. **A full pass takes 20 minutes**, but the screensaver only starts after **30 minutes**
   idle (`timer.kitchen_inactivity`), and any touch ends it.

So unless the panel sits untouched for well over half an hour, you only ever see the
first slice of each new random order. Adding 200 more photos makes this *more*
pronounced, not less — a full pass would take 54 minutes.

**If you want more of the collection to actually surface, lower `photo_duration`**
(in `kitchen.yaml`, on the `custom:screensaver-card`). At 5s a 322-photo pass halves to
27 minutes. Changing photo count alone won't help.

## Verifying

```bash
# how many are on the Pi
ssh kitchencom 'ls -1 /home/garrettdehart/homeassistant/media/photos | wc -l'

# anything that ISN'T a supported extension (should print nothing)
ssh kitchencom 'cd /home/garrettdehart/homeassistant/media/photos && \
  ls -1 | grep -viE "\.(jpg|jpeg|png|webp|mp4|webm)$"'

# confirm real image data, not just a hopeful extension
ssh kitchencom 'cd /home/garrettdehart/homeassistant/media/photos && \
  file -b * | sed "s/,.*//" | sort | uniq -c'
```
