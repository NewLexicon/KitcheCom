# New-Laptop Setup Handoff — KitchenCOM (temporary, ~1 week)

> **Context:** The primary Mac's monitor is broken and out for ~1 week. This handoff
> reproduces the full dev environment on a loaner Mac. The `___Code_DEV/` folder is
> being copied over manually; this file covers everything that lives *outside* that
> folder (system tools, Claude Code plugins/skills, auth, shell config).
>
> **Hand this whole file to a fresh Claude Code session on the new laptop and say:
> "Set this up. Walk me through it and ask me before anything that needs my login."**

---

## 0. What you're rebuilding (inventory from the source machine)

Source machine state, captured 2026-06-17:

| Layer | What's installed |
|---|---|
| **Package manager** | Homebrew 5.1.15 (`/opt/homebrew` — Apple Silicon) |
| **Brew formulae** | `gh`, `ripgrep`, `python@3.13` (only manually-installed leaves) |
| **Node** | nvm-managed Node **v24.15.0**, npm 11.12.1 |
| **Global npm** | `vercel@54.x` (corepack/npm are built-ins) |
| **Bun** | 1.3.11 (`~/.bun`) — only needed for the `claude-mem` alias |
| **Python tools** | `uv` (`~/.local/bin`), `yamllint` 1.37.1 (pip user install) |
| **Claude Code** | v2.1.179, installed to `~/.local/bin/claude` |
| **Claude plugins** | `superpowers`, `vercel`, `claude-code-setup`, `claude-hud` |
| **Claude MCP servers** | `playwright`, `pencil`, `claude.ai Google Drive`, `vercel` |
| **gh auth** | account **NewLexicon**, scopes: repo/workflow/gist/read:org |
| **SSH keys** | `id_ed25519` (GitHub), `id_kitchencom` (Pi at 192.168.1.225) |

> Note: `___Code_DEV/KitchenCOM/.claude-flow/` is leftover data only (no binary) — ignore it.
> The global `~/.claude/CLAUDE.md` profile and the per-project memory dir are **important** — see §6.

---

## 1. Core system tools

```bash
# Homebrew (Apple Silicon path is /opt/homebrew) — installer is interactive, needs sudo
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Follow its post-install instructions to add brew to PATH in ~/.zprofile, then:

brew install gh ripgrep python@3.13
```

```bash
# nvm + the exact Node version the project was built against
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal (or source ~/.zshrc), then:
nvm install 24.15.0
nvm alias default 24.15.0
npm install -g vercel
```

```bash
# uv (Python toolchain) and yamllint (required by `npm run validate:yaml`)
curl -LsSf https://astral.sh/uv/install.sh | sh
python3 -m pip install --user yamllint
# yamllint installs to a pip user-scripts dir that may not be on PATH.
# The project invokes it as `yamllint`; if "command not found", either add that dir
# to PATH or run `python3 -m yamllint -c .yamllint homeassistant/` instead.
```

```bash
# Bun — ONLY needed if you use the claude-mem alias (see §5). Skip otherwise.
curl -fsSL https://bun.sh/install | bash
```

---

## 2. Claude Code + plugins/skills

```bash
# Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash    # installs to ~/.local/bin/claude
# then run `claude` once and log in (browser auth).
```

**Plugins** — add the two marketplaces, then install. Inside a `claude` session:

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
/plugin install vercel@claude-plugins-official
/plugin install claude-code-setup@claude-plugins-official
```

- **`superpowers`** is the important one — it's the skill engine (brainstorming, TDD,
  writing-plans, requesting-code-review, etc.) this project relies on heavily.
- `vercel` and `claude-code-setup` are nice-to-have.
- `claude-hud` came from a third marketplace (`thedotmack`); it's a HUD/statusline
  cosmetic — only re-add if you miss it. Not required for KitchenCOM work.

> The custom skills under `~/.claude/skills/` (brainstorming, recall, test-narrative, …)
> are **provided by the superpowers plugin** — installing the plugin restores them.
> You do NOT need to hand-copy that folder. The two project-specific bits worth copying
> are the global profile and memory (see §6).

---

## 3. MCP servers

Re-register the local (npx/binary) servers. The two HTTP ones (Google Drive, Vercel)
re-auth themselves on first use in-session.

```bash
# Register the Playwright MCP server
claude mcp add playwright -- npx @playwright/mcp@latest

# IMPORTANT: download the actual browser binaries Playwright drives.
# The `claude mcp add` line above only registers the SERVER; on a clean machine the
# browsers aren't present and the MCP errors the first time it tries to drive one.
# The source machine had chromium + firefox + webkit + ffmpeg cached in
# ~/Library/Caches/ms-playwright/. Reproduce that with:
npx playwright install         # all browsers, or `npx playwright install chromium` for just Chromium
```

- **`pencil`** is tied to a local install at `~/.pencil/...` (the Pencil app/VS Code
  extension). If you don't need .pen design files this week, skip it. If you do,
  reinstall the Pencil VS Code extension on the new laptop and it re-registers.
- **Google Drive** / **Vercel** MCP: just trigger them in-session and approve the
  browser auth prompt when it appears.

---

## 4. Auth & SSH (you must do these — they need your logins)

```bash
gh auth login            # choose GitHub.com, account NewLexicon, HTTPS, paste/scopes: repo,workflow,gist,read:org
```

**SSH keys** — two keys are in play. Easiest: copy `~/.ssh/id_ed25519*`,
`~/.ssh/id_kitchencom*`, and `~/.ssh/config` from the old machine onto the new one
(then `chmod 600` the private keys). The relevant `~/.ssh/config` blocks:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  AddKeysToAgent yes
  UseKeychain yes

Host kitchencom
  HostName 192.168.1.225
  User garrettdehart
  IdentityFile ~/.ssh/id_kitchencom
  IdentitiesOnly yes
```

