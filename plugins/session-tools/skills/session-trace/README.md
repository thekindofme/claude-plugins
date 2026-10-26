# session-trace

`scripts/render-trace.py` turns a local Claude Code transcript into one
self-contained HTML trace viewer: a time-ordered span tree on the left (user
turns, assistant text, thinking, tool calls, nested subagent runs, compaction
events), a detail pane on the right with the full redacted input and output of
whatever you click, a top strip of run stats, filters and search, per-span notes
you can export as JSON, and — when you pass `--report` — a findings panel that
takes a finding title out of the report and highlights every span that fed
it. Everything is inline and it works from `file://`; credentials are stripped
before anything reaches the page.

```
python3 scripts/render-trace.py \
  ~/.claude/projects/<project-slug>/<session-id>.jsonl \
  --out ~/reports/session-traces/my-run.html \
  --title "Analyst run, 15 Sep 2026" \
  --report ~/reports/my-run/report.html

python3 scripts/render-trace.py \
  ~/.claude/projects/<project-slug>/<session-id>/subagents/agent-<agent-id>.jsonl \
  --out ~/reports/session-traces/my-subagent.html \
  --title "One subagent of that run"
```
