# deploy/backups

Point-in-time copies pulled off the Pi before destructive changes. Not deployment
artifacts — recovery material.

| File | Taken | Why |
|---|---|---|
| `local_todo.chores.ics.bak-20260817` | 2026-08-17 | Before deleting the orphaned `todo.chores` `local_todo` entry (Task 10). Contains only June wiring-test items (a completed "Rowan" entry). ChoreOps superseded this list. |

The Pi keeps its own copy alongside the live file
(`.storage/local_todo.chores.ics.bak-predelete-20260817-1723`); this is the
off-device duplicate.
