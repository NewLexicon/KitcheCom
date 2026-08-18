# Daily Quotes — design

**Date:** 2026-08-18
**Branch:** `feat/choreops-chores` (KitchenCOM)
**Status:** approved, not implemented

A rotating quote on the Kitchen wall panel, drawn from three sources, that never shows an error.

---

## 1. Goal

Show an inspirational quote on the Kitchen dashboard, changing **hourly**, sourced from a mix of
online APIs and a large local dataset. It must never display a broken or empty state on the wall —
the panel is a permanent kitchen fixture and an error message sitting on it reads as "the thing is
broken", which is worse than a stale quote.

Audience is the whole family (two adults, kids aged 8 and 12). Content is general secular
inspiration, taken as-is from the sources rather than hand-curated.

---

## 2. Sources

All three verified from the Pi on 2026-08-18.

| Source | Transport | Response shape | Author? |
|---|---|---|---|
| **Local `quotes.json`** | none — on disk | `{"quoteText": ..., "quoteAuthor": ...}` | mostly |
| **ZenQuotes** `https://zenquotes.io/api/random` | HTTPS ✅ | `[{"q": ..., "a": ...}]` | yes |
| **Affirmations.dev** `https://www.affirmations.dev` | HTTPS ✅ | `{"affirmation": ...}` | **no** |

### Local dataset — empirical facts

Source: `Database-Quotes-JSON-master/quotes.json` (already on disk at
`/Users/jdehart1/___Code_DEV/KitchenCOM/git/Database-Quotes-JSON-master/quotes.json`).

- **5,421 quotes** — at hourly rotation, years before a meaningful repeat
- **🔴 Encoded cp1252, NOT UTF-8.** `json.load()` fails with
  `UnicodeDecodeError: 'utf-8' codec can't decode byte 0x97`. It **must** be converted once at
  build time. Skipping this puts mojibake on the kitchen wall.
- **349 quotes (6%) have a blank author** — the card must handle this, not assume attribution
- Length: min 23, median 75, max 208 characters — all comfortable for a card
- ~0.9% (47) mention God/religion, mildly (e.g. "God always takes the simplest way" — Einstein).
  **Left unfiltered by decision** — see §7.

### Excluded: Quotable

`api.quotable.io` was in the original shortlist but is **excluded**. Its TLS certificate has
**expired**: HTTPS fails with `certificate expired (557)`, and only plain HTTP returns 200. An
expired cert usually signals an unmaintained service, and its tag-filtering did not reliably
exclude religious content anyway (sampled quotes returned The Buddha and "Talent is God given").
Re-adding it is a few lines if they ever fix the cert.

---

## 3. Architecture

Three units, each with one job.

### 3.1 `quotes.json` (data)

The local dataset, **converted cp1252 → UTF-8**, committed to the repo and deployed to the Pi at
`/config/quotes.json`. Conversion happens once, at prep time, not at runtime.

### 3.2 `pick_quote.py` (logic)

A small script the sensor shells out to. Responsibilities:

1. Choose a source at random from the three
2. If an API was chosen, fetch it with a short timeout
3. On **any** failure — timeout, non-200, malformed JSON, DNS — fall back to the local file
4. Normalise every shape to one contract: `{"text": ..., "author": ...}`
5. Print that as a single JSON line on stdout

`author` is an empty string when the source has none. The script never raises and never exits
non-zero; a fallback path always produces output.

### 3.3 `sensor.daily_quote` + the "Perspective" card (presentation)

A `command_line` sensor runs the script hourly and exposes `text` and `author` as attributes.

The card is a **self-contained titled markdown card** on the Kitchen dashboard, styled like the
existing FAMILY and GROCERIES cards. It shows the text alone when `author` is empty.

**Why a boxed card rather than a full-width band or a header strip** (decided 2026-08-18 after
mocking five arrangements): a titled card with fixed column width can be dragged into any column
on any dashboard, whereas a band or a clock-merged block is welded to one layout. Garrett intends
a full layout pass later, so portability beats visual impact here. It is also stock Lovelace — no
custom card, no layout surgery, draggable in the HA UI.

**Titled "Perspective", not "Daily Quote":** the quote rotates hourly, so "daily" is inaccurate.

**Initial position:** third column, below the Chores button. A starting point, not a final
placement.

### Why one script rather than three REST sensors

Three REST sensors would each poll independently and each go `unavailable` on failure, leaking
error states into the card and requiring template logic to paper over them. One script picking a
source keeps failure handling in a single place, makes the local fallback automatic rather than
conditional, and normalises three different response shapes at the boundary instead of in Jinja.

---

## 4. Data flow

```
hourly tick
    │
    ▼
command_line sensor ──> pick_quote.py
                            │
                            ├── random source choice
                            │
                            ├── ZenQuotes  ──┐
                            ├── Affirmations ┤── on ANY failure ──> local quotes.json
                            └── local file ──┘                            │
                                                                          ▼
                                              {"text": "...", "author": "..."}
                                                          │
                                                          ▼
                                        sensor.daily_quote (state + attributes)
                                                          │
                                                          ▼
                                          markdown card, Kitchen dashboard
```

---

## 5. Error handling

| Situation | Result on the wall |
|---|---|
| API succeeds | That quote |
| API times out / non-200 / bad JSON / no internet | A local quote — **indistinguishable to the viewer** |
| Local file missing or corrupt | Sensor keeps its previous value |
| Everything fails on first ever run | A single hardcoded default line |

The local dataset is the reason this design has no visible failure mode: there is always something
valid to show. The Pi already logs intermittent DNS errors (`metno`), so API failure is expected
routine, not an edge case.

**Timeout:** 5 seconds. A wall panel must not have a sensor blocking on a dead host.

---

## 6. Testing

1. **Unit — shape normalisation.** Each source's real response shape maps to `{text, author}`.
   Use captured fixtures, not live calls.
2. **Unit — every failure path falls back.** Timeout, non-200, malformed JSON, and DNS failure
   each produce a local quote rather than an exception.
3. **Unit — blank author.** A quote with no author yields `author: ""`, not `None` or `"null"`.
4. **Encoding.** The deployed `quotes.json` parses as UTF-8 and a known accented quote round-trips
   correctly. This guards the cp1252 trap.
5. **Integration on the Pi.** Run the script directly; confirm all three sources reachable and the
   sensor populates.
6. **Visual.** Confirm on the panel that a blank-author quote renders without a dangling dash.
   Per project convention only a human can confirm a render.

---

## 7. Open questions

- ~~Religious content unfiltered~~ **RESOLVED 2026-08-18: a blocklist was added.** A live
  ZenQuotes call returned a Bhagavad Gita quote, which showed the take-it-as-is decision had been
  made without evidence that the feed carries religious content. A whole-word blocklist now
  applies to every source, including the ~0.9% of local quotes. See plan Task 5b.
- **Long quotes.** Two local quotes exceed 200 characters. Probably fine; revisit if they look
  cramped on the card.
- **Source weighting.** Currently uniform-random across three sources, so ~1/3 of quotes are
  author-less affirmations. If that feels like too many, weight the choice.

---

## 8. Out of scope

- Screensaver overlay — quotes go on the **Kitchen dashboard only** for now
- Any UI for adding or editing quotes
- Per-person or time-of-day targeting
- Quote history or favouriting
