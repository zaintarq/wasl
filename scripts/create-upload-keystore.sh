#!/usr/bin/env bash
# Create Google Play upload keystore (run once; keep passwords safe forever).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/android"
KEYSTORE="$ANDROID/app/huzz-upload.keystore"
PROPS="$ANDROID/keystore.properties"

if [[ -f "$KEYSTORE" ]]; then
  echo "Upload keystore already exists: $KEYSTORE"
  echo "Delete it first if you really need a new one."
  exit 1
fi

echo "Create a password for your Play upload keystore."
echo "You MUST save it — Google requires the same key for every future update."
read -rsp "Store password: " STORE_PASS
echo
read -rsp "Confirm password: " STORE_PASS2
echo
if [[ "$STORE_PASS" != "$STORE_PASS2" ]]; then
  echo "Passwords do not match."
  exit 1
fi
if [[ ${#STORE_PASS} -lt 8 ]]; then
  echo "Use at least 8 characters."
  exit 1
fi

keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore "$KEYSTORE" \
  -alias huzz-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$STORE_PASS" \
  -keypass "$STORE_PASS" \
  -dname "CN=Huzz, OU=Mobile, O=Huzz, L=London, ST=England, C=GB"

cat > "$PROPS" <<EOF
storePassword=$STORE_PASS
keyPassword=$STORE_PASS
keyAlias=huzz-upload
storeFile=huzz-upload.keystore
EOF

echo ""
echo "Created:"
echo "  $KEYSTORE"
echo "  $PROPS"
echo ""
echo "Back up the keystore file and password somewhere safe (1Password, etc.)."
echo "Then rebuild: npm run build:aab"
