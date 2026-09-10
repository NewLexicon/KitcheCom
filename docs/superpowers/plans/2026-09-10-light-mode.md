# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light theme ("Mist") beside the existing dark one, switchable from the panel, without changing dark's appearance at all.

**Architecture:** Two phases with a hard gate. Phase 1 extracts all 80 hardcoded colour literals in `kitchen.yaml` into `var(--kc-*, <current dark value>)` references and defines 14 role-named variables in the existing dark theme at their present values — a pure refactor with **zero visual change**. Phase 2 adds a second theme file with light values plus an `input_select` and automation to switch between them. Every `var()` keeps its dark value as an inline fallback, so an undefined variable renders today's panel rather than a blank card.

**Tech Stack:** Home Assistant (Docker, `ghcr.io/home-assistant/home-assistant:stable`) on a Pi 5; Lovelace YAML-mode dashboard; `custom:button-card`; yamllint; bash/ssh deploy.

**Spec:** `/Users/jdehart1/___Code_DEV/KitchenCOM/docs/superpowers/specs/2026-09-10-light-mode-design.md`

---

## Before you start — read these

**You are working on branch `feat/time-of-day-layouts`.** Multiple sessions share
this checkout. Run `git branch --show-current` before **every** commit.

**`kitchen.yaml` is a contested file.** It is edited live on the Pi as well as in
this repo. On 2026-09-08 the live copy was found 1932 lines ahead of the repo.
**Never `scp` it by hand.** Use `deploy/deploy-dashboard.sh`, which refuses to
deploy on drift. As of 2026-09-10 repo and Pi are byte-identical
(md5 `eae7034812b8065e2b8e19da856b9325`, 2423 lines).

**There is no card-mod and no HACS on this Pi**, and markdown cards strip inline
CSS. `custom:button-card` style blocks are the only styling path. Do not propose
alternatives.

**`npm run validate:yaml` currently prints 2 errors and still exits 0.** Compare
the printed error list, never the exit status.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `homeassistant/dashboards/kitchen.yaml` | Panel markup. 80 literals → `var()` | 1–6 |
| `homeassistant/themes/kitchencom.yaml` | Dark palette. **+14 `kc-*` keys, existing 9 untouched** | 1 |
| `homeassistant/themes/kitchencom-light.yaml` | Light ("Mist") palette | 8 |
| `homeassistant/packages/theme.yaml` | `input_select` + switching automation | 9 |
| `deploy/checks/check-theme-vars.sh` | Gate checks 1, 2, 4 as one runnable script | 1 |

Phase 1 is Tasks 1–7. Phase 2 is Tasks 8–10.

**Why the extraction is split across five tasks (2–6) rather than done in one
pass:** each accent group is independently verifiable, and the JS-block sites
(Task 6) need different handling from the YAML style lists. A single 80-site
edit that breaks the panel gives you no way to bisect.

---

## Task 1: Verification harness and the 14 dark variables

Build the gate *first*, so every later task can prove itself.

**Files:**
- Create: `deploy/checks/check-theme-vars.sh`
- Modify: `homeassistant/themes/kitchencom.yaml`

- [ ] **Step 1: Write the check script (it must FAIL now)**

Create `deploy/checks/check-theme-vars.sh`:

```bash
#!/usr/bin/env bash
# Phase 1 gate for the light-mode extraction. Run from the repo root.
#
# Checks 1, 2 and 4 from the design spec (§8). Checks 3, 5, 6, 7 are separate
# commands the plan runs directly.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PANEL="$ROOT/homeassistant/dashboards/kitchen.yaml"
THEME="$ROOT/homeassistant/themes/kitchencom.yaml"
FAIL=0

ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=1; }

# Without these guards a missing/renamed file makes every check read empty and
# the gate reports PASS — the one failure mode this gate must never have, since
# Tasks 2-7 rely on it to prove dark is unchanged. Mirrors deploy-dashboard.sh.
[ -f "$PANEL" ] || { bad "missing panel file: $PANEL"; exit 1; }
[ -f "$THEME" ] || { bad "missing theme file: $THEME"; exit 1; }

echo "Check 1 — no UNWRAPPED colour literals left in the panel"
# Every extracted site keeps its dark value as a var() fallback, so a naive
# literal count can never reach zero. Strip the compliant ones first, then
# anything still matching is a literal that was missed.
LIT=$(sed 's/var(--kc-[a-z0-9-]*, *\([^)]*\))/VAR/g' "$PANEL" \
      | grep -oiE '#[0-9a-f]{3,8}|rgba?\(' | wc -l | tr -d ' ')
if [ "$LIT" -eq 0 ]; then ok "0 unwrapped literals"
else
  bad "$LIT unwrapped literals remain:"
  sed 's/var(--kc-[a-z0-9-]*, *\([^)]*\))/VAR/g' "$PANEL" \
    | grep -noiE '#[0-9a-f]{3,8}|rgba?\(' | head -20 | sed 's/^/      /'
fi

echo "Check 2 — every kc var carries a fallback"
BARE=$(grep -o 'var(--kc-[a-z0-9-]*)' "$PANEL" | wc -l | tr -d ' ')
if [ "$BARE" -eq 0 ]; then ok "0 bare vars"
else
  bad "$BARE bare var(--kc-*) with no fallback:"
  grep -no 'var(--kc-[a-z0-9-]*)' "$PANEL" | sed 's/^/      /'
fi

echo "Check 4 — vars used == vars defined"
grep -o 'var(--kc-[a-z0-9-]*' "$PANEL" | sed 's/var(--//' | sort -u > /tmp/kc-used
grep -oE '^[[:space:]]+kc-[a-z0-9-]+' "$THEME" | tr -d ' ' | sort -u > /tmp/kc-defined
U=$(wc -l < /tmp/kc-used | tr -d ' '); D=$(wc -l < /tmp/kc-defined | tr -d ' ')
if diff -q /tmp/kc-used /tmp/kc-defined >/dev/null; then
  ok "balanced ($U used, $D defined)"
else
  bad "mismatch ($U used, $D defined):"
  diff /tmp/kc-used /tmp/kc-defined | sed 's/^/      /'
fi

echo
[ "$FAIL" -eq 0 ] && echo "PHASE 1 GATE: PASS" || echo "PHASE 1 GATE: FAIL"
exit "$FAIL"
```

