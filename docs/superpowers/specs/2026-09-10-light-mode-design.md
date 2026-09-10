# Light mode — design

**Date:** 2026-09-10
**Branch:** `feat/time-of-day-layouts`
**Status:** Design approved. Implementation plan not yet written.
**Supersedes the open questions in:** `docs/session-state/2026-09-09-light-mode-step1-findings.md`

---

## 1. Goal

Add a light theme **beside** the current dark one and let the panel switch
between them. This is **not** a light-mode conversion.

Dark is the known-good state and must survive **byte-identical**. That constraint
drives every structural decision below.

---

## 2. Locked decisions

Five. The first four were settled 2026-09-09; the fifth on 2026-09-10.
**Do not re-ask these.**

| | Decision |
|---|---|
| Theme model | **Both.** Light added alongside dark, not replacing it. |
| Switch | **`input_select` + automation** calling `frontend.set_theme`. Not the HA profile page. |
| Light palette | **D · Mist** — cool light-lavender ground, **white cards**, indigo-forward accents. |
| Branch | **`feat/time-of-day-layouts`**, not main. |
| Screensaver | **Exempt. Stays dark always.** Zero code — see §7. |

### 2.1 Why Mist, and what was rejected

Three warm-paper candidates (Linen / Parchment / Cream) were shown first and
**rejected** — the user's reference image was cool-neutral, and the cream headers
specifically were called out.

Three cool-neutral candidates followed. **D · Mist** was chosen over E · Loop and
F · Slate. The distinction is structural, not chromatic:

- **D keeps the existing card anatomy** — the 4–5px coloured `border-left`. Pure
  colour swap.
- **E/F replaced it** with a hairline border, soft shadow, and a tinted icon
  square (matching the reference more literally).

E/F were rejected because restructuring ~50 `button-card` blocks would mean light
and dark are no longer the same layout with different values — and matching dark
to it would have broken the byte-identical rule. **D preserves all four earlier
decisions; E/F would have reversed one.**

---

## 3. Architecture

```
input_select.kitchen_theme  ──▶  automation  ──▶  frontend.set_theme
   (Dark | Light)                                        │
                                                         ▼
                            themes/  kitchencom.yaml         (dark, +20 vars)
                                     kitchencom-light.yaml   (new)
                                              │
                                              ▼
                            kitchen.yaml  ──  80 literals → var(--kc-*, <dark fallback>)
```

`configuration.yaml:24` already does `!include_dir_merge_named themes`, so a new
theme file is picked up **with no config edit**.

### 3.1 The fallback is the safety mechanism

Every extracted literal becomes:

```yaml
- color: var(--kc-hero-fg, #4fc3f7)
```

The current dark value stays inline as the fallback. If a variable is ever
undefined — theme fails to load, typo in a name, user on the default theme — the
panel renders **exactly as it does today**. This is what makes Phase 1
provably zero-risk, and it is non-negotiable: see the §8 check for bare `var()`.

### 3.2 Components

| Component | File | Change |
|---|---|---|
| Switch entity + automation | `homeassistant/packages/theme.yaml` | **new** |
| Light palette | `homeassistant/themes/kitchencom-light.yaml` | **new** |
| Dark palette | `homeassistant/themes/kitchencom.yaml` | +20 var definitions; **0 changes to the 9 existing keys** |
| Panel | `homeassistant/dashboards/kitchen.yaml` | 80 literals → `var()` |
| Screensaver | `custom_cards/screensaver-card/src/screensaver-card.ts` | **none** |

---

## 4. The extraction surface — 80 literals

Measured directly from `kitchen.yaml` (2423 lines) on 2026-09-10.
**This corrects the findings doc's estimate of ~54.**

| Group | Sites | Line span | Treatment |
|---|---:|---|---|
| `hero` (`#4fc3f7` + `…22` + `…55`) | 22 | 476–1336 | re-pick |
| `remind` (`#ba68c8` + `…22` + `…55`) | 22 | 1372–2193 | re-pick |
| `chore` (`#ffd54f` + `…22`) | 12 | 94–1404 | re-pick |
| `weather` (`#7e57c2` + `…22`) | 6 | 650–1556 | re-pick |
| `surface` (`#ffffff0d` ×6, `#ffffff08` ×6) | 12 | 1146–2173 | **INVERT** |
| `trough` (`rgba(255,255,255,0.13)`) | 6 | 1200–2165 | **INVERT** |
| **Total** | **80** | | |

