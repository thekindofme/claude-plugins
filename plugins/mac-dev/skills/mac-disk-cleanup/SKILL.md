---
name: mac-disk-cleanup
description: Free up disk space on your Mac — find where the space went, propose tiered deletions, and clean up only what you approve (dev caches, Xcode DerivedData, Ollama models, Downloads installers, merged git worktrees, stale node_modules, bench outputs). Use when the user says "free up space", "disk is full", "clean up my mac", "what's eating my disk", "mac is out of storage", or "clean up worktrees".
---

# mac-disk-cleanup

Find where the disk went, show the user a ranked menu, delete only what they pick,
and report the free-space delta after every step. First run (Sep 2026) took
the Data volume from **9 GB free (99%) → 641 GB free (30%)**; ~85% of that came
from `$CODE_ROOT` worktrees, not caches.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CODE_ROOT` | `~/code` | Where your git checkouts and worktrees live |
| `SKILL_DIR` | this skill's folder (e.g. `~/.claude/skills/mac-disk-cleanup`) | Where `scripts/` lives |
| `KEEP_PATHS` | — | Extra paths that must never be deleted (signed-in browser profiles, recordings, …) |

## Rules

- **Read-only until approved.** Every deletion tier gets an explicit go-ahead.
  Present a table (item · size · what happens if deleted) and wait.
- **Look before deleting.** Check age, whether git tracks it, whether a process
  is using it. "Probably fine" is not a check.
- **Never delete** `~/.claude` (sessions + memory), signed-in browser profiles
  that your tools depend on, meeting recordings in Downloads, anything in
  `$KEEP_PATHS`, or anything locked by a Claude agent.
- **Report `df` after each step** (`df -h /System/Volumes/Data` — `/` is the
  sealed system volume and lies).

## Shell gotchas (check which apply to your Mac)

- If `du` is aliased (e.g. to **ncdu**) → always `/usr/bin/du`. Same caution for `rm` → `/bin/rm`.
- If zsh **noclobber** is on → overwrite scratch files with `>|`, or the write
  silently fails and you work off stale data (bit us on the in-use check).
- `timeout` is not installed — don't wrap commands in it (they silently no-op).
- A full `du` of `~` takes **>15 min** (millions of files). Run it
  `run_in_background: true` and size the known hotspots in parallel.
- Avoid `ps aux` / `pgrep -fl` (full command lines can leak secrets). For "is a process using this
  folder" use working-directory lookup only:
  `lsof -d cwd -Fn | sed -n 's/^n//p' | sort -u >| $WORK/cwds.txt`.
  `cd` out of the target first — your own shell shows up otherwise.

## Step 1 — Measure

```
df -h /System/Volumes/Data
/usr/bin/du -xhd1 ~ | sort -rh | head -25           # background
for p in ~/Library/Developer ~/.cache ~/.npm ~/Library/Caches ~/.claude ~/.ollama \
         ~/.volta ~/.bun ~/Downloads ~/.Trash; do /usr/bin/du -sh "$p"; done | sort -rh