- [ ] **Step 2: Run it — verify it fails**

```bash
chmod +x deploy/checks/check-theme-vars.sh
./deploy/checks/check-theme-vars.sh
```

Expected: `PHASE 1 GATE: FAIL`, check 1 reporting **80 unwrapped literals remain**, check 4
reporting `0 used, 0 defined` as balanced (vacuously true — that is fine now).

- [ ] **Step 3: Add the 14 variables to the dark theme**

Append to `homeassistant/themes/kitchencom.yaml`, **inside** the existing
`KitchenCOM:` block, at the same indent as the current keys. **Do not modify
any of the 9 existing keys.**

```yaml
  # --- Light-mode extraction (Phase 1) -------------------------------------
  # These are the CURRENT dark values. Defining them changes nothing; it lets
  # kitchen.yaml reference them so a second theme can override them.
  # HA maps every theme key `foo` to CSS `var(--foo)`
  # (frontend: src/common/dom/apply_themes_on_element.ts:176).
  kc-hero-fg: "#4fc3f7"
  kc-hero-tint: "#4fc3f722"
  kc-hero-glow: "#4fc3f755"
  kc-remind-fg: "#ba68c8"
  kc-remind-tint: "#ba68c822"
  kc-remind-glow: "#ba68c855"
  kc-chore-fg: "#ffd54f"
  kc-chore-tint: "#ffd54f22"
  kc-weather-fg: "#7e57c2"
  kc-weather-tint: "#7e57c222"
  kc-surface-1: "#ffffff0d"
  kc-surface-2: "#ffffff08"
  kc-trough: "rgba(255,255,255,0.13)"
  kc-trough-fill: "#4fc3f7"
```

That is exactly 14 keys, and the list is deliberately short:

- There is **no** `kc-chore-glow` / `kc-weather-glow` — those accents have no
  glow site.
- There are **no** text/page/card variables. The dark theme's `#e8edf6`,
  `#cdd6e6`, `#0f1115` and `#1b2130` appear **zero times** in `kitchen.yaml`;
  the panel inherits those roles from HA's standard `primary-text-color`,
  `primary-background-color` and `card-background-color`, which the light theme
  overrides as ordinary base keys in Task 8.

Any extra key here is *defined but unused* and **fails check 4**.

- [ ] **Step 4: Verify the theme file still parses**

```bash
npm run validate:yaml 2>&1 | grep -c 'themes/kitchencom.yaml'
```

Expected: `0` (no errors attributed to the theme file).

- [ ] **Step 5: Verify check 4 now reports the imbalance**

```bash
./deploy/checks/check-theme-vars.sh
```

Expected: still `FAIL`, but check 4 now says `0 used, 14 defined` with a diff
listing all 14. That asymmetry is correct at this point — Tasks 2–6 consume them.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/time-of-day-layouts
git add deploy/checks/check-theme-vars.sh homeassistant/themes/kitchencom.yaml
git commit -m "feat(theme): add 14 kc-* variables at current dark values

Defines the extraction targets in the dark theme at exactly today's
values, so referencing them from kitchen.yaml is a no-op. Also adds the
Phase 1 gate script (spec checks 1, 2, 4).

No visual change: nothing consumes these variables yet."
```

---

## Task 2: Extract the `hero` accent (19 YAML sites)

`#4fc3f7` is the hero blue. 22 sites total; **3 are inside JS blocks and are
deliberately left for Task 6.** This task does the other 19.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