### 4.1 Eighteen values invert; they do not re-tone

The findings doc flagged only the 6 troughs. It is **18**.

The 12 `#ffffff0d` / `#ffffff08` values are **card backgrounds** — white at very
low alpha, *lifting* a card off a near-black page. On a light ground that trick
is invisible. Light needs solid white *above* a grey page, which is precisely the
Mist look. Re-toning these instead of inverting them yields cards that vanish.

### 4.2 Twelve of the 80 live inside JavaScript, not YAML

`kitchen.yaml` contains **140 `[[[ ]]]` JS template blocks**. Twelve colour
literals sit inside them — **all 6 troughs, plus 6 accents** — building HTML
strings at render time:

```yaml
bar: >
  [[[ var pct = Number(entity.state);
      return `<div style="width:100%;height:6px;border-radius:3px;
        background:rgba(255,255,255,0.13);overflow:hidden;">
        <div style="width:${pct}%;height:100%;
        background:#4fc3f7;"></div></div>`; ]]]
```

`var(--kc-*)` resolves normally here — it lands in a real `style` attribute. But
**backticks and `${}` are live syntax**, so this is a separate substitution site
with its own escaping rules. It is the most likely place for a mechanical pass to
break the panel silently. Treat these 12 as their own work item, not as part of
the bulk edit.

---

## 5. Variable scheme — 20 variables

**Named by role, never by colour.** `--kc-hero-fg`, not `--kc-blue`. Roles
survive a palette change; colour names become lies the moment you re-tone.

### Group A — Accents (10 vars)

| Var | Dark (today) | Mist (light) |
|---|---|---|
| `--kc-hero-fg` / `-tint` / `-glow` | `#4fc3f7` / `#4fc3f722` / `#4fc3f755` | `#3730a3` / `#4f46e51f` / **`none`** |
| `--kc-remind-fg` / `-tint` / `-glow` | `#ba68c8` / `#ba68c822` / `#ba68c855` | `#7e22ce` / `#9333ea1f` / **`none`** |
| `--kc-chore-fg` / `-tint` | `#ffd54f` / `#ffd54f22` | `#b45309` / `#d977061f` |
| `--kc-weather-fg` / `-tint` | `#7e57c2` / `#7e57c222` | `#4f46e5` / `#6366f11f` |

**Glows go to `none` in light.** `text-shadow: 0 0 20px <accent>` is a dark-mode
idiom; on a white card it renders as a dirty smudge.

**Only `hero` and `remind` get a glow var — 2, not 4.** Those are the only two
glow sites in the file (`kitchen.yaml:488` and `:1384`). Defining
`--kc-chore-glow` / `--kc-weather-glow` "for symmetry" would leave them
**defined but unused**, and check 4's `diff` would fail on a correct
implementation. If a glow is ever added to chore or weather, add the var then.

### Group B — Neutral surfaces (2 vars, inverting)

| Var | Dark | Mist |
|---|---|---|
| `--kc-surface-1` | `#ffffff0d` | `#ffffff` |
| `--kc-surface-2` | `#ffffff08` | `#ffffff` |

Both map to solid white in Mist. They stay **separate variables** even though
they share a light value — they are distinct roles in dark and collapsing them
would lose that on any future palette.

### Group C — Trough (2 vars, inverting)

| Var | Dark | Mist |
|---|---|---|
| `--kc-trough` | `rgba(255,255,255,0.13)` | `#e4e4f0` |
| `--kc-trough-fill` | `#4fc3f7` | `#4f46e5` |

### Group D — Text and page (6 vars)

Body text, secondary text, page ground, card border, card shadow, and header
ground — wired to the theme's existing `primary-text-color` family so they stay
consistent with HA's own chrome.

**Mist ground values:** page `#f6f6fb`, card `#ffffff`, border `#dcdcea`,
shadow `0 1px 3px rgba(30,30,60,.07)`, body text `#5b5b73`.

---

## 6. The mechanism is already proven in this file

`kitchen.yaml` **already uses `var()` in 97 places** — `var(--error-color)`,
`var(--primary-color)` — inside `button-card` style blocks running on the panel
today (first at line 137).

Phase 1 is therefore not introducing a new technique. Two consequences:

