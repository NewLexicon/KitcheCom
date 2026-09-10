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
