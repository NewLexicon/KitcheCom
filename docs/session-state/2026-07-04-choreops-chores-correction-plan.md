# ChoreOps Chores — entered state + correction plan (2026-07-04)

**Status: ✅ CHORES DONE + VERIFIED.** 12 entered via UI → corrected via direct storage edit → 11 final chores, all fields verified against plan after HA reload. Parents converted to approvers-only. Next: rewards.

**APPLIED (2026-07-04):** all fixes below written to storage + HA restarted + verified. Final state:
- 11 chores, all points/freq/mode/assignees correct (see "Target state" table — realized exactly).
- Parents Garrett+Rebecca → approvers only (can_be_assigned=false, gamif=false, approve+manage=true), removed from all chore assignments.
- **KNOWN CARRY-FORWARD:** direct storage-edit left parents' STALE chore/point entities in the registry (garrett/rebecca still have 27 choreops entities incl. points/badges/claim_chore_fishy). ChoreOps only fully regenerates entities via its options-flow UI, not on hand-edited JSON reload. **Harmless** — Task 8 dashboard gen picks only Rowan+Wystan so parents' entities never render. If a clean registry is wanted later: open ChoreOps → Edit User → Garrett → save (and Rebecca), which regenerates their entity set from the new flags. Deferred (user AFK at decision; chose default = leave them).

---
**(Original correction plan below, now applied:)**

**Backup:** `/home/garrettdehart/homeassistant/.storage/choreops/choreops_data_01KWJ7A16VQ6F63M3RCNAF1DS5.bak-preedit-20260704` (pre-edit safety copy).

**User IDs:** Rowan `6fbbf68d-b51c-45d0-9f70-e4b94f3f3ce2` · Wystan `4087982b-c8fd-40ba-a365-3a8ff4512658` · Garrett `77be7d99-6a6a-40d9-90c4-36ac2414f384` · Rebecca `d1d54221-6f2b-432a-8690-02ae230f1c47`

**Valid enums (from installed 1.0.7):** `recurring_frequency` ∈ {daily, weekly, none} · `completion_criteria` ∈ {rotation_smart, independent}. Fields in the data file: `name`, `default_points`, `assigned_user_ids[]`, `recurring_frequency`, `completion_criteria`, `auto_approve`.

## Current entered state (12 chores)
| Chore | Points | Assigned | Freq | Mode |
|---|---|---|---|---|
| Fishy (=dog) | 2 | all 4 | daily | rotation_smart |
| FIshy | 2 | Rowan+Wystan | daily | independent |
| Trash | 5 | Rowan+Wystan | none | rotation_smart |
| Set the Table | 2 | Rowan+Wystan | none | rotation_smart |
| Brush Teeth | 2 | Rowan+Wystan | none | independent |
| Plants | 5 | Rowan+Wystan | weekly | rotation_smart |
| Feed Cats | 1.95 | Rowan+Wystan | daily | rotation_smart |
| Wash Dishes | 5 | Rowan+Wystan | weekly | independent |
| Cook Dinner | 9.96 | Rowan | weekly | independent |
| Recycling | 5 | Rowan+Wystan | daily | rotation_smart |
| Laundry | 2 | Rowan+Wystan | weekly | independent |
| Clean Room | 2 | Rowan+Wystan | weekly | independent |

## User's confirmed decisions
- **Fishy = the dog chore.** DELETE "FIshy" (the duplicate).
- User intentionally SKIPPED "Clothes in hamper" + "Tidy toys".
- Feed Cats → **2 pts, Rowan only**. Cook Dinner → **10 pts**.
- Fixes applied by editing storage directly (backup first, restart HA to reload).

## Target state after fix (11 chores, FIshy deleted)
| Chore | Points | Assigned | Freq | Mode | Change |
|---|---|---|---|---|---|
| Fishy (dog) | 3 | **Wystan only** ⚠️UNCONFIRMED | daily | independent | fix assignees |
| ~~FIshy~~ | | | | | **DELETE** |
| Feed Cats | 2 | Rowan only | daily | independent | pts+assignee |
| Cook Dinner | 10 | Rowan | daily | independent | pts + freq→daily |
| Set the Table | 3 | Rowan+Wystan | daily | rotation_smart | freq+pts |
| Brush Teeth | 2 | Rowan+Wystan | daily | independent | freq |
| Plants | 3 | Rowan+Wystan | daily | rotation_smart | freq+pts |
| Wash Dishes | 5 | Rowan+Wystan | daily | rotation_smart | freq+mode |
| Trash | 5 | Rowan+Wystan | weekly | rotation_smart | freq |
| Recycling | 5 | Rowan+Wystan | weekly | rotation_smart | freq |
| Laundry | 3 | Rowan+Wystan | weekly | rotation_smart | pts+mode |
| Clean Room | 3 | Rowan+Wystan | weekly | rotation_smart | pts+mode |

## ⚠️ BLOCKER before writing
Confirm the **dog (Fishy) assignee**: Wystan-only (my assumption, per user's original "replace 1 with feed dog" = Wystan's chore) vs. both-kids-rotating vs. all-4-family. Then apply all fixes + restart HA + verify.

## Still TODO after chores (blueprint order)
Rewards (retune treat/cash, add screen-time/privileges/tiers) → Bonuses (retune cheerful) → Penalties (retune demerit) → Badges (5 types) → Achievements → THEN Task 8 dashboard gen.