1. **Flow-style is safe.** Line 137 is
   `card: [border: 2px solid var(--error-color)]` — a `var()` in YAML flow style,
   unquoted, working. The findings doc's warning about `#` starting a comment in
   flow style **does not apply to `var()`**, which contains no `#`.
2. **Extraction removes the lint hazard rather than moving it.** See §8.1.

---

## 7. Screensaver: exempt, and free

`screensaver-card.ts` hardcodes its own dark palette (`#0f1115`, `#1b2130`,
`#e8edf6`, `#243657`) and **uses no HA theme variables** — its only `var()` is
`--kb-intensity`, an animation parameter.

It is therefore **already theme-independent**. Keeping it dark requires **no
guard, no exemption logic, and no code** — only the discipline not to touch the
file. Verified by the §8 check that its diff stays empty.

Rationale: it runs full-screen in a dark kitchen at night; a white screensaver at
2am would be a flashbang.

---

## 8. Two phases, hard gate between

### Phase 1 — Extract (zero visual change)

Replace all 80 literals with `var(--kc-*, <current dark value>)` and define the
20 vars in `kitchencom.yaml` at their **current** values.

**No light theme exists yet.** If anything looks different, it is a Phase 1 bug,
diagnosed with no light colour present to confuse it.

**Gate — all seven must pass:**

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | No literals left | `grep -oiE '#[0-9a-f]{3,8}\|rgba?\(' homeassistant/dashboards/kitchen.yaml \| wc -l` | 80 → **0** |
| 2 | Every var has a fallback | `grep -o 'var(--kc-[a-z0-9-]*)' homeassistant/dashboards/kitchen.yaml \| wc -l` | **0** |
| 3 | Lint improves | `npm run validate:yaml` | 2 errors → **0** |
| 4 | Vars balance | used in `kitchen.yaml` vs. defined in `kitchencom.yaml` | **20 = 20** |
| 5 | Cards build | `cd custom_cards/tod-autonav-card && npm test` | **14 pass** |
| 6 | Screensaver untouched | `git diff --stat -- custom_cards/screensaver-card` | **empty** |
| 7 | Visual | panel at the kitchen, all 5 views | **indistinguishable** |

**Check 2 is the important one.** A bare `var(--kc-hero-fg)` with no fallback
renders *nothing* when undefined — a blank card, not an error. The regex matches
only var references containing no comma; `var(--kc-hero-fg, #4fc3f7)` is
correctly ignored, as is `var(--error-color)` (not a `kc` var). Validated
against a fixture during design.

**Check 4** compares the two sides explicitly:

```bash
# distinct kc vars referenced by the panel
grep -o 'var(--kc-[a-z0-9-]*' homeassistant/dashboards/kitchen.yaml \
  | sed 's/var(--//' | sort -u > /tmp/used
# kc keys defined in the dark theme
grep -oE '^\s+kc-[a-z0-9-]+' homeassistant/themes/kitchencom.yaml \
  | tr -d ' ' | sort -u > /tmp/defined
diff /tmp/used /tmp/defined && echo "BALANCED"
```

Expect `BALANCED` and 20 lines in each file. A var used but not defined silently
falls back (invisible in dark, wrong in light); one defined but unused is dead
weight.

#### 8.1 Lint goes to zero — a correction to the cold-open

Baseline captured 2026-09-10:

```
homeassistant/dashboards/kitchen.yaml
  488:42    error    missing starting space in comment  (comments)
  1384:42   error    missing starting space in comment  (comments)
```

Both are the `text-shadow: 0 0 20px #…55` glow lines — yamllint reads
hex-with-alpha as a comment. Both become `var(--kc-*-glow, …)`, which contains no
`#`.

The cold-open predicted these errors would **move** to new line numbers. They
will instead **disappear**. This gives Phase 1 a sharper signal than "looks the
same": **if `validate:yaml` is not clean, extraction missed a glow site.**

> Note: `npm run validate:yaml` currently **exits 0** despite printing 2 errors.
> Do not use exit status as the gate — compare the printed error list.

### Phase 2 — Define

Only after Phase 1's gate passes:

1. `themes/kitchencom-light.yaml` — the 20 vars at Mist values, plus the 9 base
   HA keys (`primary-background-color` etc.) re-toned for light.
2. `packages/theme.yaml` — `input_select.kitchen_theme` (options `Dark`,
   `Light`) and an automation on its state change calling `frontend.set_theme`.
