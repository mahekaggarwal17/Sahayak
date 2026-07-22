# Setup

## Prerequisites

- Android Studio with JDK 17+
- An Android device or emulator with microphone support
- [Agora CLI](https://github.com/AgoraIO/cli)
- Python 3.10+
- A development tunnel provider such as Cloudflare Tunnel, ngrok, Tailscale Funnel, or LocalTunnel

## Recommended Setup

The easiest path is to let the Agora CLI scaffold the app and write Android credentials to `local.properties`.

```bash
curl -fsSL https://dl.agora.io/cli/install.sh | sh
agora --help
agora login
agora init my-android-demo --template android
cd my-android-demo
python3 -m venv server/.venv
source server/.venv/bin/activate
pip install -r server/requirements-dev.txt
agora project env write server/.env.local
./server/run.sh
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

`agora init` clones this starter, selects or creates an Agora project, writes `.agora/project.json`, and writes Agora credentials to root `local.properties`.

## Working From A Clone

Use this if you already cloned this repository:

```bash
git clone https://github.com/AgoraIO-Conversational-AI/agent-quickstart-android.git
cd agent-quickstart-android
agora login
agora quickstart env write . --template android --project <your-project>
agora project doctor --deep
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

Write backend credentials with:

```properties
agora project env write server/.env.local
```

Then add `QUICKSTART_APP_TOKEN` to `server/.env.local`, run `./server/tunnel.sh`, and use `./server/configure-android.sh` to write the public URL and token to root `local.properties`.

The first-party Agora tunnel relay is still under development. This quickstart currently relies on a third-party development tunnel. The helper prefers Cloudflare Quick Tunnel and falls back to ngrok; [Local HTTPS tunnels](local-tunnels.md) documents those providers and additional options.

## Manual Setup

Use this only if you are not using the Agora CLI.

### 1. Create An Agora Project

Create or choose an Agora project with Conversational AI enabled.

You need:

- `App ID`
- `App Certificate`
- access to RTC and RTM for the project

### 2. Clone This Repo

```bash
git clone <your-fork-or-repo-url>
cd agent-quickstart-android
```

### 3. Add Server Config

Put Agora credentials in `server/.env.local`:

```properties
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_app_certificate
AGORA_AGENT_UID=123456
QUICKSTART_APP_TOKEN=your_random_app_token
```

After starting the HTTPS server and tunnel, put only these values in root `local.properties`:

```properties
QUICKSTART_SERVER_URL=https://your-public-host
QUICKSTART_SERVER_TOKEN=your_random_app_token
```

If the tunnel assigns a new URL, run `server/configure-android.sh` again and rebuild or reinstall the Android app because these values are compiled into `BuildConfig`.

### 4. Build And Run

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

Open the project in Android Studio, or run it from the command line, then launch it on a device or emulator.

Tap **Start voice session**, allow microphone permission, speak to the agent, and watch transcripts appear in realtime. Use the end-session control to stop the conversation cleanly.

## Required Configuration

Required in `local.properties`:

- `QUICKSTART_SERVER_URL`
- `QUICKSTART_SERVER_TOKEN`

Required in `server/.env.local`:

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `QUICKSTART_APP_TOKEN`

Notes:

- `AGORA_APP_ID` also supports the legacy key `agora.app.id`
- `AGORA_AREA` maps to the ConvoAI REST `geofence.area` value

## Default Agent Setup

The demo starts the agent with the default Agora-managed stack:

- `deepgram_nova_3`
- `openai_gpt_4o_mini`
- `minimax_speech_2_6_turbo`

It also enables:

- RTM event delivery
- RTM data channel transcripts
- RTM pipeline metrics
- agent subscription scoped to the generated requester RTC UID
- chorus audio scenario for the agent and local RTC engine
- start-of-speech interruption
- VAD-based end-of-speech detection

## Production Security

This repo uses a backend-orchestrated flow.

It is useful when you want to:

- learn how Agora Conversational AI works end to end
- ship a quick prototype without a backend
- build a reusable Android template for your team
- understand the minimum code needed for a voice AI app

The App Certificate is backend-only. The shared Android bearer token is appropriate for a controlled quickstart but should be replaced with per-user authentication before a public production launch.
