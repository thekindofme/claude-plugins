#!/bin/bash
# $1 = main repo; removes its listed worktrees sequentially
repo="$1"; S="${WORK:?set WORK to a scratch dir}"
git -C "$repo" worktree list --porcelain | sed -n 's/^worktree //p' | grep -Fxf "$S/to_remove.txt" | while read -r wt; do
  if git -C "$repo" worktree remove "$wt" 2>>"$S/rm_err.log"; then echo "OK $wt"; else echo "FAIL $wt"; fi
done
git -C "$repo" worktree prune
