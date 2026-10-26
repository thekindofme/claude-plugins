# Review-lens prompts

Adapt bracketed parts. All lenses: give the absolute file path, demand § / line
citations with short quotes, forbid rewriting ("report only"). Launch all in one
message so they run concurrently.

## Lens 1 — structure seams (strongest model)

> You are a harsh senior editorial critic. Read the ENTIRE file at [PATH].
> Context: [one paragraph — what the doc is, that it was written once and then
> patched as new information arrived; the owner says it feels like an old car
> with new parts bolted on]. Find every structural seam. Report:
> 1. BOLT-ON SEAMS — late material filed next to, not into, the skeleton:
>    sections that re-litigate earlier ones, date-stamped insertions,
>    "this reshaped how everything before should be read" patches, content
>    appearing 2–3+ times.
> 2. NARRATIVE ORDER PROBLEMS — where reading order fights the argument;
>    claims sold early and refuted later; a "decision path" stranded upstream
>    of the data that resolves it.
> 3. REDUNDANCY MAP — table: fact/anecdote × every location × count.
> 4. IDEAL SKELETON — section list you'd write fresh today, one line each on
>    purpose + what it absorbs; what to CUT; what to demote to appendix.

## Lens 2 — zero-context reader (mid-tier model)

> Proxy for a reader with ZERO context — no company knowledge, no domain
> knowledge, none of the source threads. Read ENTIRE file [PATH]. The doc claims
> to assume no prior knowledge; audit that. Report: (1) undefined or late-defined
> terms (jargon, internal tool names, stats like κ/CI/percentiles, people named
> without introduction, anonymization leaks); (2) forward references needed to
> parse the CURRENT sentence; (3) numbers presented without population/window/
> meaning; (4) places the doc suddenly speaks to insiders (internal channels,
> file paths, meeting shorthand).

## Lens 3 — fact consistency (mid-tier model)

> Fact-consistency auditor. Read ENTIRE file [PATH]. The doc was patched over
> days; numbers may have drifted. Cross-reference every quantitative claim; flag
> conflicts and unexplained variants. [List known suspects if any.] Also flag
> claims stated as fact early that later sections weaken or supersede. Output
> table: finding | locations | severity (conflict / unexplained-variant /
> superseded-claim / ok-but-fragile). Also list what you CHECKED AND CLEARED.

## Lens 4 — LLM vocabulary (mid-tier model)

> Detect AI/LLM-flavored prose at WORD/PHRASE level in [PATH]. Hunt: classic LLM
> words (delve, leverage, robust, seamless, crucial, foster, testament…);
> "not just X — it's Y" reframes; "X, not Y" contrast-snap endings; dramatic
> aphorisms; anthropomorphized abstractions; double-em-dash sentences; padded
> triads; intensifier counts (honest, genuinely, actually, quietly, real);
> faux-humble asides ("worth sitting with"). Per category: instances with §
> quotes + counts. End with a top-20 kill list and 5 plain-human rewrite
> examples of the worst sentences.

## Lens 5 — LLM rhetoric (mid-tier model)

> Detect AI-flavored writing at STRUCTURAL level in [PATH] (a sibling covers
> vocabulary). Report: (1) over-narration — prose rating its own significance;
> (2) relentless profundity — quote every section's closing line, count the
> mic-drops; (3) manufactured drama — routine events with plot beats; (4)
> excessive signposting ("hold onto that"); (5) rhetorical numbering ("zero for
> three"); (6) uniform paragraph shape — sample 10 paragraphs, name the mold;
> (7) bold-face density and whether bold marks data or rhetoric. Rank severity;
> end with concrete style rules for the rewrite.

## Independent judge bundle (any fresh-context agent or session)

Self-contained bundle = marching orders + full source. Orders:

> Adversarial holistic editorial review; terse, no praise. Output:
> 1. VERDICT — what the "bolted-on" feeling consists of, mechanically.
> 2. RANKED FINDINGS, severity-tagged.
> 3. IDEAL SKELETON for a from-scratch rewrite (+ cuts, demotions).
> 4. THE 5 SENTENCES THAT MUST SURVIVE — load-bearing claims the rewrite
>    must not lose.

Compare the judge's skeleton with lens 1's before writing: convergence = go;
divergence = reconcile explicitly in the synthesis step.
