#!/usr/bin/env bash
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SERVER_DIR"

set -a
if [[ -f .env ]]; then source .env; fi
if [[ -f .env.local ]]; then source .env.local; fi
set +a

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8443}"
TLS_CERT_PATH="${TLS_CERT_PATH:-certs/dev-cert.pem}"
TLS_KEY_PATH="${TLS_KEY_PATH:-certs/dev-key.pem}"

mkdir -p "$(dirname "$TLS_CERT_PATH")" "$(dirname "$TLS_KEY_PATH")"
if [[ ! -f "$TLS_CERT_PATH" || ! -f "$TLS_KEY_PATH" ]]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
    -keyout "$TLS_KEY_PATH" \
    -out "$TLS_CERT_PATH" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
fi

exec python -m uvicorn app.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --ssl-keyfile "$TLS_KEY_PATH" \
  --ssl-certfile "$TLS_CERT_PATH"