- [ ] **Step 1: Record the before-state**

```bash
grep -c '#4fc3f7' homeassistant/dashboards/kitchen.yaml
```

Expected: `22`.

- [ ] **Step 2: Replace the YAML-style-list sites**

Run these three substitutions in order. **Longest pattern first** — replacing
`#4fc3f7` before `#4fc3f755` would corrupt the longer values into
`var(--kc-hero-fg, #4fc3f7)55`.

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PY'
import re
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
src=s

# Protect the JS template blocks — Task 6 handles those.
blocks=[]
def stash(m):
    blocks.append(m.group(0))
    return f"\x00JS{len(blocks)-1}\x00"
s=re.sub(r'\[\[\[.*?\]\]\]', stash, s, flags=re.S)

# Longest first.
s=s.replace('#4fc3f755', 'var(--kc-hero-glow, #4fc3f755)')
s=s.replace('#4fc3f722', 'var(--kc-hero-tint, #4fc3f722)')
# Bare #4fc3f7 not already inside a var() we just wrote.
s=re.sub(r'(?<!, )#4fc3f7\b(?!\))', 'var(--kc-hero-fg, #4fc3f7)', s)

for i,b in enumerate(blocks):
    s=s.replace(f"\x00JS{i}\x00", b)
open(p,'w').write(s)
print("replaced")
PY
```

- [ ] **Step 3: Verify the counts**

```bash
grep -o 'var(--kc-hero-fg, #4fc3f7)'   homeassistant/dashboards/kitchen.yaml | wc -l
grep -o 'var(--kc-hero-tint, #4fc3f722)' homeassistant/dashboards/kitchen.yaml | wc -l
grep -o 'var(--kc-hero-glow, #4fc3f755)' homeassistant/dashboards/kitchen.yaml | wc -l
grep -c 'kc-hero' homeassistant/dashboards/kitchen.yaml
```

Expected: `15`, `3`, `1`, and 19 lines carrying `kc-hero`.
(18 bare − 3 in JS = 15 fg; 3 tint; 1 glow. Total 19.)

- [ ] **Step 4: Verify exactly 3 raw `#4fc3f7` remain, all in JS blocks**

```bash
grep -n '#4fc3f7' homeassistant/dashboards/kitchen.yaml | grep -v 'var(--kc-hero'
```

Expected: exactly 3 lines — **1202, 1256, 1310**. If any other line appears, a
YAML site was missed.

- [ ] **Step 5: Verify no nesting corruption**

```bash
grep -c 'var(--kc-hero-fg, #4fc3f7)55\|var(--kc-hero-fg, #4fc3f7)22\|var(var(' homeassistant/dashboards/kitchen.yaml
```

Expected: `0`. Any hit means the ordering was wrong — `git checkout` the file and redo Step 2.

- [ ] **Step 6: Quote the glow value, then lint**

`text-shadow` is an **unquoted** scalar and the fallback still contains a `#`, so
yamllint reads ` #4fc3f755)` as a comment exactly as it did before. Wrapping in
`var()` does **not** fix this on its own. Quote the whole value:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PYEOF'
import re
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
s=re.sub(r'(- text-shadow: )(0 0 20px var\(--kc-[a-z-]+, #[0-9a-f]{8}\))', r'\1"\2"', s)
open(p,'w').write(s)
print("quoted")
PYEOF
```

Verify:

```bash
sed -n '488p' homeassistant/dashboards/kitchen.yaml
npm run validate:yaml 2>&1 | grep 'kitchen.yaml' || echo "no kitchen.yaml errors"
```

Expected: line 488 reads
`- text-shadow: "0 0 20px var(--kc-hero-glow, #4fc3f755)"`, and **one** error
remains (line ~1384, the `remind` glow, which Task 3 quotes).

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add homeassistant/dashboards/kitchen.yaml
git commit -m "refactor(panel): extract hero accent to var(--kc-hero-*)

19 of 22 #4fc3f7 sites. The 3 inside [[[ ]]] JS template blocks are
handled separately in a later commit.

Every reference keeps the dark value as its fallback, so this renders
identically.

The glow value also had to be QUOTED: text-shadow is an unquoted scalar
and the fallback still contains a #, so yamllint kept reading it as a
comment. Wrapping in var() alone does not fix that. Lint drops 2 -> 1."
```

---

## Task 3: Extract the `remind` accent (19 YAML sites)

Identical shape to Task 2. `#ba68c8`, 22 sites, 3 in JS blocks (2059, 2113, 2167).

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

- [ ] **Step 1: Record the before-state**

```bash
grep -c '#ba68c8' homeassistant/dashboards/kitchen.yaml
```

Expected: `22`.

- [ ] **Step 2: Replace the YAML-style-list sites**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PY'
import re
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
blocks=[]
def stash(m):
    blocks.append(m.group(0))
    return f"\x00JS{len(blocks)-1}\x00"
