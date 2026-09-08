# Voice: todo lists, grocery lists, and the Grocy meal plan

**Status:** design approved 2026-09-08. Not yet implemented — the mic is **on order**.
**Hardware dependency:** Home Assistant Voice Preview Edition (ordered 2026-09-08).

## 1. Goal

Three spoken capabilities on the kitchen panel:

1. **Add to a todo list** — "add milk to the groceries list"
2. **Add to a grocery list** — same mechanism, different target entity
3. **Add a meal to the Grocy meal plan** — "add tacos to Thursday"

## 2. What already exists (verified 2026-09-08, do not rebuild)

| Piece | State |
|---|---|
| `todo.groceries`, `todo.shopping_list` | Live, on the panel's **Lists** view |
| `todo.grocy_shopping_list`, `todo.grocy_meal_plan` | Live, from the Grocy integration |
| HA built-in todo intents | Built in — **items 1 and 2 need no custom intent** |
| `homeassistant/packages/grocy_recipes.yaml` | 3 `rest_command`s, **all GET (read-only)** |
| Grocy container | Up, `localhost:9283`, API key in `secrets.yaml` as `grocy_api_key` |

**The only genuinely new backend work is a POST to the Grocy meal plan.**

### Verified API behaviour (probed live, then cleaned up)

`POST /api/objects/meal_plan` returns `{"created_object_id": "N"}` and accepts **both** shapes:

```jsonc
{"day":"YYYY-MM-DD","type":"recipe","recipe_id":1,"recipe_servings":1}  // scheduled recipe
{"day":"YYYY-MM-DD","type":"note","note":"Tacos (added by voice)"}      // free-text note
```

`DELETE /api/objects/meal_plan/{id}` → 204. Both probes were removed; the meal plan is unchanged.

⚠️ **`sensor.grocy_meal_plan` reads `0` while the API holds 2 entries** — the sensor counts
*upcoming* meals and both existing entries are in the past. Do not read that sensor as "the API is
empty".

## 3. Design

### 3.1 Items 1 and 2 — todo and grocery lists

**No custom intent.** Expose the `todo.*` entities to Assist and use HA's built-in intents.

⚠️ **First implementation step is to verify which lists accept `todo.add_item`.**
`supported_features` is **not written to the recorder** (same class of gap as
`supported_color_modes` — see the lighting package), so it must be read from the live API. A
Grocy-backed todo entity may be read-only.

### 3.2 Item 3 — the meal plan intent

One `intent_script`. Slots: the spoken meal name and a day.

**Resolution order — exact match FIRST.** This is the load-bearing decision: it means that once a
recipe is literally named "Tacos", saying "tacos" always resolves to it no matter how many
"...Tacos" recipes exist later.

1. **Exact name match** (case-insensitive, trimmed) → POST `type: recipe`.
2. **Exactly one partial match** → POST `type: recipe`. ("fried rice" → "Chicken Fried Rice")
3. **Several partial matches** → **POST nothing.** Speak the candidates:
   *"I found 3 taco recipes: Chicken Tacos, Fish Tacos, Beef Tacos — say the full name."*
   The user repeats with the full name, which then hits rule 1.
4. **No match** → POST `type: note` with the spoken name, and say:
   *"I couldn't find a recipe called tacos, so I put it on Thursday as a note — add the recipe
   when you get a chance."*

Rule 4 deliberately uses a **note**, not an empty stub recipe: the meal still lands on the correct
day and is visible in Grocy, and it is upgraded to a real recipe later at the keyboard. This was
chosen over creating a contentless recipe because Grocy supports notes as first-class meal-plan
entries (verified above).

⚠️ **Filter out date-named recipes before matching.** Grocy's recipe list currently contains
`2026-32`, `2026-08-15`, `2026-08-14#1`, `2026-08-14` alongside the 4 real ones. These are
meal-plan artifacts, must never match a spoken phrase, and are excluded by
`^[0-9]{4}([-#]|$)`.

### 3.3 Explicitly single-turn

Every branch above completes in **one turn**. Nothing depends on `reprompt` or on the assistant
holding a conversation open, because **Voice PE's multi-turn behaviour is unverified until the
hardware arrives**. `intent_script` does support `speech` and `reprompt`, so a conversational
upgrade is possible later — that is a follow-up, not part of this design.

## 4. Deferred (explicitly not in scope)

- **Multi-turn disambiguation** ("...which one?" → spoken answer). Revisit once Voice PE is in hand.
- **Creating full recipes by voice** — ingredients and steps are not a voice-sized task.
- **Custom wake words** — Voice PE supports only "Okay Nabu" / "Hey Jarvis" / "Hey Mycroft".

## 5. Risks

| Risk | Mitigation |
|---|---|
| A Grocy-backed todo entity is read-only | Verify `supported_features` live in step 1; fall back to `todo.groceries` |
| STT mishears a meal name | Rule 4 writes a **note**, which is trivially deleted — no bad recipe is created |
| Recipe collisions grow over time | Exact-match-first (3.2 rule 1) makes well-named recipes always win |
| Day parsing ("Thursday") is ambiguous | Resolve to the **next** occurrence; confirm the resolved date in the spoken reply |

## 6. Testing

No project-wide test suite exists (YAML + Pi deployment). The verification loop is:

1. `curl` each rest_command's payload against Grocy directly — as done for this design.
2. Deploy → `check_config` → restart → wait **60-90 s** (new YAML entities appear late).
3. Exercise each of the four resolution rules by text through Assist **before** using voice, which
   isolates intent logic from speech recognition.
4. Confirm via `GET /api/objects/meal_plan` that the right row shape was written, and delete probes.