tmutil listlocalsnapshots /                          # snapshots can hide 10s of GB
```

If Docker is **OrbStack** (`~/Library/Group Containers/HUAQ24HBR6.dev.orbstack`),
not Docker Desktop; `docker system df` fails when it's stopped.

For `$CODE_ROOT`: agent-heavy setups can accumulate hundreds of `*-wt-*`
worktrees (the first run found ~800 folders in one workspace), each with a full,
**unshared** `node_modules` (~1–2 GB each). `du`
estimates of their size were *under* the real savings — don't discount for
pnpm hardlinks.

## Step 2 — Propose, in tiers

| Tier | Items (first-run sizes) | How |
|---|---|---|
| Rebuildable caches | Xcode DerivedData 56 G, `~/.npm` 14 G, uv 4 G, Homebrew 2 G | `rm -rf ~/Library/Developer/Xcode/DerivedData/*` (check Xcode/xcodebuild not running), `npm cache clean --force`, `uv cache clean`, `brew cleanup -s` |
| Slower to rebuild | puppeteer/playwright browsers, HF/whisper/torch models | ask |
| Ollama models | 23 G | verify unused first (below) → `ollama rm <model>`; `brew services stop ollama` |
| Downloads installers | `.dmg`/`.zip`/`.app` for apps already in `/Applications` | check `/Applications/<App>.app` exists per file |
| Merged worktrees | 509 worktrees, ~380 G | scripts below |
| Stale `node_modules` in kept worktrees | 187 worktrees >14 d old, ~137 G | below |
| Bench / eval outputs | e.g. a benchmark repo's `runs/` + `.cache` 113 G | git-ignored, check nothing running |

### Verifying Ollama is unused

1. `ls ~/.ollama/models/manifests/registry.ollama.ai/library/*/` and
   `ls -lut ~/.ollama/models/blobs | head` — last-access date of the blobs.
2. `lsof -nP -iTCP:11434` — who is connected (the listener alone is just the service).
3. Local apps that can point at Ollama — e.g. **Handy** (`~/Library/Application Support/com.pais.handy/settings_store.json`):
   Ollama is only in use if `post_process_enabled` is true **and**
   `post_process_provider_id = custom` with a model set. Its "Custom" provider
   slot defaults to `localhost:11434`, so the URL alone proves nothing.
4. grep hooks/skills/tools/projects for `11434|ollama` (exclude node_modules).
   On the first run only a one-off benchmark project referenced it.

## Step 3 — Worktrees

`WORK` = a scratch dir. Scripts are in `scripts/`.

```
export WORK=<scratchpad>
CODE_ROOT=${CODE_ROOT:-~/code}
find "$CODE_ROOT" -maxdepth 3 -mindepth 2 -type d -name .git | xargs -n1 dirname | sort -u >| $WORK/main_repos.txt
"$SKILL_DIR"/scripts/classify_wt.sh "$(head -1 $WORK/main_repos.txt)"   # prove on ONE repo first
tr '\n' '\0' < $WORK/main_repos.txt | xargs -0 -P6 -n1 "$SKILL_DIR"/scripts/classify_wt.sh >| $WORK/wt_class.tsv   # background
```

`classify_wt.sh` fetches, pulls each repo's merged PRs once via
`gh pr list --state merged --limit 4000`, and labels each worktree:

- `MERGED` — HEAD is in `origin/main`, **or** the branch matches a merged PR whose
  head commit contains HEAD (catches squash merges — 479 of 513 were squash).
- `KEEP-DIRTY` — any `git status --porcelain` output, untracked included.
- `KEEP-UNMERGED` — everything else.
- `PRUNABLE` — folder already gone.

Before removing merged ones, exclude:
- worktrees a process is in (cwd check above),
- worktrees outside `$CODE_ROOT` (e.g. app-managed ones under `~/Library/Application Support/`),
- any path referenced by LaunchAgents, crontab, or `~/.claude/skills|hooks`.

Write the survivors to `$WORK/to_remove.txt`, then (background, ~30–60 min for 500):

```
tr '\n' '\0' < $WORK/main_repos.txt | xargs -0 -P6 -n1 "$SKILL_DIR"/scripts/rm_merged_wt.sh >| $WORK/rm_log.txt
```

It runs sequentially per repo (worktree admin files lock), parallel across repos,
uses plain `git worktree remove` (refuses dirty trees) and then `worktree prune`.
A `FAIL` with "locked working tree … claude agent" is a live agent — **leave it,
never `-f -f`**. Branches are untouched.

### node_modules in kept worktrees

For kept worktrees idle ≥14 days (age = mtime of the worktree's git `index`),
re-run the in-use check, then delete only **git-ignored** `node_modules` dirs:

```
find "$wt" -type d -name node_modules -prune | while read nm; do git -C "$wt" check-ignore -q "$nm" && echo "$nm"; done
```

Delete with `xargs -0 -P8 -n1 /bin/rm -rf` in the background. Returning to one of
those worktrees needs `pnpm install`.

## Step 4 — Close out

Finish with a before/after table of free space per step, list what was
deliberately skipped (in use, agent-locked, app-managed) and the next-biggest
remaining items (e.g. unmerged worktrees >30 d old) so the user can decide later.
