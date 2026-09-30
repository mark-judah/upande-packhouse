#!/usr/bin/env bash
#
# One-time setup: generate the Android upload keystore and hand it to GitHub as
# repository secrets, so the Release workflow can sign APKs.
#
#   ./scripts/setup-signing.sh
#
# Uses keytool when a JDK is present, otherwise falls back to openssl. Both
# produce a PKCS12 keystore, which is what Gradle expects by default (PKCS12 has
# been the JDK default store type since JDK 9). Uploads via the GitHub CLI when
# available; otherwise writes the values to a file for pasting into the web UI.
#
# KEEP THE GENERATED KEYSTORE. Android identifies an app by its signing key:
# lose it and existing installs can never be upgraded, only uninstalled and
# reinstalled. Back it up somewhere durable outside this repo.

set -euo pipefail

cd "$(dirname "$0")/.."

KEYSTORE_FILE="${KEYSTORE_FILE:-upande-packhouse-upload.keystore}"
KEY_ALIAS="${KEY_ALIAS:-upande-packhouse}"
VALIDITY_DAYS="${VALIDITY_DAYS:-10950}" # ~30 years; Play requires >= 25.
SECRETS_FILE="SECRETS-TO-UPLOAD.txt"
SUBJECT_CN="Upande Packhouse"
SUBJECT_OU="Upande"
SUBJECT_O="Upande"
SUBJECT_L="Nairobi"
SUBJECT_C="KE"

if [ -f "$KEYSTORE_FILE" ]; then
  echo "$KEYSTORE_FILE already exists. Refusing to overwrite an existing signing key." >&2
  echo "Delete it deliberately, or set KEYSTORE_FILE=... to use a different path." >&2
  exit 1
fi

# Generated rather than prompted, so the password never sits in shell history.
# PKCS12 does not meaningfully support a store password separate from the key
# password, so they are deliberately the same value.
PASSWORD="$(openssl rand -base64 32 | tr -d '\n=+/' | cut -c1-32)"

if command -v keytool >/dev/null; then
  echo "Generating $KEYSTORE_FILE with keytool (alias: $KEY_ALIAS)..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE_FILE" \
    -storetype PKCS12 \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity "$VALIDITY_DAYS" \
    -storepass "$PASSWORD" \
    -keypass "$PASSWORD" \
    -dname "CN=$SUBJECT_CN, OU=$SUBJECT_OU, O=$SUBJECT_O, L=$SUBJECT_L, C=$SUBJECT_C"
  FINGERPRINT=$(keytool -list -v -keystore "$KEYSTORE_FILE" -storepass "$PASSWORD" |
    awk -F': ' '/SHA256:/ {print $2; exit}')
elif command -v openssl >/dev/null; then
  echo "No JDK found; generating $KEYSTORE_FILE with openssl (alias: $KEY_ALIAS)..."
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  openssl req -x509 -newkey rsa:2048 -sha256 -days "$VALIDITY_DAYS" -nodes \
    -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
    -subj "/CN=$SUBJECT_CN/OU=$SUBJECT_OU/O=$SUBJECT_O/L=$SUBJECT_L/C=$SUBJECT_C" 2>/dev/null
  openssl pkcs12 -export \
    -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
    -name "$KEY_ALIAS" -out "$KEYSTORE_FILE" \
    -passout pass:"$PASSWORD" 2>/dev/null
  FINGERPRINT=$(openssl x509 -in "$TMP/cert.pem" -noout -fingerprint -sha256 | sed 's/.*=//')
else
  echo "Need either keytool (any JDK) or openssl to generate a keystore." >&2
  exit 1
fi

chmod 600 "$KEYSTORE_FILE"
KEYSTORE_B64=$(base64 -w0 "$KEYSTORE_FILE")

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  echo "Uploading repository secrets with gh..."
  printf '%s' "$KEYSTORE_B64"  | gh secret set ANDROID_KEYSTORE_BASE64
  printf '%s' "$PASSWORD"      | gh secret set ANDROID_KEYSTORE_PASSWORD
  printf '%s' "$KEY_ALIAS"     | gh secret set ANDROID_KEY_ALIAS
  printf '%s' "$PASSWORD"      | gh secret set ANDROID_KEY_PASSWORD
  printf '%s' "$FINGERPRINT"   | gh secret set ANDROID_KEY_SHA256
  UPLOADED=yes
else
  cat > "$SECRETS_FILE" <<EOF
Paste these into: GitHub repo -> Settings -> Secrets and variables -> Actions
-> New repository secret. Delete this file once done.

ANDROID_KEY_ALIAS
$KEY_ALIAS

ANDROID_KEYSTORE_PASSWORD
$PASSWORD

ANDROID_KEY_PASSWORD
$PASSWORD

ANDROID_KEY_SHA256
$FINGERPRINT

ANDROID_KEYSTORE_BASE64
$KEYSTORE_B64
EOF
  chmod 600 "$SECRETS_FILE"
  UPLOADED=no
fi

echo
echo "  Keystore    : $(pwd)/$KEYSTORE_FILE"
echo "  Alias       : $KEY_ALIAS"
echo "  Password    : $PASSWORD"
echo "  SHA-256     : $FINGERPRINT"
if [ "$UPLOADED" = yes ]; then
  echo
  echo "Secrets uploaded: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD,"
  echo "ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD, ANDROID_KEY_SHA256."
else
  echo
  echo "gh is unavailable, so nothing was uploaded. The five secret values are in"
  echo "  $(pwd)/$SECRETS_FILE"
  echo "Paste them into the repo's Actions secrets, then delete that file."
fi
echo
echo "Store the keystore and password in your password manager NOW — this is the"
echo "only time the password is shown, and the key cannot be regenerated."
echo "Both files are gitignored; do not commit them."
