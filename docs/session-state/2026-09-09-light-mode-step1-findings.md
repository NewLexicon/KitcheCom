# Light mode — Step 1 (context exploration) findings

**Date:** 2026-09-09
**Branch:** `feat/time-of-day-layouts`
**Status:** Brainstorming Step 1 complete. Steps 2–9 not started. **No code written.**

This is the context-exploration output of the `superpowers:brainstorming`
checklist. The next session resumes at **Step 2 (visual companion offer)** —
which was offered and accepted, but never acted on. See §7.

---

## 1. What was asked for

Original ask: *"switch to main to convert our GUI to light mode rather than dark."*

Revised mid-session, and the revision is the operative one:

> *"I'd like to keep the option. We have dark mode now. Let's create a switch
> that brings us back to this state."*

So the goal is **not** a light-mode conversion. It is: **preserve the current
dark palette exactly as-is, add a light theme beside it, and make the panel
switch between them.** Dark is the known-good state and must survive byte-identical.

---

## 2. Decisions already locked (do not re-ask)

Four questions were put to the user and answered. These are settled input to the
design, not open items:

| Question | Answer |
|---|---|
| Theme model | **Keep both.** Light added alongside dark, not replacing it. (User reversed an initial "light only" answer — the reversal is what counts.) |
| Switch mechanism | **`input_select` + automation** calling `frontend.set_theme`. Not the HA profile page; not a panel button. |
| Light palette character | **Warm / paper tone.** Off-white and warm greys, not pure white — less kitchen glare, and the existing accent hues re-tone more naturally against it. |
| Branch | **`feat/time-of-day-layouts`**, NOT main. Reasoning in §5. |

---

## 3. The load-bearing finding: the theme file is not where the colors are

`homeassistant/themes/kitchencom.yaml` is **6 colors** and flipping it is trivial:

```yaml
KitchenCOM:
  primary-color: "#2d6cff"
  accent-color: "#2d6cff"
  primary-background-color: "#0f1115"
  secondary-background-color: "#1b2130"
  card-background-color: "#1b2130"
  primary-text-color: "#e8edf6"
  secondary-text-color: "#cdd6e6"
  app-header-background-color: "#0f1115"
  app-header-text-color: "#e8edf6"
```

**But `homeassistant/dashboards/kitchen.yaml` hardcodes ~50 more that bypass the
theme system entirely** (54 on this branch — the new time-of-day views added
four in the same dark palette). A theme switch **cannot touch these**. They are
literal hex strings inside `custom:button-card` style blocks.

Verify the count:
```bash
grep -c -iE "#[0-9a-fA-F]{6}\b|rgba?\(" homeassistant/dashboards/kitchen.yaml
```

### The four accent hues in use

Counts verified on this branch with
`grep -ci "#<hex>" homeassistant/dashboards/kitchen.yaml`:

| Hex | Reads as | Count | Used for |
|---|---|---|---|
| `#4fc3f7` | light blue | 22 | calendar accents, chore progress bars, Afternoon/Morning headers |
| `#ba68c8` | orchid | 22 | Evening view accents + its progress bars |
| `#ffd54f` | amber | 12 | secondary section borders |
| `#7e57c2` | purple | 6 | tertiary section borders |

(22 + 22 + 12 + 6 = 62 hue mentions against 54 grep-matched lines — several lines
carry two, e.g. a `border-left` shorthand plus a `color`.)

All four are **pastels chosen to glow against near-black.** They will wash out
badly on a warm-white ground and must be **re-picked by hand — a
find-and-replace will produce an unreadable panel.** Expect to darken/saturate
each toward its mid-tone.

### The inversion trap

`rgba(255,255,255,0.13)` appears 6× as the **trough** of the chore progress bars —
on this branch at lines **1200, 1254, 1308, 2057, 2111, 2165**. White-at-13%-alpha
is a subtle lift on black and **completely invisible on warm white.** These must
invert to something like `rgba(0,0,0,0.10)`, not merely be re-toned.

⚠️ Line numbers shift constantly in this file. Find them by pattern, never by
number: `grep -n "rgba(255,255,255,0.13)" homeassistant/dashboards/kitchen.yaml`

### Two YAML traps Phase 1 will walk straight into

Both from memory `markdown-card-strips-inline-css`, and both live on the exact
lines the extraction rewrites:

1. **A `#` in YAML flow style breaks the parse.**
   `card: [border-left: 4px solid #4fc3f7]` — the `#` starts a YAML comment.
   `kitchen.yaml` uses flow style in places (e.g. the
   `label: [font-size: 22px, ..., color: '#4fc3f7', ...]` lines), where the color
   is single-quoted for exactly this reason. **Any `var(--kc-*, #hex)` replacement
   in a flow-style block must stay quoted** or the dashboard fails to load.

2. **There is no card-mod and no HACS on the Pi.** Cards are hand-vendored into
   `www/community/`. `custom:button-card` `styles:` blocks are the *only* styling
   path — which is precisely why 54 colors are inline in the dashboard instead of
   in the theme. **Do not propose a card-mod-based solution; it does not exist here.**

