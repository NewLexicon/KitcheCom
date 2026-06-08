# Screensaver Follow-ups — Design Spec

**Date:** 2026-06-08
**Status:** Approved (2 sections, reviewer-pass; C-1/C-2/C-3 folded)
**Branch:** `feat/screensaver-followups`, off `main` (post-PR#1-merge; screensaver card is on main)
**Extends:** the merged screensaver card `custom_cards/screensaver-card/` (8 pure fns + Lit component, 33 tests)
**Builds on:** `docs/superpowers/specs/2026-06-08-screensaver-card-rendering-design.md`

All HA/source claims verified against `reference/core-dev` + the card source. Cites inline.

---

## 1. Scope & architecture

Four independent enhancements to the merged screensaver card, preserving its **pure-functions + thin-glue** architecture and **decision-A testing** (pure logic TDD'd; glue + visuals verified via the `demo/` harness, no DOM-test deps):

1. **Query-string bugfix** — pure `stripMediaUrlQuery(url)`; applied to `selectDisplayMode` to resolve the documented deferral (`screensaver-card.ts:20-23`). Live-path exposure confirmed during impl.
2. **Shuffle-bag** — pure `shuffleOrder(items, rand)` (Fisher-Yates, injectable `rand`); glue walks the shuffled order, reshuffles on wrap. Config `shuffle: false` default. Every photo shown once per cycle before repeats.
3. **Nested-album recursion** — pure `selectSubdirectories(tree)` + a glue **bounded** recursive-browse loop. HA `browse_media` is lazy/one-level (verified `local_source.py:258-266` — "Append first level children" only; subdirs are `can_expand` stubs), so recursion = one `browse_media` call per subfolder in the glue, not a tree-walk.
4. **Ken-Burns intensity** — config `ken_burns_intensity` (0–1, two-sided clamp in `resolveConfig`) → `--kb-intensity` CSS var; `0` = static/disabled, default `0.5` ≈ current feel.

**Deferred (out of scope):** `google_photos` cloud source (large; breaks the C-3 offline-safe property), in-card upload UI (contradicts the locked "upload via HA Companion app" decision), per-type durations (video self-times via `ended`).

**Conflict status:** PR #2 (`feat/calendar-intent`, open) adds **5 files** — `homeassistant/packages/{calendar.yaml,.calendar-verify.py}`, `deploy/CALENDAR_VOICE.md`, and a spec+plan under `docs/superpowers/` — **none under `custom_cards/screensaver-card/`**, so zero overlap. This slice branches off `main` (which has the merged screensaver from PR #1). No conflict. (C-1: verified via `gh pr view 2` file list, not memory.)

## 2. Per-enhancement contracts

### New/changed pure functions (all TDD'd)

| Function | Input | Output | Contract |
|---|---|---|---|
| `stripMediaUrlQuery(url)` | `string` | `string` | Remove everything from the first `?` or `#` (query + fragment). Applied inside `selectDisplayMode` before `endsWith`. Pure. Closes the `:20-23` deferral. |
| `shuffleOrder(items, rand)` | `(T[], () => number)` | new `T[]` | Fisher-Yates using injectable `rand` (defaults to `Math.random` in glue; seeded stub in tests). Returns a NEW array; does not mutate input. |
| `selectSubdirectories(tree)` | `{ children?: BrowseChild[] }` | **`string[]`** | **Parallel predicate to `selectPlayableChildren`, NOT a mirror** — directories carry no playable `kind`, so it returns bare `media_content_id` strings. Predicate: `c.can_expand === true && c.media_content_id` (the `&& media_content_id` guard prevents emitting `undefined`, matching the leaf fn's guard at `:60`). Pure. |

### `resolveConfig` extension — explicit snake-in / camel-out (C-3)

`resolveConfig` reads **snake_case** YAML input keys and outputs **camelCase** fields (established pattern: `raw.photo_duration → photoDuration`, `:88-102`). The new fields MUST follow it:

| YAML input key (snake) | Resolved field (camel) | Resolution |
|---|---|---|
| `shuffle:` | `shuffle` | `raw.shuffle === true` (default `false`) |
| `ken_burns_intensity:` | `kenBurnsIntensity` | `n = typeof raw.ken_burns_intensity === "number" ? n : 0.5`, then **two-sided clamp** `Math.min(1, Math.max(0, n))` |

**C-2:** `kenBurnsIntensity`'s clamp is a **NEW two-sided 0–1 shape** — NOT `photoDuration`'s one-sided `Math.max(FLOOR, x)` floor (`:97`). Do not copy the floor pattern. `resolve-config.test.ts` must test **both ends + default**: `negative → 0`, `>1 → 1`, `absent → 0.5`, plus `shuffle` default `false` / explicit `true`.

### Glue changes (demo-harness verified, no DOM tests)

- **Recursive browse loop:** on activation, browse root → `selectPlayableChildren` (leaves) + `selectSubdirectories` (dirs) → for each dir, browse + accumulate into the flat `MediaItem[]`, bounded by:
  - `MAX_RECURSION_DEPTH = 3` (root + 3 subfolder levels — covers `year/event/` + one deeper)
  - `MAX_BROWSE_FOLDERS = 50` (hard cap on total `browse_media` calls per activation; each subfolder is one sequential awaited round-trip, so this bounds worst-case latency/load)
  - On bound hit: stop descending, log, use what's collected (graceful — never hang/error). These are tested constants; the cutoff decision gets a unit test where extractable.
- **Shuffle integration:** if `cfg.shuffle`, apply `shuffleOrder` to the accumulated items after browsing; reshuffle on wrap. **Polish (note/defer):** reshuffle-on-wrap should avoid placing the just-shown item first — implement if cheap, else explicitly defer (not load-bearing).
- **Ken-Burns:** set `--kb-intensity` CSS custom property from `cfg.kenBurnsIntensity` on the overlay; the `kb` keyframes scale their transform by it (`0` → no movement).

### Tests added
`strip-url.test.ts`, `shuffle.test.ts`, `subdirectories.test.ts` (incl. `can_expand===true` kept, `can_expand===false` skipped, missing-`media_content_id` skipped), + extended `resolve-config.test.ts`.

## 3. Verification bar
- All new pure functions unit-tested (TDD); existing 33 tests stay green; `npm run typecheck` 0; `npm run build` emits dist.
- Recursion-bound cutoff unit-tested where extractable; the async recursive loop + shuffle integration + Ken-Burns visual verified via the `demo/` harness (mock multi-level browse; toggle shuffle; eyeball intensity 0 vs 0.5 vs 1).
- yamllint on `homeassistant/` stays clean (dashboard untouched, but the slice may add config knobs to the dashboard card entry — if so, validate).

## 4. Carry-forwards / deferred
- `google_photos` cloud source, in-card upload UI, per-type durations — each its own future slice.
- Shuffle reshuffle-on-wrap "no immediate repeat" polish if deferred.
- Real Pi-5 codec validation (M-8) still hardware-phase.
