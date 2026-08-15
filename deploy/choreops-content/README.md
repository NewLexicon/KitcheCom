# ChoreOps content generator

Builds the full gamification content — 16 rewards, 4 bonuses, 2 penalties,
3 achievements, 6 badges — as a ChoreOps storage JSON, so it can be pasted
into ChoreOps in one step instead of typed through ~40 UI forms.

**Verified end-to-end on the dev-HA rig 2026-08-15** (ChoreOps 1.0.8): the
generated file loads, survives an HA restart, and produces **236** entities
with every content type present and semantically correct.

## Why this exists

Typing this by hand is ~40 forms of transcription, each an opportunity for a
typo, and the dev rig's HA build has no icon-search box (see the cold-open).
Writing JSON sidesteps both: icons are set exactly, and the content is
reproducible from version control rather than living only as instance state.

## Usage

```bash
python3 gen_content.py <existing-storage.json> <out.json>
```

It **reads an existing storage file** and replaces only the content
collections, preserving `meta`, `users`, `chores`, and `notifications`.
User IDs and chore IDs are resolved from that file at runtime — nothing is
hardcoded — so the same script targets the dev rig or the Pi unchanged.

Chores referenced by name (currently `Brush Teeth`, for the Early Riser
achievement) are looked up case-insensitively. **If a chore is missing the
script prints a WARNING and leaves `selected_chore_id` empty** rather than
failing or inventing an ID. On the dev rig this fires — it has 3 chores; the
Pi has all 11, so it should not fire there. **If it fires on the Pi, stop:**
the chore-name lookup is wrong and that achievement would silently never track.

## Applying it

The import path is `config_flow.py:469` (`async_step_paste_json_input`);
the validator is `helpers/backup_helpers.py:543`. It accepts diagnostic,
Store-v1, and raw-storage formats — this script emits Store v1.

⚠️ **Paste lives in the CONFIG flow, not the options flow.** It only runs when
*adding* the integration, and it **overwrites** the whole storage file rather
than merging. On the Pi the sequence is:

1. Back up `/config/.storage/choreops/choreops_data_*` first.
2. Delete the ChoreOps config entry.
3. Re-add ChoreOps → choose "paste JSON" → paste the generated file.
4. Restart HA, then verify counts + entity total.

Alternatively, write the file directly into `.storage/choreops/` and restart —
that is what was done on the dev rig, and it is how this was verified.

## Verification after applying

Expect `rewards=16 bonuses=4 penalties=2 achievements=3 badges=6`, and:

- **Penalties stored NEGATIVE** (`-5`, `-2`). The UI form takes a positive
  number and negates internally; writing JSON bypasses that, so the script
  applies the negation itself.
- **`Streak Master`** resolves `associated_achievement` to the real
  `7-Day Streak` id — a dangling id here means the badge will never award.
- **Entity count.** Rewards contribute exactly 8 each (1 sensor + 3 buttons
  × 2 kids). The Pi has 4 users but only 2 gamified, so reward/bonus/penalty
  entity math should match the dev rig; the per-user totals will differ.

## Content sources

Every value traces to a decided entry sheet — this script is transcription,
not new decisions:

- `docs/session-state/2026-07-22-choreops-reward-store-entry-sheet.md`
- `docs/session-state/2026-08-05-choreops-bonuses-penalties-entry-sheet.md`
- `docs/session-state/2026-08-05-choreops-achievements-badges-entry-sheet.md`

Names use ASCII punctuation per the reward sheet's §5a Finding 2 (the
em-dash in the original tables was never tested; parens/slashes are proven).
