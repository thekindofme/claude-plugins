# thekindofme-plugins

Yasith's Claude Code plugins, as one marketplace.

| Plugin | What it does |
|---|---|
| [doctorkon](plugins/doctorkon) | Decision card above the prompt, plus status updates and a waiting queue in a pane |
| [orca-claude-session-links](plugins/orca-claude-session-links) | A ↗ button under replies that mention an Orca session; a click switches to its tab |
| [clear-writing](plugins/clear-writing) | Skills for plain-English explanations, recap-first answers and rewriting patched-together documents |
| [visual-explainers](plugins/visual-explainers) | Skills for animated diagrams, navigable HTML reports, TL;DR videos and whiteboard videos |
| [session-tools](plugins/session-tools) | A trace viewer for sessions and subagents, and a ranked walkthrough of open decisions |
| [mac-dev](plugins/mac-dev) | macOS runbooks: disk cleanup, AWS SSO auto-refresh, headless agent host |
| [bg-watchdog](https://github.com/thekindofme/claude-bg-watchdog) | Hooks that catch background tasks, subagents and monitors that die or finish unnoticed |

## Install

```
/plugin marketplace add thekindofme/claude-plugins
/plugin install doctorkon@thekindofme-plugins
```

Installing doctorkon also installs orca-claude-session-links. To install it alone:

```
/plugin install orca-claude-session-links@thekindofme-plugins
```
