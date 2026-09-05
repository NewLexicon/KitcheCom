# ChoreOps Gamification Blueprint — KitchenCOM (2026-07-02)

**Status:** DRAFT — awaiting user sign-off + real ages before UI entry.
**Economy:** 1 point = **$0.10** · single-currency (points earned from chores/bonuses, spent on rewards) · default chore = 5 pts.
**Depth:** Full-send — chores + rewards + all 5 badge types + achievements + bonuses + penalties.
**Reward types requested:** screen time + money/allowance + privileges/experiences + treats.
**Cash mechanic:** cash-out reward tiers (kid redeems tier → parent hands over cash → points deduct).

**ASSUMPTION TO CONFIRM:** Rowan = older, Wystan = younger (per-kid split below built on this — swap if wrong). User has not yet given exact ages.

**Already exists in ChoreOps (from Task 6/7 setup):** chore `trash`, rewards `treat` + `cash`, bonus `cheerful`, penalty `demerit`. These get RETUNED/expanded per below, not recreated.

---

## 1. CHORES

### Wystan (younger)
| Chore | Points | Recurrence |
|---|---|---|
| Make bed | 3 | Daily |
| Dirty clothes in hamper | 2 | Daily |
| Feed pet / water plants | 3 | Daily (if applicable) |
| Tidy toys / room pickup | 4 | Daily |
| Set the table | 3 | Daily (dinner) |
| Brush teeth AM+PM | 2 | Daily |
| Take trash to bin | 5 | Weekly *(exists: "trash")* |

Daily ≈ 17 pts (~$1.19/day, ~$8.30/wk).

### Rowan (older)
| Chore | Points | Recurrence |
|---|---|---|
| Make bed | 3 | Daily |
| Dishes / load dishwasher | 8 | Daily |
| Homework done | 5 | Daily (school days) |
| Tidy room | 4 | Daily |
| Take out trash & recycling | 6 | Weekly |
| Vacuum common area | 8 | Weekly |
| Help with dinner prep | 6 | 2–3×/wk |
| Laundry (own) | 7 | Weekly |

Daily ≈ 20 pts (~$1.40/day, ~$10+/wk).

### Family/shared (either kid; rotation or first-come)
| Chore | Points | Recurrence |
|---|---|---|
| Wipe kitchen counters | 4 | Anytime |
| Sweep floor | 5 | Anytime |
| Bring in groceries | 5 | As needed |
| Weekend big-help (yard/garage/car) | 15 | Weekend |

Parents (Garrett, Rebecca) are `can_be_assigned` too — can self-assign shared tasks.

---

## 2. REWARD STORE

### Screen Time
| Reward | Cost |
|---|---|
| 15 min | 10 pts |
| 30 min | 18 pts |
| 1 hour | 32 pts |
| Movie night pick | 25 pts |

### Cash-Out Tiers (allowance mechanic)
| Reward | Cost | Payout |
|---|---|---|
| $1 | 10 pts | *(retune existing "cash")* |
| $5 | 50 pts | |
| $10 | 100 pts | |
| $20 | 200 pts | |

### Privileges / Experiences
| Reward | Cost |
|---|---|
| Stay up 30 min late | 20 pts |
| Pick dinner menu | 15 pts |
| Friend over / playdate | 40 pts |
| Choose weekend activity | 50 pts |
| Day trip / special outing | 150 pts |

### Treats / Small Items
| Reward | Cost |
|---|---|
| Special snack / candy | 8 pts *(exists: "treat")* |
| Small toy / trinket | 30 pts |
| Ice cream outing | 25 pts |

---

## 3. BADGES (all 5 types)
| Type | Badge | Trigger |
|---|---|---|
| Daily | Clean Sweep | All daily chores in one day |
| Cumulative | Century Club | 100 lifetime points |
| Cumulative | 500 Club | 500 lifetime points |
| Periodic | Perfect Week | All assigned chores for a full week |
| Special Occasion | Holiday Helper | Extra chores during a holiday |
| Achievement-linked | Streak Master | Tied to 7-Day Streak achievement |

## 4. ACHIEVEMENTS
| Achievement | Goal |
|---|---|
| Perfect Week | Every assigned chore Mon–Sun *(ChoreOps ships this)* |
| 7-Day Streak | ≥1 chore every day for 7 days |
| Chore Champion | 250 chores lifetime |
| Early Bird | Morning chores before 9am, 5 days running |

## 5. BONUSES (parents grant)
| Bonus | Points |
|---|---|
| Above & Beyond | +10 *(retune existing "cheerful")* |
| Great Attitude | +5 |
| Helped a Sibling | +8 |
| Initiative | +7 |

## 6. PENALTIES (light — positive reinforcement preferred)
| Penalty | Points |
|---|---|
| Missed Chore | −5 *(retune existing "demerit")* |
| Reminder Needed | −2 |

---

## Build order (matters — ChoreOps dependency rules)
1. Chores (per-kid + shared) — retune `trash`, add the rest
2. Rewards — retune `treat`/`cash`, add screen-time/privileges/tiers
3. Bonuses — retune `cheerful`, add the rest
4. Penalties — retune `demerit`, add "Reminder Needed"
5. Badges (all 5 types) + Achievements
6. THEN Task 8 Dashboard Generator (needs all identities/chores/rewards to exist first)

## Open items before UI entry
- [ ] User sign-off on this blueprint (chores/values/rewards)
- [ ] Real ages for Rowan + Wystan (assumed Rowan older)
- [ ] Confirm pet/plants + school-days recurrence apply to this household