s=re.sub(r'\[\[\[.*?\]\]\]', stash, s, flags=re.S)

s=s.replace('#ba68c855', 'var(--kc-remind-glow, #ba68c855)')
s=s.replace('#ba68c822', 'var(--kc-remind-tint, #ba68c822)')
s=re.sub(r'(?<!, )#ba68c8\b(?!\))', 'var(--kc-remind-fg, #ba68c8)', s)

for i,b in enumerate(blocks):
    s=s.replace(f"\x00JS{i}\x00", b)
open(p,'w').write(s)
print("replaced")
PY
```

- [ ] **Step 3: Verify the counts**

```bash
grep -o 'var(--kc-remind-fg, #ba68c8)'    homeassistant/dashboards/kitchen.yaml | wc -l
grep -o 'var(--kc-remind-tint, #ba68c822)' homeassistant/dashboards/kitchen.yaml | wc -l
grep -o 'var(--kc-remind-glow, #ba68c855)' homeassistant/dashboards/kitchen.yaml | wc -l
```

Expected: `15`, `3`, `1`.

- [ ] **Step 4: Verify exactly 3 raw `#ba68c8` remain, all in JS blocks**

```bash
grep -n '#ba68c8' homeassistant/dashboards/kitchen.yaml | grep -v 'var(--kc-remind'
```

Expected: exactly lines **2059, 2113, 2167**.

- [ ] **Step 5: Quote the remind glow, then lint**

Same reason as Task 2 Step 6 — the fallback still holds a `#` on an unquoted
`text-shadow` scalar. The same substitution catches it:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PYEOF'
import re
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
s=re.sub(r'(- text-shadow: )(0 0 20px var\(--kc-[a-z-]+, #[0-9a-f]{8}\))', r'\1"\2"', s)
open(p,'w').write(s)
print("quoted")
PYEOF
```

```bash
npm run validate:yaml
```

Expected: **no `kitchen.yaml` errors at all.** Both pre-existing false positives
are resolved — not because `var()` hides the `#`, but because both `text-shadow`
values are now quoted. If an error remains, a glow site was missed.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add homeassistant/dashboards/kitchen.yaml
git commit -m "refactor(panel): extract remind accent to var(--kc-remind-*)

19 of 22 #ba68c8 sites; 3 JS-block sites deferred.

validate:yaml is now fully clean on kitchen.yaml. Both pre-existing
'missing starting space in comment' false positives are resolved by
QUOTING the two text-shadow values -- var() alone does not help, since
the hex fallback still contains a # on an unquoted scalar."
```

---

## Task 4: Extract the `chore` and `weather` accents (18 sites, none in JS)

Both are entirely in YAML style lists, and neither has a glow. Doing them
together keeps the commit count sane without mixing JS handling in.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

- [ ] **Step 1: Record the before-state**

```bash
grep -c '#ffd54f' homeassistant/dashboards/kitchen.yaml   # expect 12
grep -c '#7e57c2' homeassistant/dashboards/kitchen.yaml   # expect 6
```

- [ ] **Step 2: Replace**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PY'
import re
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
s=s.replace('#ffd54f22', 'var(--kc-chore-tint, #ffd54f22)')
s=re.sub(r'(?<!, )#ffd54f\b(?!\))', 'var(--kc-chore-fg, #ffd54f)', s)
s=s.replace('#7e57c222', 'var(--kc-weather-tint, #7e57c222)')
s=re.sub(r'(?<!, )#7e57c2\b(?!\))', 'var(--kc-weather-fg, #7e57c2)', s)
open(p,'w').write(s)
print("replaced")
PY
```

No JS-stashing needed — neither colour appears inside a `[[[ ]]]` block.

- [ ] **Step 3: Verify the counts**

```bash
grep -o 'var(--kc-chore-fg, #ffd54f)'       homeassistant/dashboards/kitchen.yaml | wc -l  # 8
grep -o 'var(--kc-chore-tint, #ffd54f22)'   homeassistant/dashboards/kitchen.yaml | wc -l  # 4
grep -o 'var(--kc-weather-fg, #7e57c2)'     homeassistant/dashboards/kitchen.yaml | wc -l  # 4
grep -o 'var(--kc-weather-tint, #7e57c222)' homeassistant/dashboards/kitchen.yaml | wc -l  # 2
```

- [ ] **Step 4: Verify zero raw occurrences remain**

```bash
grep -n '#ffd54f\|#7e57c2' homeassistant/dashboards/kitchen.yaml | grep -v 'var(--kc-' || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add homeassistant/dashboards/kitchen.yaml
git commit -m "refactor(panel): extract chore and weather accents

12 #ffd54f and 6 #7e57c2 sites, all in YAML style lists — neither colour
appears inside a JS template block. Neither has a glow variant."
```

---

## Task 5: Extract the neutral surfaces (12 sites)