- `id_ed25519` authenticates to GitHub as **NewLexicon** → verify with `ssh -T git@github.com`.
- `id_kitchencom` drives the Pi → verify with `ssh kitchencom` (Pi at 192.168.1.225).
  ⚠️ The Pi is on **your home LAN**. From a loaner laptop on a different network you
  won't reach 192.168.1.225 — Pi work waits until you're back on the home network.
- VS Code / Claude Code may need macOS **Local Network** permission granted before
  `ssh kitchencom` works (System Settings → Privacy & Security → Local Network).

---

## 5. Shell config (`~/.zshrc`)

Append these (PATH entries + the claude-mem alias). The alias points into the
`Inter_narrative_26` project folder, so it only works if that folder came over too:

```bash
export PATH="$HOME/.local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# claude-mem (optional; needs Inter_narrative_26 folder + bun)
alias claude-mem='/Users/<user>/.bun/bin/bun "/Users/<user>/___Code_DEV/Inter_narrative_26/plugins/claude-mem-main/plugin/scripts/worker-service.cjs"'
```

> Replace `<user>` with the new machine's home dir (it was `jdehart1` on the source Mac;
> it may differ). If you skip Bun/claude-mem, drop that alias and the Bun block.

---

## 6. Claude global profile + project memory (copy these — they're not regenerable)

These are the "who Garrett is / how Claude should work" files. **Copy them from the old
machine** (they aren't restored by plugin installs):

- `~/.claude/CLAUDE.md` — your global profile (system prefs, git/SSH notes, session
  auto-save rule, cold-open rule, review-depth calibration). Big file, hand-authored.
- `~/.claude/settings.json` and `~/.claude/settings.local.json` — global permissions/env.
- The project's own `KitchenCOM/.claude/settings.local.json` — a 50+ entry permission
  allowlist (git/gh/npm/ssh-kitchencom/yamllint/etc. pre-approved). This lives *inside*
  `___Code_DEV/`, so it travels with the copy — just don't let a fresh session regenerate
  an empty one over it. If it's missing after copy, you'll get re-prompted for each command
  (annoying but harmless).
- `~/.claude/agents/` (`architect.md`, `worker.md`) and `~/.claude/commands/`
  (`brainstorm.md`, `write-plan.md`, `execute-plan.md`) — your custom agents/commands.
- The **per-project memory dir**:
  `~/.claude/projects/-Users-<user>----Code-DEV-KitchenCOM/memory/`
  (the `MEMORY.md` index + individual fact files — GitHub remote, Pi SSH, kiosk notes,
  ChoreOps templates, etc.). On the source machine the path segment was
  `-Users-jdehart1----Code-DEV-KitchenCOM`; the new machine's path encodes its own home
  dir, so the folder name will differ — copy the *contents* into the new machine's
  equivalent project-memory folder.

> If the new home-dir username differs, the safest move is: copy `~/.claude/CLAUDE.md`
> verbatim, and copy the memory *files* into whatever
> `~/.claude/projects/<encoded-KitchenCOM-path>/memory/` the new machine creates the
> first time you open Claude Code in the KitchenCOM folder.

---

## 7. Project bring-up (after `___Code_DEV/` is copied)

```bash
cd ~/___Code_DEV/KitchenCOM

# YAML validation (needs yamllint from §1)
npm run validate:yaml

# The one custom card — install deps + run its tests (expect 9 passing: 4 idle + 5 media)
cd custom_cards/screensaver-card
npm install
npm test
```

- Root `package.json` only defines `validate:yaml` (no root `npm install` needed).
- The card uses `lit` + `vitest` + `typescript` — `npm install` in that subfolder
  pulls them. `npm run build` (tsc) and `npm run typecheck` are also available.
- `reference/` is gitignored upstream HA source — not needed for the week's work.

---

## 8. Verify everything (run these, confirm output)

```bash
brew --version            # 5.x
node --version            # v24.15.0
yamllint --version        # 1.37.x  (or: python3 -m yamllint --version)
claude --version          # 2.1.x
gh auth status            # Logged in as NewLexicon
ssh -T git@github.com     # "Hi NewLexicon!"
npx playwright install --dry-run   # confirms which browsers are present/missing
# In a claude session: /plugin  → confirm superpowers is listed and enabled
# In a claude session: /mcp     → confirm playwright shows "Connected"
cd ~/___Code_DEV/KitchenCOM && npm run validate:yaml   # clean
cd custom_cards/screensaver-card && npm test           # 9 passing
```

---

## What you can safely SKIP for a 1-week loaner

- **Pi work** (`ssh kitchencom`) — only reachable on the home LAN.
- **`pencil` MCP / Pencil app** — unless you're editing `.pen` files.
- **`claude-hud`**, **Bun + claude-mem alias** — cosmetic / cross-project conveniences.
- **`uv`** — only if a tool you use this week needs it; yamllint is the only hard Python dep.
