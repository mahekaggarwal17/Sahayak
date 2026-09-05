# SAHAYAK (सहायक) - Multilingual Public Utility Voice AI Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](license.md)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20FastAPI-green.svg)]()
[![Agora Conversational AI](https://img.shields.io/badge/Agora-Conversational%20AI-orange.svg)](https://docs.agora.io/)
[![Backend Status](https://img.shields.io/badge/Render-Live-brightgreen.svg)](https://sahayak-backend-0r3f.onrender.com/health)

**SAHAYAK** is a context-aware, multilingual voice AI assistant built for public utility services. It allows citizens to report outages, track complaints, inquire about water, electricity, and gas supply, and receive verified public service guidance in natural **Hindi, English, and Hinglish**.

Powered by **Agora Conversational AI**, **Jetpack Compose (Android)**, and **FastAPI**.

---

## 🌐 Live Project & Web Demo Links

- **🚀 Live Web Hosted Demo App**: [https://sahayak-backend-0r3f.onrender.com](https://sahayak-backend-0r3f.onrender.com) *(Direct in-browser voice demo with Agora Web RTC)*
- **GitHub Repository**: [https://github.com/mahekaggarwal17/Sahayak](https://github.com/mahekaggarwal17/Sahayak)
- **API Health Check**: [https://sahayak-backend-0r3f.onrender.com/health](https://sahayak-backend-0r3f.onrender.com/health)
- **Interactive Swagger API Docs**: [https://sahayak-backend-0r3f.onrender.com/docs](https://sahayak-backend-0r3f.onrender.com/docs)

---

## 🏛️ System Architecture

```
┌─────────────────────────────────┐
│     Citizen's Android Phone     │
│   (Kotlin + Jetpack Compose)    │
└──────────────┬──────────────────┘
               │  1. Starts Session (HTTP)
               ▼
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│   Live Python Backend (Render)  │ 2. Spawns     │   Agora Conversational AI Cloud │
│    FastAPI + Session Manager    ├──────────────►│   - Deepgram STT (Multilingual) │
│    (Holds Agora Credentials)    │    Agent      │   - OpenAI LLM (SAHAYAK KB)     │
└──────────────┬──────────────────┘               │   - MiniMax / TTS Audio Engine  │
               │                                  └──────────────┬──────────────────┘
               │  3. Returns RTC/RTM Tokens                      │
               ▼                                                 │ 4. Realtime Audio
┌─────────────────────────────────┐                              │    & Transcripts
│     Direct RTC Audio Stream     │◄─────────────────────────────┘
│  (Bi-directional Voice Channel) │
└─────────────────────────────────┘
```

---

## 💡 Key Features & Capabilities

### 1. Multilingual & Natural Hinglish Code-Switching
- Natural dialogue in Hindi, English, and casual Hinglish (e.g., *"Kal raat se paani nahi aa raha"*, *"Bijli ka bill bahut high aa gaya"*).
- Empathetic, respectful, and avoids robotic, overly formal language.

### 2. Core Public Utility Coverage
- 💧 **Water Supply Assistance**: Outages, low pressure, contamination, single household vs. area-wide diagnostics.
- ⚡ **Electricity Assistance**: Power outages, frequent tripping, voltage issues, billing questions.
- 🔥 **Gas & Public Utility**: Service disruptions, connection queries, and strict **Emergency Protocol** (immediate redirection and safety precautions for gas leaks/fires).
- 📋 **Complaint & Ticket Lifecycle**: Step-by-step guidance for raising new complaints, checking ticket status, and logging updates.

### 3. Strict Grounding & Anti-Hallucination
- **Core Principle**: `LISTEN → CLARIFY → CONFIRM → VERIFY → ACT → RESOLVE OR ESCALATE`
- SAHAYAK never fabricates helpline numbers, ticket numbers, official outage confirmations, or restoration times.
- If data is unavailable, explicitly states: *"Main is information ko abhi reliably verify nahi kar paa raha hoon."*

### 4. Human Escalation Protocol
- If an issue is ambiguous, beyond AI scope, or upon caller request, SAHAYAK bundles all context (language, intent, location, timeline, attempted actions) and routes to human support without requiring the caller to repeat themselves.

---

## 📱 Mobile App (Android Client)

- Built with modern **Kotlin** and **Jetpack Compose** Material 3.
- Real-time live transcript streaming over **Agora RTM**.
- Bi-directional low-latency voice streaming over **Agora RTC**.
- Mute, interrupt, and session management controls.

---

## ⚙️ Quick Start & Local Setup

### 1. Backend Server Setup
```bash
cd server
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate
pip install -r requirements.txt

# Configure environment variables in server/.env.local:
# AGORA_APP_ID=your_app_id
# AGORA_APP_CERTIFICATE=your_app_certificate

uvicorn app.main:app --reload --port 8000
```

### 2. Android App Setup
1. Open the repository root in **Android Studio**.
2. Update `local.properties`:
   ```properties
   QUICKSTART_SERVER_URL=https://sahayak-backend-0r3f.onrender.com
   ```
3. Build and install on an emulator or physical device:
   ```bash
   ./gradlew :app:assembleDebug
   ```

---

## 📄 License
This project is licensed under the MIT License - see the [license.md](license.md) file for details.
