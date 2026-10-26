---
name: decisions
description: Gather every open decision waiting on the user, rank them, and get answers, either one at a time in chat (default) or all at once on an interactive page with preset options and a copy-all button. Use when the user says "what do I need to decide", "go through the decisions", "decisions one by one", "what do you need from me", "waiting on me", or asks for a decision page.
argument-hint: "[page]"
---

# decisions

Two ways to put the open decisions in front of the user:

| | **chat** (default) | **page** (`/decisions page`) |
|---|---|---|
| Shape | one decision at a time, wait for the answer, then the next | every decision on one page, answered in any order |
| Best for | a handful of linked decisions, where earlier answers change later ones | many independent decisions, or answering away from the terminal |
| Answers come back | as chat replies | pasted back from the page's "Copy all responses" button |

## 1. Gather the decisions (both modes)

- Sweep everything still open: the current conversation, plans, investigations,
  PRs, reports, agent outputs, draft files, and (in page mode) earlier rounds
  under `DECISIONS_DIR` for items still unanswered.
- Include a decision only if it is truly the user's to make: a ship go, a
  production write or flag flip, shared code, infrastructure or permissions, an
  outward message, a scope or priority call.
- Leave out anything you can settle yourself by checking the code or data:
  check it instead of asking. Leave out anything already answered.
- Verify each item is still open (PR state, run logs, the latest messages).
  Drop stale ones.
- Rank by importance: blast radius, reversibility, and what it blocks.

Every decision is written in plain English with no jargon left unexplained.
Assume the user has forgotten the details and should not have to open anything
else to decide.

## 2a. Chat mode

1. Show the ranked list first as a short table: number, the decision in one
   line, why it ranks there.
2. Then present **one decision at a time**:
   - **The decision:** what exactly needs choosing.
   - **Background:** everything needed to decide.
   - **Options:** what happens with each, its trade-offs and risks.
   - **Recommendation:** which option and why.
   - **What it unblocks or affects:** later decisions or work that depend on it.
3. Stop after each one and wait for the answer. Carry each answer into the
   decisions that follow.
4. When all are done, give a summary table of every decision and the choice made,
   then act on them.

## 2b. Page mode

### Configuration

| Setting | Default | Use |
|---|---|---|
| `DECISIONS_DIR` | `./.claude/runs/decisions` | Where each round's page is written (`decisions-<date><suffix>/`) and where earlier rounds are swept for unanswered items |

### Each decision card

- **ID** (short, e.g. `D3`), a **title** phrased as the decision, and an
  **urgency** tag: urgent / today / when you can.
- **Context:** what it is and why it matters now, what happens with each
  choice, cost or risk where relevant, and the PR, project or file names
  involved. A small chart or flow only when it makes the point faster than prose.
- **2–4 options.** The recommended one is pre-selected and labelled
  "Recommended". A final **"Other"** option has a free-text box. Each card also
  has an optional notes box.

### The page

- Group the cards by theme: unblocks work now / ships / comms / later.
- A sticky progress meter at the top, plus a "reset to recommendations" button.
- A live read-only textarea with the compiled answers, in this format:
  `D3 <title>\n  → <chosen option> [rec] | note: …`
- A fixed **"Copy all responses"** button using `navigator.clipboard`, falling
  back to selecting the textarea text.
- Answers saved in `localStorage`, wrapped in try/catch.
- Escape every piece of decision text before inserting it (titles, context and
  options come from session data).
- Light and dark mode, works at 400px wide, a title of 2–4 words.

Keep the data in one array so the next round only swaps data:
`G = [{g, qs:[{id,u,t,ctx,o:[[label,sub,isRec]]}]}]` (group, then questions with
id, urgency, title, context, options); charts go in a separate `V` map keyed by
question id. If an earlier round exists under `DECISIONS_DIR`, reuse its HTML
and bump the `localStorage` key so old answers don't leak in.

### Publish

- Write the page to `DECISIONS_DIR/decisions-<date><suffix>/index.html` as the
  durable local copy. If the session has a tool for publishing pages, publish
  it there too; otherwise open the local file.
- Reply with the link or path and a one-line count, e.g. "14 decisions, 4 urgent".
- When the pasted answers come back, act on each one, or relay it to the
  session that owns it, naming the exact target, action or PR.