These are the values the spec flags as **inverting**: white-at-low-alpha card
backgrounds that lift a card off near-black. In Phase 2 they become solid white.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

- [ ] **Step 1: Note the two syntactic forms**

Six sites are flow-style, e.g. line 1146:

```yaml
card: [height: 66px, background: '#ffffff0d', border: none, box-shadow: none, border-radius: 10px]
```

Six are block-style, e.g. line 1208:

```yaml
                - background: "#ffffff08"
```

A single textual replacement handles both, because it targets the value not the syntax.

- [ ] **Step 2: Replace**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PY'
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
s=s.replace('#ffffff0d', 'var(--kc-surface-1, #ffffff0d)')
s=s.replace('#ffffff08', 'var(--kc-surface-2, #ffffff08)')
open(p,'w').write(s)
print("replaced")
PY
```

- [ ] **Step 3: Verify counts and that flow style survived**

```bash
grep -o 'var(--kc-surface-1, #ffffff0d)' homeassistant/dashboards/kitchen.yaml | wc -l  # 6
grep -o 'var(--kc-surface-2, #ffffff08)' homeassistant/dashboards/kitchen.yaml | wc -l  # 6
sed -n '1146p' homeassistant/dashboards/kitchen.yaml
```

The line 1146 output must still be a valid single-line flow mapping with the
`var()` inside the quotes:
`card: [height: 66px, background: 'var(--kc-surface-1, #ffffff0d)', ...]`

- [ ] **Step 4: Lint**

```bash
npm run validate:yaml
```

Expected: still no `kitchen.yaml` errors. **This is the step that proves flow
style tolerated the substitution** — a broken flow mapping is a parse error, not
a warning.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add homeassistant/dashboards/kitchen.yaml
git commit -m "refactor(panel): extract neutral card surfaces

12 sites: 6x #ffffff0d and 6x #ffffff08, across both flow-style and
block-style mappings.

These are the values that must INVERT rather than re-tone — they are
white-at-low-alpha lifting cards off a near-black page, a trick that is
invisible on a light ground."
```

---

## Task 6: Extract the JS-block sites (12 sites)

**The riskiest task.** These 12 live inside `[[[ ]]]` `button-card` JS templates
that build HTML strings at render time. Backticks and `${}` are live syntax.

**Files:**
- Modify: `homeassistant/dashboards/kitchen.yaml`

- [ ] **Step 1: Look at what you are editing**

```bash
sed -n '1196,1203p' homeassistant/dashboards/kitchen.yaml
```

Expected:

```
                    if (isNaN(pct)) pct = 0;
                    return `<div style="width:100%;height:6px;border-radius:3px;
                      background:rgba(255,255,255,0.13);overflow:hidden;">
                      <div style="width:${pct}%;height:100%;border-radius:3px;
                      background:#4fc3f7;"></div></div>`; ]]]
```

The colours sit in a CSS `style="..."` attribute inside a JS template literal.
`var()` is valid CSS there and resolves normally. The `${pct}` interpolation must
be left exactly as it is.

- [ ] **Step 2: Replace the 6 troughs and 6 fills**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PY'
import re
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()

before_t = s.count('rgba(255,255,255,0.13)')
s = s.replace('background:rgba(255,255,255,0.13);',
              'background:var(--kc-trough, rgba(255,255,255,0.13));')

# The remaining raw accents are ONLY in JS blocks now (Tasks 2-3 left them).
before_h = len(re.findall(r'background:#4fc3f7;', s))
before_r = len(re.findall(r'background:#ba68c8;', s))
s = s.replace('background:#4fc3f7;', 'background:var(--kc-trough-fill, #4fc3f7);')
s = s.replace('background:#ba68c8;', 'background:var(--kc-trough-fill, #ba68c8);')

open(p,'w').write(s)
print(f"troughs={before_t} hero_fills={before_h} remind_fills={before_r}")
PY
```

Expected output: `troughs=6 hero_fills=3 remind_fills=3`.

> **Note on `--kc-trough-fill`:** both accents map to the same variable. In dark
> its value is `#4fc3f7`, and the remind bars keep `#ba68c8` as their *fallback*
> — but the variable is defined, so all six bars render `#4fc3f7` in dark. **That
> is a visual change** and Step 4 will catch it. Fix it in Step 5.

- [ ] **Step 3: Verify no raw colour literals remain anywhere**

```bash
grep -oiE '#[0-9a-f]{3,8}|rgba?\(' homeassistant/dashboards/kitchen.yaml \
  | grep -v '^rgba($' | wc -l
grep -n 'background:#' homeassistant/dashboards/kitchen.yaml || echo "no raw background hex"
```

- [ ] **Step 4: Detect the regression this introduces**

The three remind progress bars would turn blue. Confirm:

```bash
grep -n 'var(--kc-trough-fill, #ba68c8)' homeassistant/dashboards/kitchen.yaml
```

