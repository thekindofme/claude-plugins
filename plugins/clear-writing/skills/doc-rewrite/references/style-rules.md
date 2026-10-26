# Style rules for the rewrite

Apply while writing, not as a post-pass.

## Structure

1. **Answer first.** Page 1 = the verdict, the open decisions, the framing
   numbers. A reader who stops there can still act.
2. **Preconditions before proposals.** Anything that caps or gates the main
   claim (coverage limits, trust/measurement problems) is ground truth and comes
   before the proposal that stands on it.
3. **Structure follows argument, not chronology.** Discovery order goes in a
   "how we got here" appendix at ~40% of its original length. Nothing in the
   main body depends on reading it.
4. **Each fact/anecdote has ONE canonical home.** Told fully once, in the
   section that owns it; everywhere else a short cross-reference. Glossaries
   carry generic examples, never a live case's numbers.
5. **Superseded ≠ deleted.** Dead forks, rival proposals, retired claims go to a
   decision-record appendix, explicitly marked resolved — preserved history that
   can't masquerade as live.
6. **One task list.** Plans contain only future work. Completed items move to
   the evidence ledger; results move to the section that owns them.

## Numbers

7. **One reconciled number table**, defined per row (population, window, date),
   quoted by every other section. Six denominators floating free = the reader
   audits you instead of reading you.
8. **Conflicts get resolved or explained, never cohabit.** Pick the
   best-evidenced value; note the variant in place ("an earlier count said 14;
   the re-query on cleaned accounts found 13").
9. **Keep receipts.** Evidence-ledger appendix; every number traces to a run.
   Say what was checked and cleared, not just what failed.
10. **Gloss stats inline** at first use: κ ("agreement score, 0 chance, 1
    perfect"), p50/p75 ("percentiles: what the middle / top quarter clears"),
    CIs ("unlikely to be a fluke of one month's data").

## No archaeology

11. No dates in headings. No "this arrived later / reshaped what came before."
    No changelog in the sidebar or hero meta. One as-of stamp for the whole doc.
12. When late information supersedes an earlier claim, **rewrite the earlier
    claim in place**. A gaps table may not contain "no longer a gap."
13. One naming policy (roles vs real names), applied everywhere — body, owner
    badges, artifact filenames.

## Prose (anti-LLM)

The tell is rarely vocabulary; it's rhetorical uniformity — every paragraph
claim→evidence→zinger, every section ending elevated. Break the mold:

14. **Facts end sections.** No mic-drop closers, no italicized-maxim endings.
    End on the decision-relevant number or the next action.
15. **One aphorism per document**, only if load-bearing, ideally attributed to a
    real person ("as the platform engineer put it: …").
16. **Bold marks data and first-use terms only** — numbers, thresholds, defined
    words. Never a full rhetorical clause.
17. Ban: "X, not Y" contrast snaps as sentence enders; "isn't X — it's Y"
    reframes; personified abstractions ("the frame demands", "the data wins",
    "decisions want an order"); rhetorical numbering ("zero for three", "two
    collapses, not one"); hand-holding ("hold onto that", "worth sitting with",
    "read the gradient"); self-narration ("the sharpest point in the debate",
    "this finding does the most work").
18. Intensifiers on a leash: honest/honestly, genuinely, actually, quietly,
    real(ly) — near-zero budget; each survivor must change meaning, not tone.
19. Max one em-dash pair per sentence. Padded triads ("the value proof, the
    renewal argument, the North Star and the investor story in one") become one
    plain claim.
20. Callout/box labels name contents ("Open item — two floor sets to
    reconcile"), never verdicts ("The honesty stat that shapes the ladder").

## Zero-context test

21. Every term defined before first use; no sentence requires a later section
    to parse. Forward pointers are fine only as teasers, never as prerequisites.
22. No insider vocabulary without translation: internal channel names, session/
    scratchpad paths, product feature names, "the warehouse", "tenants".
23. The test: a smart outsider reads any single section cold and knows what
    every number means (population, window, why it matters).
