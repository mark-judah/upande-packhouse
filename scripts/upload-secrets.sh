#!/usr/bin/env bash
#
# Push the values in SECRETS-TO-UPLOAD.txt to the repo as Actions secrets.
#
#   gh auth login          # once, if you haven't
#   ./scripts/upload-secrets.sh            # upload
#   ./scripts/upload-secrets.sh --dry-run  # show what would be uploaded
#
# Exists because pasting a multi-kilobyte base64 keystore into a browser
# textarea is easy to get subtly wrong (stray newline, truncated copy), and the
# resulting failure surfaces much later as an unreadable keystore in CI.

set -euo pipefail

cd "$(dirname "$0")/.."

SECRETS_FILE="${SECRETS_FILE:-SECRETS-TO-UPLOAD.txt}"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

[ -f "$SECRETS_FILE" ] || { echo "$SECRETS_FILE not found. Run ./scripts/setup-signing.sh first." >&2; exit 1; }
command -v gh >/dev/null || { echo "gh not found. Install the GitHub CLI first." >&2; exit 1; }

if ! $DRY_RUN && ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# The file is blocks of "NAME\nVALUE" separated by blank lines. Read it as a
# stream: a line that is exactly a secret name starts a new block, and the next
# non-empty line is its value.
name=""
count=0
while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^ANDROID_[A-Z0-9_]+$ ]]; then
    name="$line"
    continue
  fi
  if [ -n "$name" ] && [ -n "$line" ]; then
    if $DRY_RUN; then
      printf '%-28s %s chars  %s…\n' "$name" "${#line}" "$(printf '%s' "$line" | cut -c1-12)"
    else
      printf '%s' "$line" | gh secret set "$name"
      echo "set $name (${#line} chars)"
    fi
    name=""
    count=$((count + 1))
  fi
done < "$SECRETS_FILE"

echo
if $DRY_RUN; then
  echo "$count secrets would be uploaded. Re-run without --dry-run to apply."
else
  echo "$count secrets uploaded. Verify with: gh secret list"
  echo "Now delete $SECRETS_FILE — the keystore itself is the thing to keep."
fi
