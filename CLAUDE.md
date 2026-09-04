# KitchenCOM — Project Instructions

## Cold-open doc

Start every session by reading `docs/session-state/README.md`. On a feature
branch, also check for a branch-specific cold-open in the same directory.

## Write read targets as absolute paths

**Rule:** every path a Bash command *reads from* must be absolute — including
after a `cd`.

```bash
# prompts for approval
cd /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card
grep -rn "advanceBag" src/ test/

# runs without prompting
grep -rn "advanceBag" \
  /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card/src/ \
  /Users/jdehart1/___Code_DEV/KitchenCOM/custom_cards/screensaver-card/test/
```

**Why:** four `Read()` deny rules in `~/.claude/settings.json` protect
credentials — `Read(**/.env)`, `Read(**/.env.*)`, `Read(**/secrets*)`,
`Read(**/credentials*)`. When the CLI cannot statically resolve what a command
will read, it cannot prove the target won't match one of those globs, so it
escalates to a human. A relative `src/` is unresolvable; an absolute path is not.

**Do not "fix" this by:**

- *Removing the deny rules.* They are the arming condition, so removing them
  would silence the prompt — but this repo holds live Supabase and Gemini
  credentials. Never trade credential protection for syntax convenience.
- *Adding a `Bash(cd *)` allow-rule.* Already tried and falsified: it was in
  the project settings and did not fire. The escalation is about the
  unresolvable **read target**, not the `cd`.
- *Blaming `cd`.* An earlier diagnosis said "never use `cd`." It is wrong:
  `cd` with an absolute path followed by a relative `grep` still prompts.
  `cd` is fine; relative *read targets* are not.

The `cd` case is one member of a family of related checks — sibling escalation
reasons in the binary include `deniedPathInsideDirectory`, runtime-determined
path arguments, and shell-expansion. A similar prompt on a command containing
no `cd` at all is the same system, not a new mystery.

**Not applicable to revspecs.** `git diff --stat newlexicon/main...HEAD` is a
revision range, not a path, and has no absolute form. This rule covers path
arguments only.

## Verify before claiming success

A command that reports success has not necessarily done anything. Several
traps in this project return HTTP 200 or exit 0 while silently accomplishing
nothing (AdGuard's `/clients/update`, `sudo` without `-n` writing zero bytes,
a valid gzip stream containing no data). Check the artifact — byte counts,
row counts, actual content — not the exit code.

## Shell redirection and `sudo`

`sudo cmd > /path/file` runs the redirection as the *unprivileged* shell, so it
fails on paths only root can write. Use `sudo sh -c 'cmd > /path/file'` instead.
