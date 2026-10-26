---
name: session-trace
description: Render a local Claude Code session transcript as a Braintrust-style HTML trace viewer, so you can walk backwards from a recommendation to the reasoning and the data pull that produced it. Use when the user says "trace this session", "show me the agent trace", "render the transcript as a trace", "why did the agent conclude X, show me the run", "where did that number come from in the run", or wants to audit how an analyst agent reached an insight and whether the skill's instructions misled or constrained it.
---

# Session trace viewer

Turns one `.jsonl` transcript (plus every subagent it spawned) into a single
self-contained HTML page: a span tree on the left, a detail pane on the right,
a findings panel that jumps from a claim in a report to the spans behind it,
and per-span notes you can export.

## Configuration

| env var | default | what it does |
| --- | --- | --- |
| `TRACE_ALLOWED_EMAIL_DOMAINS` | (none) | comma-separated email domains left unredacted |
| `TRACE_GENERIC_WORDS` | (none) | space-separated words too common in your reports to identify a finding (e.g. product or platform names) |

## Run it

```
python3 <this skill's directory>/scripts/render-trace.py \
  <root.jsonl> --out <file.html> [--title "..."] [--report <report.html>] \
  [--findings-section "<h2 regex>"]
```

python3, stdlib only. The root may be a session file or a subagent file.
Every `Agent` tool call is followed into its child transcript and nested as a
collapsible child span, recursively.

**The output is a LOCAL html file.** Tell the user the path and let them open
it, or run `open <file.html>`. Don't publish it as a cloud artifact: the
transcript content stays on this machine, and a local file doesn't get lost
when the user switches accounts.

## Finding the transcript for a run

| what | where |
| --- | --- |
| session | `~/.claude/projects/<project-slug>/<session-id>.jsonl` |
| subagents of that session | `~/.claude/projects/<project-slug>/<session-id>/subagents/agent-<agent-id>.jsonl` |
| what each subagent was | the `agent-<agent-id>.meta.json` beside it (`agentType`, `name`, `description`, `model`, `parentAgentId`, `toolUseId`) |

The project slug is the working directory's absolute path with every `/`
replaced by `-` (so `~/code/myapp` becomes `-Users-<you>-code-myapp`). Do not read a
multi-megabyte transcript into your own context; parse it with python and print
summaries.

Parent to child linkage, in the order the script trusts it:

1. `toolUseResult.agentId` on the `tool_result` record of the `Agent` call.
   Present for both sync and async subagent spawns.
2. `toolUseId` in the child's `.meta.json`.
3. `toolUseResult.name` for a **teammate** spawn (an `Agent` call with `name:`).
   Those get no `toolUseId` in the meta, so they match on the name instead.

## Redaction

Mandatory, and the script does it to every string before anything is written:
JWTs and bare JOSE headers, `Bearer <token>`, `shpat_`/`shpca_`/`shpss_`,
`AKIA…`/`ASIA…` and the values after `SecretAccessKey`/`SessionToken`, `sk-…`,
`pk_…`, `xox[abp]-…`, and every email address outside the allowed domains,
each replaced with `[redacted:<kind>]`. By default every address is
redacted; set `TRACE_ALLOWED_EMAIL_DOMAINS=example.com`
to keep your own work addresses readable.

After rendering, grep the html for `eyJ`, `shpat_`, `AKIA`, `ASIA`, `Bearer `
and `@`, and report the counts. Email domains other than the allowed ones
must be zero. The other patterns come back non-zero from benign text (shell
`grep` patterns, `Bearer $TOKEN` shell variables, base64 pagination cursors,
names containing the letters), so read the context of each hit rather than
trusting the count.

## What the page gives you

- Top strip: session id, start and end, wall time, model turns, per-tool call
  counts, tokens in / out / cache, subagent count, tool errors.
- Span kinds, coloured and indented by depth: user turn, assistant text,
  thinking, tool call, subagent spawn, system, compaction. Relative `mm:ss`
  from the start of the run on every row, plus duration and result size.
- Detail pane on click: full input and output, capped at 12 KB with a
  "truncated, N KB omitted" marker.
- Filter by kind, text search that hides non-matching spans and highlights
  matches, next/previous match, collapse all, tool-calls-only.
- Findings panel with `--report`: the `<h3>` titles under any `<h2>` whose
  text matches `--findings-section` (default
  `suggestion|recommendation|finding`). Click one and every span that mentions its
  distinctive words lights up, and the earliest is selected. This is the
  walk-backwards-from-a-claim feature.
- Notes on any span, saved in `localStorage` per session, with Export notes
  (downloads a JSON file) and Import notes.
