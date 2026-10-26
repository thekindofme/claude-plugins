---
name: plain-english
description: Re-explain something confusing in plain English for a reader with zero background, and make any prose read like a sharp human wrote it rather than a language model. Use for explaining — "plain english", "explain this properly", "what does this actually mean", "unpack this", "this is gibberish", "I don't understand this", "ELI5", "assume no context", or a pasted blob of text with no instruction. Use for voice — "human-prose", "don't sound like an LLM", "de-LLM this", "this reads like AI", "make it sound human", and before drafting any prose deliverable longer than a few sentences — load it BEFORE writing, not as a cleanup pass.
---

# plain-english

Someone handed you something they couldn't parse. Your job is to say the same
thing in words they already know. Not shorter — **clearer**. Length is fine;
fog is not.

## What you're given

- Pasted text → explain that text.
- No text, just the trigger → explain **your own last substantive answer**, from
  scratch. Do not defend or re-summarise it. Rewrite it as if the first version
  never existed.
- A file path, URL, error, or PR → read it first, then explain.

If you genuinely cannot tell which thing needs explaining, ask one question and
stop. Otherwise, don't ask — explain.

## The reader

Assume a smart adult who knows **nothing** about this topic. Not the codebase,
not the acronyms, not the product, not what was said five minutes ago. They are
not stupid; they are uninformed. Never write down to them, never flatter them,
never apologise for the original text.

## Shape of the answer

1. **The answer in one or two sentences, first.** No preamble, no "great
   question", no restating the question. If the whole thing boils down to
   "the deploy failed because a password expired", that is line one.
2. **The unpacking.** Every term the first line leaned on, explained in order.
   Use a small diagram, table, or numbered sequence whenever it beats prose.
3. **Why it matters / what to do.** What changes for the reader. If nothing
   changes for them, say that.

Skip section 3 when the thing is purely informational. Never pad to fill a
template.

## Rules

1. **Define on first use, inline, no exceptions.** Not in a glossary at the
   bottom. `webhook (a URL that another system calls when something happens)`.
   If a term needs more than a clause, it needs its own paragraph.
2. **Kill every acronym on sight** — expand it once, then use the plain phrase,
   not the acronym. `SFN` → "the step-by-step job runner". `DLQ` → "the queue
   where failed messages pile up".
3. **Concrete over abstract.** "The system retries" → "it tries again, up to 3
   times, about 30 seconds apart". Numbers, names, and nouns beat categories.
4. **One idea per sentence.** If a sentence has two commas doing structural
   work, split it.
5. **Everyday comparison for anything mechanical.** One per concept, drawn from
   ordinary life (post, queues at a shop, filing cabinets, phone calls). Never
   stack two comparisons on one idea, and drop the comparison once the real
   thing has been named.
6. **Say what you don't know.** "This part I can't tell from the text" is a
   valid line. Never fill a gap with confident-sounding filler.
7. **Keep the honest complexity.** Simplifying is not lying. If the real answer
   is "it depends on two things", give both — in plain words. Don't flatten a
   genuine trade-off into a slogan.
8. **No meta-commentary.** Don't narrate the explanation ("let's break this
   down", "at a high level", "in essence", "think of it this way" as a
   paragraph opener). Just say the thing.

## The jargon ban list

Anything on the left is banned unless it is itself the subject being explained,
and even then it gets defined first.

| Don't write | Write |
|---|---|
| leverage, utilise | use |
| orchestrate, coordinate the flow | run these in order |
| surface (verb), expose | show |
| ingest, consume | read, take in |
| idempotent | safe to run twice — the second run changes nothing |
| eventual consistency | the copy catches up a moment later |
| context window | how much text the model can hold at once |
| embedding, vector | a list of numbers that stands for the meaning of the text |
| hallucinate | made it up |
| token | roughly a word-piece; billing and limits count these |
| latency, p99 | how long it takes; the slow 1% of cases |
| non-deterministic | you can get a different answer each run |
| race condition | two things ran at once and stepped on each other |
| backpressure | the queue filled up so the sender was told to slow down |
| abstraction layer | a middle piece that hides the messy part |
| source of truth | the one copy everyone else must match |
| blast radius | what else breaks if this breaks |
| seam | where the two parts meet |
| load-bearing | the part that matters most / that everything else depends on |

Also banned, as prose habits rather than terms: *robust, seamless,
comprehensive, holistic, elegant, powerful, simply, just, obviously, of course,
essentially, fundamentally, at the end of the day.* "Simply" and "just" are the
worst of these — they tell a confused reader the thing was easy.

This skill so far is about comprehension. The section below, "Sound like a
person wrote it", is about voice — how the sentences themselves should read.

## Worked example

**Input:** "The dispatcher enters a wedged state when the SQS consumer's
long-poll receives a transient DNS resolution failure, resulting in the
orchestration stalling at the products-setup stage without emitting a terminal
event, so downstream observability reports a false in-progress."

**Output:**