3. A control on the panel to set the `input_select`.

Phase 2 touches **two new files plus one small package**, so any regression is
provably attributable to the light theme, never to the extraction.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A missed literal leaves a dark-tuned colour on a white card | Check 1 counts to zero |
| A bare `var()` renders a blank card | Check 2; every reference carries the dark fallback |
| JS-block substitution breaks a template literal | The 12 JS sites are a separate work item (§4.2); check 5 + visual |
| Accents unreadable on white | Mist values measured: **min 5.02:1** on `#ffffff`, all AA-clear |
| Dark drifts during extraction | Check 7 is the gate; dark theme's 9 existing keys are never edited |
| `kitchen.yaml` drift vs. the Pi | **`deploy/deploy-dashboard.sh` enforces this** — it refuses to deploy unless the live file matches a recorded baseline, backs up on both ends, runs `check_config`, and rolls back on failure. See §11. |

### 9.1 Accessibility note (pre-existing, not introduced)

Measured during design: the **current dark** theme's `#7e57c2` (weather) sits at
**3.63:1** on `#0f1115` — below the 4.5:1 AA floor. It is the weakest colour on
the panel today.

Mist's minimum is **5.02:1**, so light mode will be the *more* legible theme.
**No fix is proposed** — dark must stay byte-identical, and this predates the
work. Recorded so it is not mistaken for a light-mode regression.

---

## 10. Out of scope

- Any change to dark's appearance, including the 9 existing theme keys and the
  3.63:1 violet.
- `screensaver-card.ts`.
- `reference/ChoreOps-main/` — read-only vendored upstream, 91 colour literals
  across 10 files. **Not ours to theme.**
- Auto-switching the theme by time of day. The `input_select` is manual.
  (`sensor.kitchen_time_of_day` already exists and could drive it later — a
  natural V2, deliberately not now.)
- The E/F card restructure (hairline border + tinted icon square).


---

## 11. Deploying `kitchen.yaml`

There was **no deploy script** before this work — every update was a manual
`scp`. That is the root cause of the 2026-09-08 incident in which the live file
was found 1932 lines ahead of the repo. The safety check existed only as a habit.

`deploy/deploy-dashboard.sh` replaces the habit with a mechanism.

| Stage | Behaviour |
|---|---|
| 1. Reachability | `ssh -o ConnectTimeout=8`; on failure prints the corporate-network check (macOS has no `timeout(1)`) |
| 2. Drift gate | md5 live vs. repo vs. recorded baseline. **Unknown drift = exit 2, nothing written** |
| 3. Backup | Pi-side `backups/kitchen.yaml.bak-<ts>` **and** a repo-side `docs/pi-snapshots/` copy |
| 4. Deploy | `scp`, then re-hash and roll back if the copy is not byte-exact |
| 5. Validate | `docker exec homeassistant python -m homeassistant --script check_config` — **rolls back on failure** |
| 6. Reload | none needed |

Modes: `--check` (compare only), `--adopt` (bless live as baseline), `--pull`
(take the Pi's version into the repo).

### 11.1 Facts established while building it

- **HA runs as a Docker container; there is no `ha` CLI on this Pi.** The
  reload/validate path is `docker exec`, not `ha core restart`.
- **`~/homeassistant` is bind-mounted to `/config`**, so an `scp` to the host is
  immediately visible inside the container.
- **`kitchen.yaml` is a `mode: yaml` dashboard** (`configuration.yaml:29-30`),
  which HA re-reads per browser fetch. **No restart is required to deploy it** —
  the panel picks it up on next load. This makes Phase 1's
  extract-verify-iterate loop cheap.
- **The baseline file is gitignored** — it is per-machine state, not shared
  config.
- **As of 2026-09-10 the repo and Pi are byte-identical** (md5
  `eae7034812b8065e2b8e19da856b9325`, 2423 lines, 80 colour literals on both).
  The extraction starts from a clean, verified base.

### 11.2 Test status

Verified live: reachability, drift detection, the **drift refusal** (exit 2,
nothing written), `--adopt`, md5 on both ends, and `check_config` (exit 0).

**Not yet exercised:** the write stages (3-6) against the live panel, and the
`check_config` rollback branch — the smoke test was declined as it would have
written to the live dashboard. **Run the first real deploy with a human at the
panel, with `--check` immediately beforehand.**