### Custom cards are mostly fine

`custom_cards/` sources use `var(--token, fallback)` and will follow the theme on
their own. Only ~6 true literals need attention:

- `grocy-food-card/src/recipe-card.ts:185` — `linear-gradient(135deg, #2a3348, #1b2130)` placeholder
- `grocy-food-card/src/recipe-card.ts:190` — `color: #fff` on a button
- `grocy-food-card/src/shopping-card.ts:58` — `color: #fff` on a button
- `screensaver-card/src/screensaver-card.ts:746` — `background: #000` overlay
- `screensaver-card/src/screensaver-card.ts:761` — dark gradient
- `screensaver-card/src/screensaver-card.ts:763-765` — clock color + `rgba(0,0,0,.6)` shadow

**Judgment call deferred to the design:** the screensaver is arguably *supposed*
to stay dark regardless of theme (it runs in a dark kitchen at night). Do not
assume it follows the light theme — ask.

### Out of scope

`reference/ChoreOps-main/**` also matches the color grep — **91 literals across
10 YAML files.** This is vendored upstream ChoreOps source, read-only reference
(memory: `choreops-source-vendored-locally`). Not ours to theme. Excluded.

⚠️ Note the path: on **this branch** the vendored copy is `reference/ChoreOps-main/`.
The `deploy/homeassistant/dev-config/custom_components/choreops/` path exists only
on **main** — don't grep for it here, it returns nothing and looks like the files
are missing.

---

## 4. Consequent shape of the work — two phases

The switch requirement forces an extraction step that light-only would have dodged:

**Phase 1 — Extract (mechanical, zero visual change).**
Replace each literal in `kitchen.yaml` with a CSS variable, e.g.
`var(--kc-accent-cal, #4fc3f7)`. **The dark panel must look byte-identical
afterward. That equivalence is the verification gate for this phase** — if dark
shifts at all, the extraction is wrong.

**Phase 2 — Define.**
Declare those variables in both themes; pick warm-paper values for the light one.
Add the `input_select` + `frontend.set_theme` automation.

Splitting them matters because Phase 1 is reviewable by "nothing changed" and
Phase 2 is reviewable by eye. Merged, neither is checkable.

---

## 5. Why this branch, not main

`main` is checked out in a separate worktree (`.worktrees/main-merge`), so it
was never a simple checkout anyway. But the real reason:

```bash
git diff --stat main feat/time-of-day-layouts -- homeassistant/dashboards/kitchen.yaml
# 732 insertions(+), 300 deletions(-)
```

**732 unmerged insertions in the exact file that carries the color literals.**
Extracting on main means resolving a color conflict on nearly every one of those
lines at merge time, and the new Morning/Evening views would land still-hardcoded
dark — requiring a second extraction pass. Doing it here costs one pass over one
palette and delivers light mode to main already merged.

---

## 6. Verification commands for the next session

```bash
git branch --show-current    # expect feat/time-of-day-layouts — SHARED CHECKOUT, verify
grep -c -iE "#[0-9a-fA-F]{6}\b|rgba?\(" homeassistant/dashboards/kitchen.yaml   # 54
cat homeassistant/themes/kitchencom.yaml
git diff --stat main feat/time-of-day-layouts -- homeassistant/dashboards/kitchen.yaml
```

⚠️ `npm run validate:yaml` **exits 1 and that is expected.** Re-verified
2026-09-09 — exactly two errors, both `missing starting space in comment`:

```
homeassistant/dashboards/kitchen.yaml
  488:42    error    missing starting space in comment  (comments)
  1384:42   error    missing starting space in comment  (comments)
```

Those lines are `- text-shadow: 0 0 20px #4fc3f755` and `#ba68c855` — 8-digit
hex-with-alpha that yamllint reads as a `#` comment. The YAML is correct.
**Do not "fix" them, and do not read the nonzero exit as breakage caused by this
work.** Phase 1 will change *which* lines trigger it, since the extraction
rewrites those very values — expect the numbers to move, and confirm the count is
still exactly 2 and still this rule.

---

## 7. Where to resume

**Step 2 of the brainstorming checklist: the visual companion.** It was offered
and the user accepted ("OK") — then the session was ended before any visual was
produced. A palette decision is genuinely visual; this is worth honoring rather
than skipping.

Remaining checklist: 2 (visual companion) → 3 (clarifying questions — most are
answered in §2; the open one is the screensaver, §3) → 4 (2–3 approaches) →
5 (present design) → 6 (write spec to
`docs/superpowers/specs/2026-09-09-light-mode-design.md`) → 7 (self-review) →
8 (user reviews spec) → 9 (writing-plans).

**No implementation until the user approves a design.** Hard gate in the skill.

---

## 8. Open question for the user

**Should the screensaver follow the light theme, or stay dark always?** It runs
full-screen in a dark kitchen at night; a warm-white screensaver at 2am would be
a flashbang. My read is it should stay dark and be exempted, but that is the
user's call and it changes whether `screensaver-card.ts` is touched at all.
