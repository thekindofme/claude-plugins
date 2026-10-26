#!/bin/bash
# Keeps an AWS SSO (IAM Identity Center) access token perpetually fresh.
#
# The AWS CLI v2 silently refreshes the SSO access token (1h TTL) using the
# refresh token in ~/.aws/sso/cache — no browser needed — for as long as the
# IAM Identity Center portal session is alive. But it only refreshes on demand,
# so other tools reading the cache (SDKs, CDK, sls) can hit a stale token.
# This script proactively forces that refresh whenever <25 min of validity
# remain, and raises a macOS notification only when the refresh token itself
# is dead (portal session expired → a real `aws sso login` is required).
#
# The refresh is done directly against the SSO-OIDC CreateToken API (the same
# call the CLI makes internally) rather than by nudging the CLI, because
# cached assumed-role credentials in ~/.aws/cli/cache can mask a dead SSO
# token and make CLI-based probes lie.
#
# Runs every 15 min via a LaunchAgent (e.g. local.aws-sso-keepwarm).
# Status marker for humans and agents: ~/.aws/sso-keepwarm-status.json
#
# Configuration (env vars, or edit the defaults below):
#   AWS_SSO_SESSION    name of the [sso-session ...] block in ~/.aws/config
#   AWS_SSO_START_URL  portal start URL; read from that block when unset

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SSO_SESSION="${AWS_SSO_SESSION:-my-sso}"
START_URL="${AWS_SSO_START_URL:-$(python3 - "$SSO_SESSION" <<'EOF'
import configparser, os, sys
c = configparser.RawConfigParser()
c.read(os.path.expanduser("~/.aws/config"))
print(c.get(f"sso-session {sys.argv[1]}", "sso_start_url", fallback=""))
EOF
)}"
if [ -z "$START_URL" ]; then
  echo "[$(date '+%F %T')] no sso_start_url for sso-session '$SSO_SESSION' in ~/.aws/config"
  exit 1
fi
CACHE_DIR="$HOME/.aws/sso/cache"
STATUS_FILE="$HOME/.aws/sso-keepwarm-status.json"
LOG_PREFIX="[$(date '+%F %T')]"
REFRESH_THRESHOLD_SECS=1500  # refresh when <25 min remain
NOTIFY_THROTTLE_SECS=14400   # re-notify at most every 4h while dead

write_status() {
  local ok="$1" msg="$2" expires="${3:-}"
  python3 - "$STATUS_FILE" "$ok" "$msg" "$expires" <<'EOF'
import json, sys, datetime
path, ok, msg, expires = sys.argv[1:5]
json.dump({
    "ok": ok == "true",
    "message": msg,
    "tokenExpiresAt": expires or None,
    "checkedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}, open(path, "w"), indent=2)
EOF
}

notify_dead() {
  local marker="$HOME/.aws/.sso-keepwarm-last-notify"
  local now epoch_last=0
  now=$(date +%s)
  [ -f "$marker" ] && epoch_last=$(stat -f %m "$marker")
  if [ $((now - epoch_last)) -ge $NOTIFY_THROTTLE_SECS ]; then
    touch "$marker"
    osascript -e "display notification \"Portal session expired — run: aws sso login --sso-session $SSO_SESSION\" with title \"AWS SSO dead\" sound name \"Basso\"" 2>/dev/null
  fi
}

# Locate the cache file for our sso-session (has startUrl + refreshToken).
find_cache() {
  python3 - "$CACHE_DIR" "$START_URL" <<'EOF'
import json, sys, pathlib
cache_dir, start_url = sys.argv[1], sys.argv[2]
for p in pathlib.Path(cache_dir).glob("*.json"):
    try:
        d = json.load(open(p))
    except Exception:
        continue
    if d.get("startUrl") == start_url and "refreshToken" in d:
        print(p)
        break
EOF
}

CACHE_FILE=$(find_cache)
if [ -z "$CACHE_FILE" ]; then
  echo "$LOG_PREFIX no SSO token cache with refresh token — login required"
  write_status false "No SSO token cache. Run: aws sso login --sso-session $SSO_SESSION" ""
  notify_dead
  exit 0
fi

remaining=$(python3 - "$CACHE_FILE" <<'EOF'
import json, sys, datetime
d = json.load(open(sys.argv[1]))
exp = datetime.datetime.strptime(d["expiresAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
print(int((exp - datetime.datetime.now(datetime.timezone.utc)).total_seconds()))
EOF
)

expires_at() { python3 -c "import json,sys;print(json.load(open('$CACHE_FILE'))['expiresAt'])"; }

if [ "$remaining" -gt "$REFRESH_THRESHOLD_SECS" ]; then
  echo "$LOG_PREFIX token healthy (${remaining}s left)"
  write_status true "Token healthy" "$(expires_at)"
  rm -f "$HOME/.aws/.sso-keepwarm-last-notify"
  exit 0
fi

# Refresh via the SSO-OIDC CreateToken API, then rewrite the cache —
# including the rotated refresh token — atomically.
refresh_ok=$(python3 - "$CACHE_FILE" <<'EOF'
import json, sys, datetime, os, urllib.request, urllib.error
p = sys.argv[1]
d = json.load(open(p))
body = json.dumps({
    "clientId": d["clientId"],
    "clientSecret": d["clientSecret"],
    "grantType": "refresh_token",
    "refreshToken": d["refreshToken"],
}).encode()
req = urllib.request.Request(
    f"https://oidc.{d['region']}.amazonaws.com/token",
    data=body, headers={"Content-Type": "application/json"})
try:
    resp = json.load(urllib.request.urlopen(req, timeout=30))
except Exception:
    print("false")
    sys.exit(0)
d["accessToken"] = resp["accessToken"]
if resp.get("refreshToken"):
    d["refreshToken"] = resp["refreshToken"]
exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=resp.get("expiresIn", 3600))
d["expiresAt"] = exp.strftime("%Y-%m-%dT%H:%M:%SZ")
tmp = p + ".tmp"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as fh:
    json.dump(d, fh)
os.replace(tmp, p)
print("true")
EOF
)

if [ "$refresh_ok" = "true" ]; then
  echo "$LOG_PREFIX refreshed OK (new expiry: $(expires_at))"
  write_status true "Token refreshed" "$(expires_at)"
  rm -f "$HOME/.aws/.sso-keepwarm-last-notify"
else
  echo "$LOG_PREFIX refresh FAILED — portal session likely expired, login required"
  write_status false "Refresh token dead. Run: aws sso login --sso-session $SSO_SESSION" ""
  notify_dead
fi
