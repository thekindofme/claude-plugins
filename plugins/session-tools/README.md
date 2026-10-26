# session-tools

Two skills for working with long, agent-heavy Claude Code sessions.

| Skill | What it does |
|---|---|
| `session-trace` | Renders a session transcript, and every subagent it spawned, as one self-contained HTML trace viewer: a span tree with timings, a detail pane with full inputs and outputs, search and filters, run stats, and per-span notes you can export. With `--report`, a findings panel jumps from a claim in a report to the spans that produced it. Credentials and email addresses are redacted before anything is written. Python 3, standard library only. |
| `decisions` | Gathers every open decision waiting on you and ranks it. By default it walks you through them one at a time in chat; `/decisions page` builds a single page with every decision, preset options, a recommended pick and a "Copy all responses" button to paste back. |

For a live decision card above the prompt instead, see [doctorkon](../doctorkon).

## Install

```
/plugin marketplace add thekindofme/claude-plugins
/plugin install session-tools@thekindofme-plugins
```
