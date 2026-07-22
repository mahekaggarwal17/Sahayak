#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8443}"

if command -v cloudflared >/dev/null 2>&1; then
  exec cloudflared tunnel --url "https://localhost:${PORT}" --no-tls-verify
fi

if command -v ngrok >/dev/null 2>&1; then
  exec ngrok http "https://localhost:${PORT}"
fi

echo "Install cloudflared or ngrok, then run this script again." >&2
exit 1
