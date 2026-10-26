#!/bin/bash
# usage: classify_wt.sh <main-repo-dir>  -> TSV: status  repo  wt  branch  detail
repo="$1"; S="${WORK:?set WORK to a scratch dir}"
cd "$repo" || exit 0
slug=$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
[ -z "$slug" ] && exit 0
git fetch origin --prune -q 2>/dev/null
def=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null); def=${def:-origin/main}
prs="$S/prs_$(echo $slug | tr / _).json"
[ -s "$prs" ] || gh pr list --repo "$slug" --state merged --limit 4000 --json headRefName,headRefOid,number > "$prs" 2>/dev/null
git worktree list --porcelain | awk '/^worktree /{w=substr($0,10)} /^branch /{b=substr($0,19)} /^detached/{b="(detached)"} /^prunable/{p=1} /^$/{print w"\t"b"\t"p; w="";b="";p=""}' | tail -n +2 |
while IFS=$'\t' read -r wt br prunable; do
  if [ -n "$prunable" ] || [ ! -d "$wt" ]; then printf "PRUNABLE\t%s\t%s\t%s\t%s\n" "$slug" "$wt" "$br" "dir missing"; continue; fi
  head=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
  dirty=$(git -C "$wt" status --porcelain 2>/dev/null | head -1)
  if [ -n "$dirty" ]; then printf "KEEP-DIRTY\t%s\t%s\t%s\t%s\n" "$slug" "$wt" "$br" "$(git -C "$wt" status --porcelain | wc -l | tr -d ' ') changed"; continue; fi
  if git merge-base --is-ancestor "$head" "$def" 2>/dev/null; then printf "MERGED\t%s\t%s\t%s\t%s\n" "$slug" "$wt" "$br" "in $def"; continue; fi
  pr=$(python3 - "$prs" "$br" "$head" "$wt" 2>/dev/null <<'PYEOF'
import json,sys,subprocess
prs_path, br, head, wt = sys.argv[1:5]
prs=json.load(open(prs_path))
for p in prs:
  if p['headRefName']==br:
    if p['headRefOid']==head or subprocess.run(['git','-C',wt,'merge-base','--is-ancestor',head,p['headRefOid']],capture_output=True).returncode==0:
      print('PR#%d'%p['number']); break
PYEOF
)
  if [ -n "$pr" ]; then printf "MERGED\t%s\t%s\t%s\t%s\n" "$slug" "$wt" "$br" "$pr squash"; continue; fi
  printf "KEEP-UNMERGED\t%s\t%s\t%s\t%s\n" "$slug" "$wt" "$br" "-"
done