Expected: 3 lines (2059, 2113, 2167 area). **Each would render `#4fc3f7`, not
`#ba68c8`** — the fallback only applies when the var is undefined, and it is
defined.

- [ ] **Step 5: Fix — give remind its own fill variable**

Point the remind bars at the remind accent instead:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
python3 - <<'PY'
p='homeassistant/dashboards/kitchen.yaml'
s=open(p).read()
n=s.count('var(--kc-trough-fill, #ba68c8)')
s=s.replace('var(--kc-trough-fill, #ba68c8)', 'var(--kc-remind-fg, #ba68c8)')
open(p,'w').write(s)
print(f"repointed {n} remind bars to --kc-remind-fg")
PY
```

Expected: `repointed 3 remind bars to --kc-remind-fg`.

This reuses an existing variable rather than adding a 21st, so check 4 still
balances. Hero bars keep `--kc-trough-fill`, which is correct — it is the
"progress fill" role and its dark value already equals the hero blue.

- [ ] **Step 6: Run the full gate**

```bash
./deploy/checks/check-theme-vars.sh
```

Expected: **`PHASE 1 GATE: PASS`** — 0 unwrapped literals, 0 bare vars, 14 used == 14 defined.

- [ ] **Step 7: Lint and card tests**

```bash
npm run validate:yaml
cd custom_cards/tod-autonav-card && npm test && cd ../..
git diff --stat -- custom_cards/screensaver-card    # must be empty
```

Expected: no `kitchen.yaml` errors; **14 passed**; empty diff.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add homeassistant/dashboards/kitchen.yaml
git commit -m "refactor(panel): extract the 12 JS-template colour sites

The 6 progress troughs and their 6 fills live inside [[[ ]]] button-card
JS templates that build HTML at render time, not in YAML style lists.
var() is valid CSS inside the emitted style attribute; the \${pct}
interpolation is untouched.

Routing all six fills through --kc-trough-fill would have turned the
three remind bars blue, since a defined variable wins over its fallback.
They point at --kc-remind-fg instead, reusing an existing variable.

Phase 1 gate now passes: 0 unwrapped literals, 0 bare vars, 14 used == 14 defined."
```

---

## Task 7: PHASE 1 GATE — prove dark is unchanged on the real panel

**Do not start Phase 2 until this passes.** No light theme exists yet, so any
visual difference is an extraction bug, diagnosable without light colours present.

**Files:** none modified.

- [ ] **Step 1: Confirm the repo-side gate**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
./deploy/checks/check-theme-vars.sh
npm run validate:yaml
cd custom_cards/tod-autonav-card && npm test && cd ../..
git diff --stat -- custom_cards/screensaver-card
```

All must pass; the screensaver diff must be empty.

- [ ] **Step 2: Check for drift before deploying**

```bash
./deploy/deploy-dashboard.sh --check
```

Expected: the Pi still matches the pre-extraction baseline
(`eae7034812b8065e2b8e19da856b9325`) and the repo now differs. If it reports
**drift**, stop — someone edited the Pi. Read the diff and use `--pull`.

- [ ] **Step 3: Photograph the panel BEFORE deploying**

Take a phone photo of each of the three time views (Morning, Afternoon, Evening).
This is the comparison baseline. **`deploy-dashboard.sh` has never been run
end-to-end** — stages 3–6 and the rollback branch are untested, so do this with
someone at the panel.

- [ ] **Step 4: Deploy**

```bash
./deploy/deploy-dashboard.sh
```

Expected: backup taken on both ends, byte-exact copy verified, `check_config`
passes, baseline updated. On `check_config` failure it rolls back automatically —
if that happens, the extraction produced invalid YAML; fix and repeat.

- [ ] **Step 5: Compare the panel against the photos**

Reload the panel (it is a `mode: yaml` dashboard, so no HA restart is needed —
just refresh). Walk all five views.

**Pass condition: indistinguishable from the photos.** Specifically confirm:
- The 3 hero progress bars are still blue, the 3 remind bars still purple (the Task 6 trap).
- Card backgrounds still lift off the page (the 12 surface sites).
- The Morning/Evening hero headings still have their glow.

If a card renders **blank or transparent**, a variable is undefined and lacks a
fallback — re-run the gate; check 2 catches exactly that.

- [ ] **Step 6: Commit the gate result**

```bash
git branch --show-current
git commit --allow-empty -m "chore: Phase 1 gate passed — dark verified unchanged on the panel

