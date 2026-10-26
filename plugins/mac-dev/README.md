# mac-dev

Three runbooks for developers on macOS.

| Skill | What it does |
|---|---|
| `mac-disk-cleanup` | Finds where your disk went, shows a ranked menu (dev caches, Xcode DerivedData, Ollama models, installers in Downloads, merged git worktrees), deletes only what you approve, and reports free space after each step. Never touches `~/.claude` or paths you list in `KEEP_PATHS`. |
| `aws-sso-autorefresh` | Installs a LaunchAgent that refreshes your AWS IAM Identity Center token every 15 minutes, so one `aws sso login` lasts as long as the portal session. Optionally sets up a readonly fallback profile (read the warning in the skill first). |
| `mac-agent-host` | Runbook for an always-on Mac used as a headless Claude or Codex host: SSH PATH gotchas, unlocking the keychain for headless `claude`, LaunchAgents in the GUI domain, syncing repos. |

Each skill lists its settings in a Configuration table at the top.

## Install

```
/plugin marketplace add thekindofme/claude-plugins
/plugin install mac-dev@thekindofme-plugins
```
