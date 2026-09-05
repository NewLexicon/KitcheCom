#!/usr/bin/env bash
# Add photos to the KitchenCOM screensaver — resize for the panel, then upload.
#
# WHY RESIZE: the ViewSonic TD1655 is 1920x1080. Photos straight off a phone or
# camera are commonly 4000-5000px wide (~9 MB), which is ~6x more pixels than the
# panel can ever show. The Pi decodes and downscales every one of them on display.
# Resizing to 1920px long-edge costs nothing visually and cuts both file size and
# per-photo decode work dramatically.
#
# WHY NOT HEIC: iPhones shoot .heic by default. Home Assistant will happily serve
# it, but the screensaver card's SUPPORTED list is
#   .jpg .jpeg .png .webp .mp4 .webm
# (custom_cards/screensaver-card/src/screensaver-card.ts:19) and Chromium cannot
# render HEIC anyway. This script CONVERTS heic -> jpg so those photos work.
#
# Usage:
#   ./add-photos.sh ~/Pictures/kitchen-batch          # a folder
#   ./add-photos.sh ~/Pictures/a.jpg ~/Pictures/b.png # individual files
#   DRY_RUN=1 ./add-photos.sh ~/Pictures/batch        # show what would happen
#
# Uses `sips`, which is BUILT INTO macOS — nothing to install. HEIC converts
# natively (it is an Apple format). ImageMagick is used instead if present.

set -uo pipefail

PI_HOST="${PI_HOST:-kitchencom}"
PI_DIR="${PI_DIR:-/home/garrettdehart/homeassistant/media/photos}"
MAX_EDGE="${MAX_EDGE:-1920}"     # long-edge pixels; the panel is 1920x1080
QUALITY="${QUALITY:-88}"         # JPEG quality; 88 is visually lossless at this size
DRY_RUN="${DRY_RUN:-0}"

if [ $# -eq 0 ]; then
  sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

# --- locate a resizer -------------------------------------------------------
# sips ships with macOS and handles HEIC natively, so the default path needs no
# install. ImageMagick, if present, is preferred only because it strips metadata
# and honours EXIF orientation in one pass.
RESIZER=""
if command -v magick >/dev/null 2>&1; then RESIZER="magick"
elif command -v convert >/dev/null 2>&1; then RESIZER="convert"
elif command -v sips >/dev/null 2>&1; then RESIZER="sips"
else
  echo "ERROR: no image resizer found (expected sips on macOS)." >&2
  exit 1
fi
echo "Resizer: $RESIZER"

# Resize $1 -> $2. Returns non-zero on failure.
resize_one() {
  local src="$1" dst="$2"
  case "$RESIZER" in
    magick|convert)
      "$RESIZER" "$src" -auto-orient -resize "${MAX_EDGE}x${MAX_EDGE}>" \
        -strip -quality "$QUALITY" "$dst" 2>/dev/null
      ;;
    sips)
      # ⚠️ `sips -Z` UPSCALES images smaller than the target — verified 2026-09-04:
      # a 1200x800 source came out 1920x1280, bigger on disk for zero visual gain.
      # (ImageMagick's "WxH>" suffix means "only shrink"; sips has no equivalent.)
      # So measure first and only resample when the long edge actually exceeds
      # MAX_EDGE; otherwise just re-encode to jpg at the target quality.
      local lw lh long
      lw=$(sips -g pixelWidth  "$src" 2>/dev/null | awk '/pixelWidth/{print $2}')
      lh=$(sips -g pixelHeight "$src" 2>/dev/null | awk '/pixelHeight/{print $2}')
      long=$lw; [ -n "$lh" ] && [ "$lh" -gt "${long:-0}" ] 2>/dev/null && long=$lh
      if [ -n "$long" ] && [ "$long" -gt "$MAX_EDGE" ] 2>/dev/null; then
        sips -Z "$MAX_EDGE" -s format jpeg -s formatOptions "$QUALITY" \
          "$src" --out "$dst" >/dev/null 2>&1
      else
        sips -s format jpeg -s formatOptions "$QUALITY" \
          "$src" --out "$dst" >/dev/null 2>&1
      fi
      ;;
  esac
}

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# --- collect input files ----------------------------------------------------
FILES=()
for arg in "$@"; do
  if [ -d "$arg" ]; then
    while IFS= read -r f; do FILES+=("$f"); done < <(
      find "$arg" -maxdepth 1 -type f \
        \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \
           -o -iname '*.webp' -o -iname '*.heic' -o -iname '*.heif' \) | sort
    )
  elif [ -f "$arg" ]; then
    FILES+=("$arg")
  else
    echo "skip (not found): $arg" >&2
  fi
done

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No usable images found. Supported inputs: jpg jpeg png webp heic heif" >&2
  exit 1
fi

echo "Found ${#FILES[@]} image(s). Target: ${MAX_EDGE}px long edge, quality ${QUALITY}."
echo

# --- resize/convert into the staging dir ------------------------------------
n=0; skipped=0
for f in "${FILES[@]}"; do
  base="$(basename "$f")"
  stem="${base%.*}"
  # Everything lands as .jpg: universally supported by the card and by Chromium.
  out="$STAGE/${stem}.jpg"

  # Collisions: two different source files with the same stem would overwrite.
  if [ -e "$out" ]; then
    out="$STAGE/${stem}-$(date +%s)-$RANDOM.jpg"
  fi

  if ! resize_one "$f" "$out"; then
    echo "  FAILED to convert: $base" >&2
    skipped=$((skipped+1))
    continue
  fi
  n=$((n+1))
done

echo "Converted $n file(s); $skipped failed."
[ "$n" -eq 0 ] && { echo "Nothing to upload."; exit 1; }

before_kb=$(du -sk "$STAGE" | cut -f1)
echo "Staged size: $((before_kb/1024)) MB"
echo

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 — not uploading. Staged files:"
  ls -la "$STAGE" | head -20
  exit 0
fi

# --- upload -----------------------------------------------------------------
echo "Uploading to ${PI_HOST}:${PI_DIR} ..."
if ! scp -q "$STAGE"/*.jpg "${PI_HOST}:${PI_DIR}/"; then
  echo "ERROR: upload failed. Nothing on the Pi was changed by this run." >&2
  exit 1
fi

total=$(ssh "$PI_HOST" "ls -1 '$PI_DIR' | wc -l")
echo "Done. The photo folder now holds $total file(s)."
echo
echo "The screensaver re-reads the folder on EVERY activation, so new photos"
echo "appear the next time it starts — no Home Assistant restart needed."