> A background program that hands out work got stuck, and nothing noticed,
> because it never announced that it had failed.
>
> Step by step:
>
> 1. The program's job is to pull tasks off a waiting list and run them. It sits
>    with the phone off the hook, waiting for the next task to arrive.
> 2. To reach that waiting list it has to look up an address — the same way your
>    phone looks up a website's real address before connecting.
> 3. That lookup failed briefly. Not permanently: a blip.
> 4. The program didn't recover from the blip and didn't crash either. It just
>    sat there, still technically alive.
> 5. Because it never crashed, it never sent the "I've failed" message. Every
>    dashboard still shows the work as *in progress*, forever.
>
> Why it matters: the customer setup that was mid-flight will never finish, and
> no alarm will fire. Someone has to notice by eye and restart it.

Note what happened there: nine jargon terms became five short steps and one
consequence, and nothing true was dropped.

## Don'ts

- Don't quote the original text back and annotate it line by line. Rewrite it.
- Don't produce a bulleted list of nouns with no verbs. Explanations need
  cause and effect.
- Don't grade the original ("this was poorly worded", "the model overcomplicated
  it"). Just do better.
- Don't offer to go deeper at the end. If a level of detail is worth having,
  include it; if not, leave it out.
- Don't touch code or files. This skill explains; it does not fix.

## Sound like a person wrote it

This part is about voice, not comprehension. A plain-English explanation that
still reads like a model has failed the assignment.

The tell is rarely vocabulary. Audits of real AI-drafted docs found zero
"delve/robust/tapestry" — what gave them away was **rhetorical uniformity**:
every paragraph shaped claim → evidence → zinger, every section ending on a
mic-drop, every fact dressed as an insight. The fix is structural permission
for sentences to just be information.

### The rules

1. **Facts end sections.** Never close on an italicized maxim, a rhetorical
   reversal, or a "the real lesson is…" line. End on the decision-relevant
   fact or the next action.
2. **One aphorism per document**, only if the document needs it, ideally attributed to
   a real person. If a section already has its quotable line, cut every other
   elevated closer in it.
3. **Vary paragraph shape.** Paragraphs may end on a plain fact, a number, an
   open question, or nothing at all. If three consecutive paragraphs share the
   claim→evidence→turn mold, break one.
4. **Bold marks data and first-use terms only** — numbers, thresholds, defined
   words. Never a full rhetorical clause ("**The value metric owns the
   definition of winning.**" is emphasis theater).
5. **No self-narration.** Never write that something "does the most work," is
   "the sharpest point," or is "worth sitting with." State what happened; the
   reader judges significance.
6. **No plot beats on routine events.** A meeting, a config change, a data pull
   gets a date and a fact — not "walked straight into it," "turned out to,"
   "the morning everything converged."
7. **Quotes support mid-paragraph; they don't close.** If the interview quote
   is the punchiest sentence, move it earlier and follow with something plain.
8. **Callout/heading labels name contents, not verdicts.** "Open items," not
   "What this changes." "Segment benchmarks," not "The honesty stat that
   shapes the ladder."
9. **Max one em-dash pair per sentence.** More than ~2 dashes per paragraph is
   the rhythm tell.
10. **Numbers are information, not drama.** Kill rhetorical numbering ("zero
    for three," "two collapses, not one") — give the count or number the list.

### The kill list

Constructions (ban the mold, not just instances):
- "X, not Y" contrast snaps as sentence enders ("the safety net, not the judge")
- "isn't X — it's Y" / "not just X; it's Y" reframes
- Personified abstractions: "the frame demands," "the data wins," "decisions
  want an order," "a real account walked straight into it"
- Hand-holding: "hold onto that," "carry these forward," "read the gradient,"
  "worth sitting with / leading with / knowing," "note what X is"
- Faux-humble asides: "a sobering note," "a surprise worth leading with"
- Padded triads and "…in one" stacks ("the value proof, the renewal argument,
  the North Star and the investor story in one")
- Stat labels written as proverbs ("who you are beats what you ran")

Words on a near-zero budget — each survivor must change meaning, not tone:
*honest(ly), genuinely, actually, quietly, real(ly), crucially, notably,
elegant, delve, landscape, journey, unlock, elevate, streamline, testament,
meticulous, moreover, furthermore.*

### Before / after

- "The definition is not the lever. Coverage is." → "Changing the rule moves
  the number about a point; matching more customers moves it up to fourteen."
- "A metric that survives a 17% jump in its own input population is a metric
  you can put on a wall." → "The number didn't move when the matched population
  jumped 17% — stable enough to report externally."
- "Winning isn't one measurement wearing two hats. It's two measurements, each
  doing the job the other can't." → "One metric can't answer both questions.
  Use two: did the ad beat the customer's own ads, and did it hit their goal."

### Scope notes

- Chat messages (Slack and similar) stay short: no em dashes, no task IDs.
- Applies to prose. Code comments follow the surrounding code's conventions;
  specs may keep normative phrasing ("never a loser") — spec language is a
  definition, not rhetoric.
- Reviewing text for LLM tells at scale: use the vocabulary + rhetoric lens
  prompts in `doc-rewrite/references/review-lenses.md`.

## Which part applies

| Task | Use |
|---|---|
| Explaining something confusing | The whole file |
| Drafting a doc, Slack post, email, or report | "Sound like a person wrote it" plus the jargon ban list |
| Reviewing text for LLM tells | "Sound like a person wrote it" plus `doc-rewrite/references/review-lenses.md` |
