# Local HTTPS tunnels

The Android app must reach the Python backend through a publicly trusted HTTPS URL. A physical phone cannot use the development machine's `localhost`, and the backend's generated certificate is not trusted by Android.

The first-party `agora tunnel` relay is still under development and is not currently available for this quickstart. Use one of the temporary development tunnel options below. These services are third-party products with their own accounts, terms, limits, and availability.

Development tunnels are not a production deployment method.

## 1. Start and verify the backend

From the repository root:

```bash
./server/run.sh
```

Keep that terminal running. In another terminal, verify the local HTTPS endpoint:

```bash
curl --cacert server/certs/dev-cert.pem https://localhost:8443/health
```

Do not start a tunnel until this returns the backend health response.

## 2. Create a public HTTPS URL

### Automatic helper: Cloudflare or ngrok

The repository helper uses `cloudflared` when it is installed and falls back to `ngrok`:

```bash
./server/tunnel.sh
```

Keep the tunnel process running and copy the generated `https://` URL.

### ngrok

Install and authenticate the [ngrok agent](https://ngrok.com/docs/getting-started/), then forward to the local HTTPS origin:

```bash
ngrok http https://localhost:8443
```

Use the HTTPS forwarding URL printed by ngrok. An account and agent authtoken may be required.

### Cloudflare Quick Tunnel

Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), then run:

```bash
cloudflared tunnel --url https://localhost:8443 --no-tls-verify
```

Use the generated `https://*.trycloudflare.com` URL. Quick Tunnels do not require a Cloudflare account, but Cloudflare documents them as development-only and does not provide an uptime SLA.

### Tailscale Funnel

Install Tailscale, sign in, and enable Funnel for the tailnet. The backend uses a self-signed local certificate, so use Tailscale's `https+insecure` origin scheme:

```bash
tailscale funnel https+insecure://localhost:8443
```

Use the public `https://*.ts.net` URL printed by Tailscale. Funnel availability and approval depend on the tailnet policy.

### LocalTunnel

With Node.js and npm installed, run:

```bash
npx localtunnel --port 8443 --local-https --allow-invalid-cert
```

Use the generated HTTPS URL. Some public LocalTunnel relays may present an interstitial or impose rate limits. If `/health` does not return JSON directly, choose another provider.

## 3. Verify the public endpoint

Replace the example host with the generated URL:

```bash
curl https://your-public-host/health
```

The response must be the backend health JSON, not a provider login page, warning page, or HTML error. The URL passed to Android must not include `/health` or another path.

## 4. Configure and rebuild Android

Use the same `QUICKSTART_APP_TOKEN` stored in `server/.env.local`:

```bash
QUICKSTART_APP_TOKEN=your_token \
  ./server/configure-android.sh https://your-public-host
```

This writes the following values to root `local.properties`:

```properties
QUICKSTART_SERVER_URL=https://your-public-host
QUICKSTART_SERVER_TOKEN=your_token
```

Build and reinstall the app after changing the URL because the values are compiled into Android `BuildConfig`:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew :app:assembleDebug
```

Most free tunnel URLs are ephemeral. Repeat the configure and rebuild steps whenever the URL changes.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Tunnel reports connection refused | Confirm `./server/run.sh` is still running and listening on port `8443`. |
| Tunnel reports a certificate error | Use the provider command shown above; it explicitly permits the backend's development certificate. |
| Public `/health` returns provider HTML | Complete any provider setup or use another provider. Android requires the backend JSON response. |
| Android still calls an old URL | Run `configure-android.sh` again, rebuild, and reinstall the app. |
| Public URL returns `502` or `504` | Restart the backend first, then restart the tunnel and verify `/health`. |
| API returns `401` | Confirm `QUICKSTART_SERVER_TOKEN` matches `QUICKSTART_APP_TOKEN`. The public `/health` endpoint does not require authentication. |

## Security

- Treat the generated URL as public while the tunnel is running.
- Use a random `QUICKSTART_APP_TOKEN` and do not post it in logs, screenshots, or issue reports.
- Stop the tunnel when testing is finished.
- Rotate the app token if it is exposed.
- Do not put `AGORA_APP_CERTIFICATE` in `local.properties` or the Android app.
