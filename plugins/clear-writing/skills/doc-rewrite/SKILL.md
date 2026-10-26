---
name: doc-rewrite
description: Rehabilitate a document that grew by accretion into the version a sharp human would have written from scratch today. Use when the user says "doc-rewrite", "reimagine this document", "this doc feels bolted together / patched / like a changelog", or asks to review and restructure a document as a whole. Never edits the original file.
---

# doc-rewrite

Take a document that was written once and then patched as information arrived,
and write, in a new file beside the untouched original, the version a sharp
analyst would write from scratch today. Core stance: **rewrite, don't patch.**
A doc built by appends can't be fixed by more appends.

## What the rewrite must achieve

- The answer and open decisions first; preconditions before the proposals that
  stand on them; discovery history compressed into an appendix.
- Every fact told once, in the section that owns it. Elsewhere, cross-reference.
- Every number reconciled into one table. Conflicts are resolved or explained,
  never left side by side.
- Superseded positions kept as a marked decision record, not as live text.
- Prose a smart outsider can read cold: terms defined before use, statistics
  glossed inline, no insider vocabulary, one naming policy.
- No visible archaeology (dates in headings, "this arrived later", changelog
  furniture). One as-of stamp. Late findings rewrite the claims they supersede.
- None of the LLM tells: mic-drop closers, uniform claim → evidence → zinger
  paragraphs, rhetorical bolding, intensifiers, personified abstractions.
  `plain-english` holds the voice rules; `references/style-rules.md` holds the
  doc-specific ones.
- The original's important claims survive, sharpened rather than lost.

**Announce at start:** "Using doc-rewrite: review fleet → synthesis →
from-scratch rewrite in a new file → render check. Original untouched."

## Inputs

- Path or URL of the document. Any format; HTML and markdown are the happy path.
- Optional steer: audience ("assume zero context" is the default), what must
  survive, target length.

## The recipe

1. **Read the whole document yourself.** You hold full context; reviewers get
   lenses, not the synthesis job. Note the seams you spot. They seed the plan
   and cross-check the reviewers.

2. **Run the review fleet in parallel**, one subagent per lens, all launched in
   one message. Paste-ready prompts are in `references/review-lenses.md`.

   | Lens | Model |
   |---|---|
   | Structure seams, bolt-on map, redundancy map, ideal skeleton | your strongest model |
   | Zero-context reader audit (jargon, forward references, name leaks) | a mid-tier model |
   | Number and fact consistency (conflicting counts, superseded claims) | a mid-tier model |
   | LLM vocabulary (word and phrase tells) | a mid-tier model |
   | LLM rhetoric (mic-drop closers, uniform paragraph shape, bold abuse) | a mid-tier model |

   Skip the two style lenses if the user only wants restructuring.

3. **Optional independence pass.** For an important doc, give one fresh-context
   judge a self-contained bundle (the doc plus its marching orders, also in
   `references/review-lenses.md`). If the judge's skeleton and the structure
   lens's skeleton converge, the diagnosis holds and you can proceed.

4. **Synthesize** the findings into (a) the new section skeleton, (b) the
   number-reconciliation table, (c) the kill list. Where sources conflict, pick
   the best-evidenced value and note the variant in the new doc. Never choose
   silently, and never let two values coexist.

5. **Rewrite from scratch** into a new file next to the original
   (`<name>-vN`). Reuse the chrome (CSS, JS, page shell) if the design is fine:
   the problem is the content. Apply `references/style-rules.md` while writing,
   not as a pass afterwards.

6. **Verify before delivering.** HTML: open it in a real browser (a browser
   automation tool, or headless Chrome), click every nav item, check that no
   section is empty and the console has no errors, and take a screenshot.
   Markdown: check headings, links and anchors render.

7. **Deliver**: the old → new section map, which numbers were reconciled and
   how, and what was cut versus moved to an appendix. Offer the original's
   owner a diff of claims, not of lines.

## Non-negotiables

- The original file is untouched; the rewrite lands in a new file.
- One canonical home per fact.
- One reconciled number table, quoted everywhere.
- Superseded forks and positions move to a decision-record appendix.
- Facts end sections. At most one attributed aphorism per document.

## Related

- `plain-english`: the voice rules on their own, for any writing outside a
  full rewrite.
- `explain`: for presenting something complicated recap-first, rather than
  rehabilitating an existing document.
