# Agora Conversational AI Android Quickstart

This repository is a template-style Android starter for building a Voice AI app with Agora Conversational AI.

It gives you a Kotlin + Jetpack Compose app backed by a small Python service that:

- joins an Agora RTC channel
- starts and manages an Agora Conversational AI agent through the backend
- listens for transcript, agent state, and pipeline metrics over RTM
- lets the user talk, mute, interrupt, and end the session
- keeps the App Certificate and token generation off the Android device

## Quick Start

The recommended path is to let the Agora CLI clone the quickstart, bind an Agora project, and write Android credentials to `local.properties`.

### 1. Install the Agora CLI and sign in

Skip this step if `agora` is already on your `PATH`.

```bash
curl -fsSL https://dl.agora.io/cli/install.sh | sh
agora --help
agora login
```

### 2. Scaffold and bind the Android quickstart

Replace `my-android-demo` with your app folder name:

```bash
agora init my-android-demo --template android
cd my-android-demo
```

`agora init` clones this starter, selects or creates an Agora project, writes `.agora/project.json`, and writes Agora credentials to root `local.properties`.

### 3. Configure and run the Python server

```bash
python3 -m venv server/.venv
source server/.venv/bin/activate
pip install -r server/requirements-dev.txt
agora project env write server/.env.local
# Add QUICKSTART_APP_TOKEN to server/.env.local, then:
./server/run.sh
```

The first-party Agora tunnel relay is still under development and is not available for this demo. In another terminal, run the development tunnel helper, then configure Android with the displayed HTTPS URL:

```bash
./server/tunnel.sh
```

```bash
QUICKSTART_APP_TOKEN=your_token ./server/configure-android.sh https://your-public-host
```

The helper uses Cloudflare Quick Tunnel when installed and otherwise uses ngrok. See [Local HTTPS tunnels](docs/local-tunnels.md) for explicit ngrok, Cloudflare Tunnel, Tailscale Funnel, and LocalTunnel commands.

### 4. Build the app

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

### 5. Run it

Open the project in Android Studio, or run it from the command line, then launch it on a device or emulator.

Tap **Start voice session**, allow microphone permission, speak to the agent, and watch transcripts appear in realtime.

If the agent does not join or transcripts do not appear, run:

```bash
agora project doctor --deep
```

## Working From This Repository

Use this path if you already cloned this repo, for example to contribute or fork:

```bash
git clone https://github.com/AgoraIO-Conversational-AI/agent-quickstart-android.git
cd agent-quickstart-android
agora login
agora quickstart env write . --template android --project <your-project>
agora project doctor --deep
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

The Android app reads only these values from root `local.properties`:

```properties
QUICKSTART_SERVER_URL=https://...
QUICKSTART_SERVER_TOKEN=...
```

For manual setup, optional config, and production notes, see [docs/setup.md](docs/setup.md).

## What To Read First

If you are using this as a template, start here:

- [ConversationScreen.kt](app/src/main/java/com/androidengineers/agent_quickstart_android/ui/ConversationScreen.kt)
- [ConversationViewModel.kt](app/src/main/java/com/androidengineers/agent_quickstart_android/ui/ConversationViewModel.kt)
- [AgoraConversationSessionManager.kt](app/src/main/java/com/androidengineers/agent_quickstart_android/rtc/AgoraConversationSessionManager.kt)
- [ConversationAgoraApi.kt](app/src/main/java/com/androidengineers/agent_quickstart_android/data/ConversationAgoraApi.kt)
- [Python backend](server/app/main.py)

Those files show the full flow from UI action to Agora session setup.

## What To Customize First

Most teams will customize these pieces first:

1. `ConversationScreen.kt` for UI layout, branding, and session cards
2. `ConversationViewModel.kt` for app state, button actions, and session orchestration
3. `ConversationAgoraApi.kt` for agent presets, base URL, geofence, or startup behavior
4. `server/app/agora_client.py` for agent presets and provider configuration

## Build And Test

Compile Kotlin:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:compileDebugKotlin
```

Run unit tests:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest
```

Assemble debug APK:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

## Docs

- [Setup](docs/setup.md): CLI, server, tunnel, and Android configuration
- [Local HTTPS tunnels](docs/local-tunnels.md): expose the development server to a physical device
- [Backend runbook](docs/backend-runbook.md): HTTPS, API contract, deployment, and smoke checks
- [Architecture](docs/architecture.md): app structure, code map, session lifecycle, and state flow
- [Troubleshooting](docs/troubleshooting.md): common setup, agent, RTM, metrics, and microphone issues
- [Agent coding guidance](docs/agent-guidance.md): Agora CLI skills and guidance for AI coding agents

## Security Note

`AGORA_APP_CERTIFICATE` stays in `server/.env.local` and is never compiled into Android. The Android bearer token is still extractable from an APK, so production deployments should replace the shared quickstart token with user authentication and authorization.