All 80 literals extracted to var(--kc-*) with dark fallbacks. Verified
on the physical panel across all five views against pre-deploy photos.
No visual change. Phase 2 (the light palette) may now begin."
```

---

## Task 8: The Mist light theme

**Files:**
- Create: `homeassistant/themes/kitchencom-light.yaml`

- [ ] **Step 1: Create the theme file**

`configuration.yaml:24` uses `!include_dir_merge_named themes`, so this file is
picked up automatically — **no config change and no HA restart needed.** The
top-level key is the theme's display name.

```yaml
KitchenCOM Light:
  # Mist — cool light-lavender ground, white cards, indigo-forward accents.
  # Chosen 2026-09-10 over warm-paper candidates; see the design spec §2.1.

  # --- HA base keys (mirror of the dark theme's 9) ---
  primary-color: "#4f46e5"
  accent-color: "#4f46e5"
  primary-background-color: "#f6f6fb"
  secondary-background-color: "#ffffff"
  card-background-color: "#ffffff"
  primary-text-color: "#2e2e42"
  secondary-text-color: "#5b5b73"
  ha-card-border-radius: "14px"
  app-header-background-color: "#ffffff"
  app-header-text-color: "#2e2e42"

  # --- the 14 kc-* overrides ---
  # Accents are re-picked by hand, not derived. The dark pastels are tuned for
  # near-black and are unreadable on white; these are measured >= 5.02:1 on
  # #ffffff. Tints drop to 1f (12%) because a light ground needs less.
  kc-hero-fg: "#3730a3"
  kc-hero-tint: "#4f46e51f"
  kc-hero-glow: "none"
  kc-remind-fg: "#7e22ce"
  kc-remind-tint: "#9333ea1f"
  kc-remind-glow: "none"
  kc-chore-fg: "#b45309"
  kc-chore-tint: "#d977061f"
  kc-weather-fg: "#4f46e5"
  kc-weather-tint: "#6366f11f"
  # Surfaces INVERT: white-on-grey instead of white-alpha-on-black.
  kc-surface-1: "#ffffff"
  kc-surface-2: "#ffffff"
  kc-trough: "#e4e4f0"
  kc-trough-fill: "#4f46e5"
```

Exactly 14 `kc-*` keys, matching the dark theme. Text, page and card grounds are
handled by the base keys above, not by `kc-*` vars.

> **`kc-hero-glow: "none"`** — `text-shadow: 0 0 20px none` is invalid CSS and the
> declaration is simply dropped, which is exactly the intent. On white a glow
> renders as a smudge.

- [ ] **Step 2: Verify it parses and defines the same 14 keys**

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
npm run validate:yaml
grep -oE '^[[:space:]]+kc-[a-z0-9-]+' homeassistant/themes/kitchencom-light.yaml \
  | tr -d ' ' | sort -u > /tmp/kc-light
grep -oE '^[[:space:]]+kc-[a-z0-9-]+' homeassistant/themes/kitchencom.yaml \
  | tr -d ' ' | sort -u > /tmp/kc-dark
diff /tmp/kc-dark /tmp/kc-light && echo "BOTH THEMES DEFINE THE SAME 14 KEYS"
```

Expected: no lint errors, and `BOTH THEMES DEFINE THE SAME 14 KEYS`. A key present
in one theme but not the other means that value silently falls back to dark when
you switch.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add homeassistant/themes/kitchencom-light.yaml
git commit -m "feat(theme): add the Mist light theme

