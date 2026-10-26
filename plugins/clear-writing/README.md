# clear-writing

Three skills that make Claude explain and write for people rather than for other models.

| Skill | Use it for |
|---|---|
| `plain-english` | Re-explain something confusing for a reader with zero background, and draft prose without LLM tells (mic-drop closers, "X, not Y" snaps, rhetorical bolding). Triggers on "plain english", "explain this properly", "ELI5", "de-LLM this", or a pasted blob with no instruction. |
| `explain` | A mode for the rest of the session: every answer opens with a one- or two-sentence recap, offers 3–5 numbered threads, and stops so you pull the detail you want. `/explain page` renders a self-contained HTML page with diagrams instead. Explicit invocation only. |
| `doc-rewrite` | Rebuild a document that grew by accretion: a parallel review fleet (structure, zero-context reader, number consistency, LLM vocabulary and rhetoric), then a from-scratch rewrite into a new file. The original is never edited. |

`plain-english` sets the voice; `explain` sets the structure; `doc-rewrite` applies both to an existing document.

## Install

```
/plugin marketplace add thekindofme/claude-plugins
/plugin install clear-writing@thekindofme-plugins
```
