---
name: aws-sso-autorefresh
description: Stop the daily `aws sso login` ritual — install a macOS LaunchAgent that silently auto-refreshes your AWS SSO (IAM Identity Center) access token every 15 min, plus (optional) a never-expiring static readonly IAM fallback profile. Use when the user says "set up AWS SSO auto refresh", "I keep having to aws sso login", "install the SSO keepwarm", "my AWS creds keep expiring", or wants a static readonly fallback profile. Also the reference for HOW agents should react to AWS credential errors on a machine with keepwarm installed (check ~/.aws/sso-keepwarm-status.json, don't reflexively ask for a login).
allowed-tools: Bash, Read, Write, Edit
---

# aws-sso-autorefresh

## Configuration

| Placeholder | Example | Meaning |
|---|---|---|
| `AWS_SSO_SESSION` | `my-sso` | Name of your `[sso-session …]` block in `~/.aws/config` |
| `AWS_SSO_START_URL` | `https://<your-org>.awsapps.com/start` | Portal URL (the script reads it from the config block when unset) |
| `AWS_SSO_REGION` | `us-east-1` | Region of your Identity Center instance |
| `AWS_READONLY_PROFILE` | `ro-static` | Name for the optional static readonly fallback profile |
| `AWS_ADMIN_PROFILE` | `admin` | A profile allowed to create IAM users (Part 2 only) |
| `KEEPWARM_LABEL` | `local.aws-sso-keepwarm` | LaunchAgent label |

Two independent pieces (install either or both):

1. **Keepwarm** — a LaunchAgent that keeps your `$AWS_SSO_SESSION` access token perpetually
   fresh via the SSO-OIDC refresh-token grant. No browser, no interaction, for as long
   as the IAM Identity Center portal session lives. One `aws sso login` per portal
   session instead of per day.
2. **Static readonly fallback** *(optional)* — a personal IAM user with managed
   `ReadOnlyAccess` and long-lived keys, as profile `$AWS_READONLY_PROFILE`. Covers
   *reads* even when the portal session is dead. Never expires.

## Why this works (background for the agent)

- With modern `sso-session` config + `sso:account:access` scope, `aws sso login` stores a
  **refresh token** in `~/.aws/sso/cache`. The 1h access token can be renewed silently.
  The CLI only does this on demand; tools that read the cache directly (SDKs, CDK, sls)
  break when the cached token stales. Keepwarm refreshes proactively (<25 min left).
- **Do not probe SSO health with `aws sts get-caller-identity`** — `~/.aws/cli/cache`
  holds ~8h assumed-role creds that outlive the SSO token, so sts lies in both
  directions. Trust `~/.aws/sso-keepwarm-status.json`.

## Part 1 — install keepwarm (macOS)

Prereq: `~/.aws/config` must define a shared session:

```ini
[sso-session my-sso]
sso_start_url = https://<your-org>.awsapps.com/start
sso_region = <AWS_SSO_REGION>
sso_registration_scopes = sso:account:access
```

If profiles instead carry a bare `sso_start_url` (legacy format), migrate them to
`sso_session = <AWS_SSO_SESSION>` first — legacy tokens have no refresh token.

Install (script ships with this skill, next to SKILL.md):

```bash
mkdir -p ~/.local/bin ~/Library/LaunchAgents
cp "$(dirname <path-to-this-SKILL.md>)/keepwarm.sh" ~/.local/bin/aws-sso-keepwarm.sh
chmod +x ~/.local/bin/aws-sso-keepwarm.sh

LABEL=${KEEPWARM_LABEL:-local.aws-sso-keepwarm}
cat > ~/Library/LaunchAgents/$LABEL.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>EnvironmentVariables</key>
    <dict><key>AWS_SSO_SESSION</key><string>${AWS_SSO_SESSION:-my-sso}</string></dict>
    <key>ProgramArguments</key>
    <array><string>/bin/bash</string><string>$HOME/.local/bin/aws-sso-keepwarm.sh</string></array>
    <key>StartInterval</key><integer>900</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>$HOME/Library/Logs/aws-sso-keepwarm.log</string>
    <key>StandardErrorPath</key><string>$HOME/Library/Logs/aws-sso-keepwarm.log</string>
</dict>
</plist>
EOF

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/$LABEL.plist
```

Verify: `cat ~/.aws/sso-keepwarm-status.json` shows `"ok": true` (after one
`aws sso login --sso-session <AWS_SSO_SESSION>` if you were fully logged out). Log:
`~/Library/Logs/aws-sso-keepwarm.log`.

Already running a personal copy under a different label? `launchctl bootout` it first —
two keepwarms race on the rotated refresh token.

## Part 2 — optional static readonly fallback (`$AWS_READONLY_PROFILE`)

> **Check before doing this.** Long-lived access keys are exactly what most security teams ban, and `ReadOnlyAccess` can still read sensitive data (S3 objects, DynamoDB items, Secrets Manager metadata). Only do it on an account where your organisation allows personal IAM users, and prefer a narrower policy if you only need a few services.

Personal, never-expiring readonly keys for the account you most need to read. Requires
someone with IAM admin rights to mint (self-service if you have them):

```bash
export AWS_PROFILE=<AWS_ADMIN_PROFILE>
ME=<your-name>   # user names must be unique
aws iam create-user --user-name claude-code-readonly-$ME --path /automation/ \
  --tags Key=owner,Value=<your-email> Key=purpose,Value=claude-code-local-readonly
aws iam attach-user-policy --user-name claude-code-readonly-$ME \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam create-access-key --user-name claude-code-readonly-$ME
```

Put the key in `~/.aws/credentials` (never echo the secret into a transcript — write the
file directly, `chmod 600`):

```ini
[ro-static]
aws_access_key_id = ...
aws_secret_access_key = ...
```

And in `~/.aws/config`:

```ini
[profile ro-static]
region = <your-default-region>
```

Verify: `aws sts get-caller-identity --profile ro-static` resolves to your
`automation/claude-code-readonly-*` user, and a write (e.g. `dynamodb put-item`) is
AccessDenied.

Limits: reads only — no writes, no `secretsmanager:GetSecretValue`, no KMS decrypt.
Long-lived credential on disk: rotate occasionally, delete the IAM user when you leave.

## How agents should react to AWS credential errors (with keepwarm installed)

1. Read `~/.aws/sso-keepwarm-status.json`.
2. `"ok": true` → SSO is fine; the failure is something else (wrong profile/region, IAM
   denial). Do NOT ask for a login.
3. `"ok": false` → portal session dead. For **reads**, switch to `--profile <AWS_READONLY_PROFILE>`
   (if minted) and continue. Only a **write** or a secret-value read justifies asking the
   user to run `! aws sso login --sso-session <AWS_SSO_SESSION>` (interactive browser — an agent
   can't drive it).
4. No status file → keepwarm not installed; offer this skill, then fall back to the
   classic probe-and-ask-login flow.
