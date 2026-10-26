---
name: explain
description: Standing mode-switch for presenting complicated things recap-first. From now on every answer opens with a 1–2 sentence recap (the verdict, or the map of the whole), offers 3–5 numbered threads as hooks, and stops so the user pulls the detail in the order they choose. Diagrams carry the mechanisms. Arguments pick the surface and depth, e.g. `/explain page`, `/explain page deep`. Explicit invocation only.
argument-hint: "[page] [deep] [what to explain]"
disable-model-invocation: true
---

# explain

**BLUF, then progressive disclosure, for the rest of this session.** Open with
the recap. Offer the threads. Stop. The user pulls depth in the order they
choose, and may ask anything rather than pick a thread.

Read `references/principles.md` (next to this file) now, before your first
answer. It holds the rules for the recap, the levels, the threads, picking a
visual, and the text budget. This file only says how to run them.
`plain-english` governs the voice.

## Arguments

`$ARGUMENTS`

| Word | Means |
|---|---|
| *(none)* | chat: recap and threads in the terminal |
| `page` | a local HTML page |
| `deep` | draw every level up front instead of only levels 0–1 |
| anything else | the thing to explain. If it's empty, explain the most recent substantial thing in this session |

The surface applies to this invocation. Afterwards, the mode continues in
chat, and the user can ask for a page again at any point.

## In chat (the default)

1. **Recap**: one or two sentences, plus at most one small ASCII diagram.
2. **Threads**: 3–5 numbered hooks, most important first.
3. **Stop.** Don't follow the threads with more detail, a summary of the
   threads, or "let me know if…".

```
✅ Right                                        ❌ Wrong (each thread is a paragraph)
Every order is held until payment clears; a     Three services write orders into one
retry job is the only path that releases it.    table, and every order starts out held
                                                until payment clears. The exception is
[small diagram]                                 small orders from trusted… (4 sentences)

1. The retry job is the only release path       1. **The retry job is the only release
2. Small trusted orders skip the hold              path.** Payment webhooks only mark
3. Five checks run before an order ships           the order paid. The retry job then
4. The job polls every 30s, 50 at a time           runs three checks: fraud, stock… (4 more)
```

When the user pulls a thread (`2`, or a question), answer it the same way: the
recap of *that* thread, then its own threads if it has depth left. If the
answer is short enough to need no threads, just answer. The shape is for
complexity, not ceremony.

Diagrams in chat are ASCII: boxes, arrows with labels on them, tables, trees.
When a real chart or a proper diagram would clearly beat ASCII, offer it as a
thread ("📊 the timings as a real chart", "🧭 the whole flow as a page").
Don't build it until it is pulled.

## As a page

A single local HTML file. **Not** a claude.ai artifact: if you switch Claude
accounts, artifacts on the old account become unreachable.

- Write to `~/.claude/explain/YYYY-MM-DD-<slug>/index.html`, self-contained
  (inline CSS, inline SVG, no network), light and dark mode.
- Top of the page: the recap sentence, then the overview diagram with its
  regions marked ①②③ to match the threads.
  Then a row of linked thread hooks. Then one section per thread, each
  opening with its hook as a one-line recap, then its diagram, then the detail.
- Diagrams are inline SVG following the Anthropic `artifact-diagramming`
  rules (`viewBox`, `currentColor`, labelled arrows, a `<figure>` with a
  caption). Charts follow the `dataviz` method: the data's job picks the form.
  An animation goes in only where something actually moves over time.
- Without `deep`, sections carry level 1 and enough of level 2 to stand on
  their own. With `deep`, carry everything, still below each section's recap.
- Look before showing: screenshot it headless and fix overflow, overlapping
  labels and unreadable dark-mode text.

  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
    --disable-gpu --window-size=1400,2400 --user-data-dir="$DIR/.chrome-shot" \
    --screenshot="$DIR/preview.png" "file://$DIR/index.html"
  ```

  Chrome sometimes writes the PNG and then doesn't exit. Run it with
  `run_in_background`. Once the PNG exists, kill it by matching its
  `--user-data-dir`. Check dark mode (`--force-dark-mode`) and phone width
  (`--window-size=390,…`) the same way. At phone width, wide diagrams must
  scroll sideways inside their figure, not shrink until they can't be read.

- Open it with `open "$DIR/index.html"` and reply in chat with the recap,
  the path, and the threads.


## Turning it off

"full detail", "dump it all", "just tell me everything" or "stop explaining
like that" ends the mode. Answer normally from then on.

## If this skill is ever invoked automatically

Auto-invocation is off (`disable-model-invocation: true`). If that changes,
apply the mode only to answers that would not fit on one screen, and answer
anything shorter directly.

## Don'ts

- No wall of text after the threads.
- No recap that only describes the answer ("this covers X and Y"). State the thing.
- No topic-label threads ("Performance", "Data model"). Make each a hook carrying its finding.
- No ordering threads by system structure when importance differs.
- No visuals for decoration. If a sentence says it faster, write the sentence.
- No cloud artifacts for pages.
