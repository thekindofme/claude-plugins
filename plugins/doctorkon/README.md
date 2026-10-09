# doctorkon

A cockpit for a Claude Code session that coordinates other sessions. The session reports to you through three tools instead of long chat messages.

- **Decision card, above the prompt.** `doctorkon_ask` pins a go or no-go call with numbered options. Press a number to answer. The last option lets you reply in your own words. Further decisions wait in a queue, and an urgent one can interrupt (`i` switches to it, `b` goes back with your draft kept).
- **Status updates, in a side pane.** `doctorkon_status` logs one significant outcome per line (shipped, stuck, errored, needs). Your answers are logged there too. New rows are highlighted until read.
- **Waiting on you, below the updates.** Every open decision, ranked by urgency.

`doctorkon_resolve` withdraws a decision that no longer applies. `/doctorkon on|off` turns the cockpit on or off.

Colours follow your Claude Code theme. The pane docks beside the transcript in fullscreen mode (`/tui fullscreen`).

Requires `orca-claude-session-links` from the same marketplace, which is installed with it.
