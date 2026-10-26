---
name: mac-agent-host
description: Use when running, deploying, or debugging anything on an always-on Mac used as a headless coding-agent host ($AGENT_HOST) — running the agent (`claude`/`codex`) headless there, syncing a git repo onto it, setting up or fixing an always-on LaunchAgent/poller, or when a headless agent reports "Not logged in" over SSH.
user-invocable: true
---

# Mac agent host

Runbook for operating an always-on Mac (a Mac mini in a cupboard, an old laptop) as a headless
Claude / coding-agent host. Keep live specifics (which agents are deployed, IAM users, MCP config,
where the account password is stored) in your own notes or memory, not in this skill.

## Configuration

| Variable | Example | Meaning |
|---|---|---|
| `AGENT_HOST` | `agent-mac` | SSH host name of the Mac (prefer a stable DNS / Tailscale MagicDNS name) |
| `AGENT_USER` | `agent` | Login account on the host that runs the agents |
| `AGENT_GH_USER` | `my-agent-bot` | GitHub identity the host uses (if it has its own) |

Below, `$AGENT_USER@$AGENT_HOST` is written as `$HOST_SSH`.

## Connect
- `ssh $AGENT_USER@$AGENT_HOST` — use a stable **name** (e.g. Tailscale MagicDNS), not the IP, so
  the host key stays trusted.
- **PATH gotcha:** non-login SSH shells have no tool PATH. Prefix every remote command with
  `export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"` — `claude` lives in `~/.local/bin` (added
  by interactive `.zshrc` only); `node`/`aws`/`python3` are brew, loaded by the login `.zprofile`.
  (Or `zsh -lic '...'`.)
- zsh: unquoted `$VAR` does **not** word-split (use literal lists/arrays); avoid nesting
  `[ -n "$x" ]` inside escaped-quote `echo`s over SSH.

## Headless `claude` auth — the keychain problem
Over plain SSH, `claude -p` returns **"Not logged in"**: the login keychain (holding the OAuth token)
is locked for SSH sessions. Two fixes:

- **One-off (SSH):** unlock the keychain, then run claude as a child of that same shell. Pipe the
  password via stdin so it never lands in argv / shell history:
  ```bash
  printf '%s\n' "$PW" | ssh "$HOST_SSH" 'IFS= read -r P
    security unlock-keychain -p "$P" "$HOME/Library/Keychains/login.keychain-db"
    export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
    claude --dangerously-skip-permissions -p "<prompt>"'
  ```
- **Always-on (the clean path):** a **user LaunchAgent loaded into the GUI domain** runs inside the
  logged-in desktop session, where the keychain is already unlocked → claude auths with **no stored
  password**. With auto-login on, it survives reboot. This is the only robust headless-auth path; an
  SSH-spawned `claude` or a system LaunchDaemon (runs as root, no GUI keychain) will not auth.

## Run a one-off headless job
`claude -p` **buffers all stdout until it exits** — track progress via the job's own state/artifact
files, not the log. For long jobs, detach with `nohup … &` (write the pid) and poll across short
follow-up commands rather than blocking one call.

## Sync a git repo onto the host
If the host's GitHub identity (`$AGENT_GH_USER`) **cannot read a private repo**, `git fetch` fails
with "Repository not found". Bundle from a machine that can (your laptop) and reset:
```bash
git -C <repo> bundle create /tmp/x.bundle origin/main
scp /tmp/x.bundle "$HOST_SSH":/tmp/
ssh "$HOST_SSH" 'cd <repo>
  git fetch /tmp/x.bundle "refs/remotes/origin/main:refs/remotes/origin/main"
  git reset --hard <sha>'
```
`reset --hard` only touches **tracked** files, so gitignored `.env`, `~/.aws/`, the agent's user MCP
config (`.claude.json` / Codex equivalent), `node_modules`, and `out/` are all preserved. Re-run
`npm install` only if `package.json` changed.

## Deploy an always-on agent (LaunchAgent)
User LaunchAgent `~/Library/LaunchAgents/<label>.plist` → a wrapper `.sh` that sets PATH + any
`AWS_PROFILE` + `cd`s to the repo + runs `claude --dangerously-skip-permissions -p "/<skill> --once …"`
→ a log. Load/control it over SSH against the **GUI domain** (`gui/$(id -u)`, usually `gui/501`):
```bash
launchctl bootstrap gui/501 ~/Library/LaunchAgents/<label>.plist   # load (also auto-loads at login)
launchctl kickstart -k gui/501/<label>                             # run once now (smoke test)
launchctl print  gui/501/<label> | grep -iE 'state|run interval'   # inspect
launchctl bootout gui/501/<label>                                  # unload
```
Use **`--once` + `StartInterval`** for recurring drains, **not** `ScheduleWakeup`: under headless
`claude -p` there is no re-invocation, so a self-rescheduling skill polls once and dies. launchd
won't start a second copy while a long run is still in flight.

## AWS / unattended
- Give the host a **dedicated IAM user with static access keys** in `~/.aws/credentials` (no SSO
  expiry), scoped least-privilege — not an SSO profile (interactive `aws sso login` can't refresh
  headless). Set `AWS_PROFILE` in the agent's wrapper, not just the shell.
- Auto-login (for reboot resilience) is via `/etc/kcpassword` + the `autoLoginUser` loginwindow pref.
  `sysadminctl -autologin set` errors `SACSetAutoLoginPassword error:22` on macOS 26.x, so set it
  manually: XOR the password with key `[125,137,82,35,210,188,221,234,163,185,31]` (pad to a multiple
  of 11 with zero bytes), **round-trip-verify before writing**, write `/etc/kcpassword` (root:600).
  Requires FileVault off.

## Gotchas
| Symptom | Cause / fix |
|---|---|
| `claude`/`node`/`aws`: command not found over SSH | non-login PATH — prefix `export PATH=…` |
| `claude -p` → "Not logged in" | keychain locked over SSH — unlock, or run via a GUI-domain LaunchAgent |
| `git fetch` → "Repository not found" | host's GitHub identity lacks repo access — bundle-sync from your laptop |
| headless agent polls once then stops | `ScheduleWakeup` doesn't re-invoke under `claude -p` — use `--once` + LaunchAgent `StartInterval` |
| long `claude -p` log stays empty | output buffered until exit — watch artifacts/state, not the log |
| LaunchAgent silent after reboot | GUI session not logged in — confirm auto-login is enabled |
