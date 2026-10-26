# How to present something complicated

The rules `explain` follows. Change a rule here, not in the skill.

**BLUF, then progressive disclosure.** Lead with the bottom line. Show the next
level as a short set of threads. The reader pulls depth, in the order they
choose. Detail they didn't ask for is a wall, even when every word is true.

## 1. The recap comes first

- **The bottom line if there is one, otherwise the shape of the whole thing in
  one breath.** At most two sentences, about 40 words. If it needs more, it
  isn't the bottom line yet. Keep cutting until it is. Qualifications and
  exceptions belong in a thread.
  - Investigation → the verdict: "The 409 is a stale build on dev, not your code."
  - Explanation → the map: "Three systems: X writes, Y queues, Z renders. Y is the slow part."
  - Status → the state: "2 of 4 arms done; arm 3 is blocked on SSO."
- **In chat: at most one small diagram**, and only when the diagram *is* the
  summary (a three-box flow, a before → after).
- **On a page: always an overview diagram** right under the recap
  sentence. It's the whole mechanism on one screen: every part, how they
  connect, nothing zoomed in. **Mark each region with its thread number**
  (①②③) so the reader can see which thread explains which part. The threads
  then zoom into those regions. Without the overview, the reader has to piece
  the whole together from the parts.
- A recap that describes the explanation ("this covers X and Y") is a table
  of contents, not a recap. State the thing itself.

## 2. Depth comes in levels, and the reader pulls them

| Level | What it holds | Shown |
|---|---|---|
| 0 | the recap | always |
| 1 | 3–5 threads, each a hook plus (on a page) one diagram | always |
| 2+ | the detail of one thread, which opens with its own recap and its own threads | only when pulled, unless asked for `deep` |

Going down a level repeats the same shape. Every answer, at every depth, opens
with its recap.

## 3. Threads are hooks, not topics

- **3–5, numbered**, so the reader can reply `2`.
- **Most important first.** Order by what matters to the reader, not by how
  the system is built. Surprises and things that contradict what the reader
  probably believes come before confirmations.
- **Each one carries the finding**, not the subject: "Why Y is slow: one query
  per order", not "Performance". Reading only the hooks should already teach
  something.
- **One line each, about 12 words at most.** The supporting sentences, the
  evidence and the caveats are what pulling the thread gets you. Writing them
  now turns five hooks into five paragraphs, which is the wall again.
- A visual upgrade (a page, a real chart) is a thread **only when it
  would clearly beat what is already shown**.
- They are suggestions. The reader may ask anything. Don't append "or ask me
  anything"; it is filler.

## 4. Pick the visual by the shape of the idea

**A diagram earns its place when it lets a cold reader see a mechanism they
would otherwise assemble from prose.** If a sentence says it faster, write the
sentence. (From the Anthropic `artifact-diagramming` skill.)

| If the idea is… | Show it as |
|---|---|
| parts and how they connect | an architecture/component diagram |
| steps in order, who calls whom | a flow or sequence diagram |
| data changing shape along a path | the path, with a before → after note (2–4 lines) on the arrow where it changes |
| states and what moves between them | a state diagram |
| a hierarchy | a tree |
| two or more options | **the difference**: side by side, or the one edge each option adds or removes. Two unconnected boxes are a restated list, not a comparison |
| options scored on criteria | a table |
| one number that matters | a stat tile or a hero number, not a chart |
| magnitude, trend, part-of-whole, before/after per item | bar, line, stacked bar, dumbbell. The data's job picks the form (Anthropic `dataviz` skill). When one series is the point, highlight it and grey the rest |
| something that moves over time | an animation (pages only) |

Rules for every diagram:

- **Show the mechanism, not its name.** A box labelled "cache" says less than
  the path a request takes through it.
- **Label arrows with what moves or what happens**: `one row per order`,
  `polls every 30s`, `writes`. Never a bare arrow, never just "calls".
  Counts belong on arrows (`40 orders`, `up to 10`), since how much moves is
  part of what moves. Arrows leaving a decision are labelled `yes` / `no`.
- **One figure, one claim.** Write its caption first, as a sentence stating
  what the picture shows. If you can't write the caption, the diagram isn't
  ready.
- **Match complexity to the stakes.** Draw what the point turns on: no forced
  minimalism, and no inventory of the whole system either.

**Use colour, shape and icons to group things.** A diagram in one colour makes
the reader work out the groups. Encode the groups:

- **Colour = who owns it, or what group it's in.** One colour per owner
  (writers, the gateway, the customer's app), the same colour for that owner
  in every diagram on the surface. Whenever colour carries meaning, give a
  legend, or a one-line key in the recap or overview caption ("violet =
  writers, blue = gateway, green = what the customer sees"). Undecoded colour
  is decoration.
- **Shape = what kind of thing it is.** A box is a thing, a diamond is a
  decision, a cylinder is storage, a dashed outline is hidden, optional or
  sometimes. Keep each meaning the same across the surface.
- **Lanes or frames = boundaries** (what runs where, who's responsible).
- **Status colours are reserved:** green = reaches the customer / passes,
  red = refused / fails. Don't reuse them for an owner.
- **Icons or emoji** may mark a few recurring roles (👤 person, ⏱ scheduled,
  🔒 staff-only), sparingly, never as decoration.

## 5. Text on a visual surface only labels, captions or asks

Prose is for nuance, decisions and trade-offs. Everything else is drawn.

- On a page, text **labels** a mark, **captions** a figure, or
  **asks** a question. A note that explains *how something works* is a
  mechanism, so draw it instead.
- Guideline sizes inside figures: labels ≤ 4 words, captions ≤ 15, notes ≤ 15, at
  most 2 notes per diagram. Real names (a table, a service, a skill) are
  written in full even past the limit.
- If a page only works once you've read its notes, it has failed.
  It's a wall of text with shapes around it.

## 6. What's known, what isn't, and where it came from

- **Unknowns get a standard slot:** a short "Not checked" list at the end
  (page) or one line (chat). Don't drop them, and
  don't scatter them.
- **When sources conflict** (two facts disagree, or the order of steps
  changes the meaning), say so as a finding. Don't smooth it over.
- **References (`file:line`, SHAs)** go in one muted "Where:" line at the end
  of a section, never in the recap, the hooks or diagram labels.

## 7. The same shape on every surface

| | Chat / terminal | Page (HTML) |
|---|---|---|
| Navigation | over time: recap → threads → you ask → next recap | linear: recap → sections, jump by links |
| Recap lives | first 1–2 lines | top of the page, then the overview diagram |
| Level 1 | the numbered hooks, then **stop** | linked sections, each opening with its hook and a diagram; the text below it may be prose, bullets or a table (the §5 limit applies to text inside figures) |
| Level 2+ | on pull | present in full but below each section's own recap |
| Visuals | ASCII: boxes, arrows, tables, trees | inline SVG and real charts |


## 8. Voice

`plain-english` governs every sentence: say what a thing does in
the reader's words, gloss named systems on first use, no preamble and no
sign-off. This file governs the structure and that one governs the voice. The
two stack.
