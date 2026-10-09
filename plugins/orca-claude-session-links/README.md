# Orca × Claude Session Links

When Claude mentions one of your other Orca sessions by name, a button for it appears under the reply. Click the button and Orca switches to that session's tab.

```
⏺ build-api is waiting on review. model-audit has the numbers.
  [ ↗ build-api ] [ ↗ model-audit ]
```

## Requirements

- Orca, with Claude Code running in an Orca terminal.
- Claude Code in fullscreen mode, turned on with `/tui fullscreen` or by starting Claude with `CLAUDE_CODE_NO_FLICKER=1`. Fullscreen is required to click. Outside fullscreen the buttons cannot be clicked.

## How names are found

Names come from the titles of your open Orca terminal tabs (`orca terminal list`), with the leading status mark removed. Only hyphenated names become buttons, so a tab called `build-api` gets one and a tab called `scratch` does not. Matching is exact and case-sensitive. A name inside code, a link or a URL is skipped.

To name tabs yourself, point `ORCA_SESSION_LINKS_TERMS` at a file of `<terminal handle>|<name>` lines. If a name appears twice, the later line wins. These names take priority over tab titles.

Set `ORCA_SESSION_LINKS_LOG` to a file path to log each switch and Orca's reply.

## Install

It ships in the `thekindofme-plugins` marketplace. See the repository README.

## What it runs

The only commands it runs are `orca terminal list --json` and `orca terminal switch --terminal <handle> --json`. It uses `$ORCA_CLI_COMMAND` instead of `orca` when that is set. It runs nothing outside an Orca terminal.
