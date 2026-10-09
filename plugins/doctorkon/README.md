# doctorkon

A cockpit for a Claude Code session that coordinates other sessions. The session raises decisions through two tools, and doctorkon keeps a short status summary for you.

- **Decision card, above the prompt.** `doctorkon_ask` pins a go or no-go call with numbered options. Press a number to answer. The last option lets you reply in your own words. Further decisions wait in a queue, and an urgent one can interrupt (`i` switches to it, `b` goes back with your draft kept).
- **Status, in a side pane.** At most two sentences on where the session stands, plus up to 5 highlights: something shipped, a serious problem, a blocker. doctorkon writes it itself when a turn ends, the way `/recap` does, by asking the session about its own transcript (at most every two minutes). `/doctorkon recap` rewrites it now.
- **Waiting on you, below the updates.** Every open decision, ranked by urgency.

`doctorkon_resolve` withdraws a decision that no longer applies. `/doctorkon on|off` turns the cockpit on or off.

Colours follow your Claude Code theme. The pane docks beside the transcript in fullscreen mode (`/tui fullscreen`).

Requires `orca-claude-session-links` from the same marketplace, which is installed with it.
