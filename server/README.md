# Python conversation server

This FastAPI service keeps the Agora App Certificate and Conversational AI REST calls off the Android device. It exposes bootstrap, join, interrupt, leave, refresh, and health endpoints on HTTPS port `8443` by default.

## Setup

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env.local
```

Use the Agora CLI to seed the backend credentials, then add a random app token and the remaining values from `.env.example`:

```bash
agora project env write server/.env.local
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Run HTTPS locally:

```bash
./server/run.sh
```

In another terminal, expose it through a public HTTPS tunnel:

```bash
./server/tunnel.sh
```

The first-party Agora tunnel relay is still under development. `tunnel.sh` currently uses Cloudflare Quick Tunnel when available and otherwise uses ngrok. You can also run ngrok, Cloudflare Tunnel, Tailscale Funnel, or LocalTunnel directly; see [`docs/local-tunnels.md`](../docs/local-tunnels.md).

Copy the tunnel URL into Android configuration with:

```bash
QUICKSTART_APP_TOKEN=your_token ./server/configure-android.sh https://your-public-host
```

The local certificate is generated into `server/certs/` on first start. Android connects to the tunnel's publicly trusted certificate, not the local self-signed certificate.

See `docs/backend-runbook.md` for the API contract, deployment alternatives, and smoke checks.