Cool light-lavender ground (#f6f6fb) with white cards and indigo accents.
Accents re-picked by hand rather than derived — the dark pastels are
tuned for near-black. All measure >= 5.02:1 on white.

Surfaces invert to solid white; glows resolve to none.
Defines exactly the same 14 kc-* keys as the dark theme."
```

---

## Task 9: The theme switch

**Files:**
- Create: `homeassistant/packages/theme.yaml`

- [ ] **Step 1: Create the package**

Packages are already wired (`homeassistant/packages/` holds five). Follow the
existing shape.

```yaml
# Theme switching for the kitchen panel.
#
# frontend.set_theme is a FRONTEND service: it applies to every browser
# connected to this HA instance, not just the panel. That is the intent here —
# one kitchen display — but it is why this is an input_select rather than a
# per-device setting.

input_select:
  kitchen_theme:
    name: Kitchen Theme
    options:
      - Dark
      - Light
    initial: Dark
    icon: mdi:theme-light-dark

automation:
  - id: kitchen_theme_apply
    alias: "Kitchen: apply the selected theme"
    description: >
      Applies the theme when the selector changes, and re-applies it on HA
      start — frontend.set_theme does not survive a restart on its own.
    mode: single
    trigger:
      - platform: state
        entity_id: input_select.kitchen_theme
      - platform: homeassistant
        event: start
    action:
      - service: frontend.set_theme
        data:
          name: >
            {% if states('input_select.kitchen_theme') == 'Light' %}
            KitchenCOM Light
            {% else %}
            KitchenCOM
            {% endif %}
```

> The theme names must match the top-level keys exactly: `KitchenCOM` (dark,
> `themes/kitchencom.yaml`) and `KitchenCOM Light` (`themes/kitchencom-light.yaml`).
> A typo silently applies HA's default theme.

- [ ] **Step 2: Validate**

```bash
npm run validate:yaml
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add homeassistant/packages/theme.yaml
git commit -m "feat(theme): input_select + automation to switch themes

Re-applies on homeassistant start as well as on selector change —
frontend.set_theme does not persist across a restart.

Note this is a frontend-wide service: it affects every connected
browser, which is intended for a single-panel household."
```

---

## Task 10: Deploy Phase 2 and verify light mode

**Files:** none modified.

- [ ] **Step 1: Copy the two new config files to the Pi**

`deploy-dashboard.sh` handles only `kitchen.yaml`. These are new files with no
drift risk, so a direct copy is appropriate:

```bash
cd /Users/jdehart1/___Code_DEV/KitchenCOM
scp homeassistant/themes/kitchencom-light.yaml \
    kitchencom:/home/garrettdehart/homeassistant/themes/
scp homeassistant/packages/theme.yaml \
    kitchencom:/home/garrettdehart/homeassistant/packages/
```

- [ ] **Step 2: Validate on the Pi before restarting**

```bash
ssh kitchencom 'timeout 120 docker exec homeassistant python -m homeassistant --script check_config -c /config' 2>&1 | tail -5
```

Expected: `Testing configuration at /config` and exit 0. If it fails, **remove
the two files from the Pi** and fix locally — do not restart into a broken config.

- [ ] **Step 3: Restart HA**

A new `input_select` and automation require a restart (unlike the dashboard).

```bash
ssh kitchencom 'docker restart homeassistant'
```

- [ ] **Step 4: Wait — entities appear late**

HA answers HTTP 200 at roughly 20s but new YAML entities need **60–90s**.
Checking early looks like a failed deploy.

```bash
sleep 90
ssh kitchencom 'curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123'
```

Expected: `200`.

- [ ] **Step 5: Confirm the entity exists**

```bash
ssh kitchencom 'python3 -' < deploy/checks/check-tod-entities.py 2>/dev/null || \
  echo "Check manually: Developer Tools > States > input_select.kitchen_theme"
```

If `input_select.kitchen_theme` is missing after 90s, re-check the package file
landed in `packages/` and that `check_config` passed.

- [ ] **Step 6: Switch to Light and inspect the panel**

Set `input_select.kitchen_theme` to `Light` (Developer Tools → States, or the
selector on the dashboard). The panel should change **without a reload**.

Walk all five views and confirm:
- Page ground is light lavender-grey; **cards are white and clearly raised**.
- Hero headings are deep indigo with **no glow smudge**.
- Progress troughs are light grey with indigo (hero) and purple (remind) fills — **not white-on-white**.
- Chore chips read amber-brown, not pale yellow.
- **The screensaver stays dark.** Trigger it (30 min idle) or trust the empty diff — it hardcodes its own palette and reads no theme vars.

- [ ] **Step 7: Switch back to Dark and confirm it is unchanged**

Set the selector to `Dark`. The panel must return to exactly the Phase 1 state —
compare against the Task 7 photos. **This is the byte-identical guarantee being
verified end-to-end.**

- [ ] **Step 8: Commit the verification**

```bash
git branch --show-current
git commit --allow-empty -m "chore: light mode verified on the panel

Both themes confirmed on the physical panel across all five views.
Dark matches the Phase 1 photos exactly; Light renders the Mist palette
with white cards, no glow artefacts, and correct trough contrast.
Screensaver stays dark as designed."
```

---

## Rollback

Phase 1 and Phase 2 fail independently.

**Phase 2 (light theme misbehaves):** set the selector back to `Dark`. To remove
it entirely, delete the two files from the Pi and restart:

```bash
ssh kitchencom 'rm -f ~/homeassistant/themes/kitchencom-light.yaml ~/homeassistant/packages/theme.yaml && docker restart homeassistant'
```

Dark is unaffected — it never depended on either file.

**Phase 1 (extraction broke something):** every deploy writes a Pi-side backup
and a repo-side snapshot.

```bash
ssh kitchencom 'ls -t ~/homeassistant/backups/kitchen.yaml.bak-* | head -3'
ssh kitchencom 'cp ~/homeassistant/backups/kitchen.yaml.bak-<TS> ~/homeassistant/dashboards/kitchen.yaml'
```

No restart needed — it is a `mode: yaml` dashboard. Then
`./deploy/deploy-dashboard.sh --adopt` to resync the baseline.

---

## Out of scope

Do not do these, even if tempting:

- **Changing dark's appearance**, including the 9 base keys and the `#7e57c2`
  weather accent that measures 3.63:1 (below AA). Pre-existing; fixing it
  violates the byte-identical constraint.
- **Touching `custom_cards/screensaver-card/`.** It stays dark by construction.
- **`reference/ChoreOps-main/`** — read-only vendored upstream, 91 literals. Not ours.
- **Auto-switching by time of day.** `sensor.kitchen_time_of_day` exists and could
  drive it later; the selector is deliberately manual for now.
- **The E/F card restructure** (hairline border + tinted icon square).
