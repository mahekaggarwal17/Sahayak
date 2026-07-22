# Python backend runbook

## Architecture

The Android app calls this FastAPI service for session bootstrap, token refresh, and agent lifecycle operations. Only the Python process has `AGORA_APP_CERTIFICATE`. The bootstrap response includes the Agora App ID because the RTC and RTM SDKs need it to initialize; it is a public identifier, not a credential.

## Configure

```bash
python3 -m venv server/.venv
source server/.venv/bin/activate
pip install -r server/requirements-dev.txt
cp server/.env.example server/.env.local
agora project env write server/.env.local
```

Add `QUICKSTART_APP_TOKEN` and any optional model settings to `server/.env.local`. Generate a development token with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`.

## Run HTTPS and create a public URL

```bash
./server/run.sh
```

`run.sh` listens on `0.0.0.0:8443` and generates a 30-day local certificate if the configured certificate files do not exist.

In a second terminal:

```bash
./server/tunnel.sh
```

The first-party Agora tunnel relay is not live yet. The tunnel helper prefers Cloudflare Quick Tunnel and falls back to ngrok. Both publish a trusted public HTTPS URL while forwarding to the local HTTPS port. Configure Android after the URL appears:

```bash
QUICKSTART_APP_TOKEN=your_token ./server/configure-android.sh https://generated-public-host
```

See [Local HTTPS tunnels](local-tunnels.md) for manual provider commands, public health verification, URL rotation, and troubleshooting. Rebuild or reinstall the app whenever the public URL changes.

For a stable production URL, deploy the same ASGI app behind a managed HTTPS load balancer instead of using a development tunnel.

## API

- `GET /health` is public and reports service version and active-session count.
- `POST /v1/conversation/bootstrap` creates a channel and short-lived RTC/RTM token.
- `POST /v1/conversation/join` starts an agent and is idempotent by channel.
- `POST /v1/conversation/interrupt` interrupts the active agent.
- `POST /v1/conversation/leave` stops the agent and removes server session state.
- `POST /v1/conversation/refresh` rotates the user token after validating the session identity.

All `/v1` endpoints require `Authorization: Bearer <QUICKSTART_APP_TOKEN>`. The in-memory session and rate-limit stores are suitable for one process. Use Redis or another shared store before scaling to multiple workers.

## Smoke check

```bash
curl --cacert server/certs/dev-cert.pem https://localhost:8443/health
curl -H "Authorization: Bearer $QUICKSTART_APP_TOKEN" \
  --cacert server/certs/dev-cert.pem \
  -X POST https://localhost:8443/v1/conversation/bootstrap \
  -H "Content-Type: application/json" \
  -d '{}'
```
