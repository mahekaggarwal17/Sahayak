#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 https://public-server-url [app-token]" >&2
  exit 1
fi

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROPERTIES_FILE="$SERVER_DIR/../local.properties"
PUBLIC_URL="${1%/}"
APP_TOKEN="${2:-${QUICKSTART_APP_TOKEN:-}}"

if [[ "$PUBLIC_URL" != https://* ]]; then
  echo "The Android app requires an https:// server URL." >&2
  exit 1
fi
if [[ -z "$APP_TOKEN" ]]; then
  echo "Pass the app token as the second argument or export QUICKSTART_APP_TOKEN." >&2
  exit 1
fi

touch "$PROPERTIES_FILE"
TEMP_FILE="$(mktemp)"
awk '!/^QUICKSTART_SERVER_URL=/ && !/^QUICKSTART_SERVER_TOKEN=/' "$PROPERTIES_FILE" > "$TEMP_FILE"
{
  cat "$TEMP_FILE"
  echo "QUICKSTART_SERVER_URL=$PUBLIC_URL"
  echo "QUICKSTART_SERVER_TOKEN=$APP_TOKEN"
} > "$PROPERTIES_FILE"
rm -f "$TEMP_FILE"

echo "Updated $PROPERTIES_FILE with the public server URL and app token."
