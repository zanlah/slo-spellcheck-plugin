#!/usr/bin/env bash
set -e

if [[ -z "$1" ]]; then
  echo "Uporaba: $0 <URL>"
  echo "Primer: $0 https://localhost:3000"
  echo "Prenese manifest z <URL>/manifest.xml v mapo wef."
  exit 1
fi

BASE_URL="${1%/}"
MANIFEST_URL="${BASE_URL}/manifest.xml"
WEF_DIR="${HOME}/Library/Containers/com.microsoft.Word/Data/Documents/wef"

mkdir -p "$WEF_DIR"
PREFIX="$(openssl rand -hex 4)"
OUTPUT="${WEF_DIR}/${PREFIX}_manifest.xml"

# -k: dovoli samopodpisane certifikate (npr. Docker dev)
if ! curl -fkS -o "$OUTPUT" "$MANIFEST_URL"; then
  echo "Napaka: ni mogoče prenesti manifesta z $MANIFEST_URL"
  exit 1
fi

echo "Manifest shranjen v: $OUTPUT"
echo "Ponovno zaženite Word in uporabite Home → Add-ins za nalaganje vticnika."
