# SAHAYAK (सहायक) - Multilingual Public Utility Voice AI Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](license.md)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20FastAPI-green.svg)]()
[![Agora Conversational AI](https://img.shields.io/badge/Agora-Conversational%20AI-orange.svg)](https://docs.agora.io/)
[![Backend Status](https://img.shields.io/badge/Render-Live-brightgreen.svg)](https://sahayak-backend-0r3f.onrender.com/health)

**SAHAYAK** is a multilingual, voice-first **Public Utility Assistant**. Its purpose is to make everyday public services and civic utilities easier to access for all citizens. Citizens describe their problem naturally through voice, and Sahayak understands the intent, identifies the relevant service or authority, provides clear guidance, takes action where possible, and helps track the request.

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
│    (Holds Agora Credentials)    │    Agent      │   - OpenAI LLM (Sahayak KB)     │
└──────────────┬──────────────────┘               │   - MiniMax Native Hindi Voice  │
               │                                  └──────────────┬──────────────────┘
               │  3. Returns RTC/RTM Tokens                      │
               ▼                                                 │ 4. Realtime Audio
┌─────────────────────────────────┐                              │    & Transcripts
│     Direct RTC Audio Stream     │◄─────────────────────────────┘
│  (Bi-directional Voice Channel) │
└─────────────────────────────────┘
```

---

## 🌟 Core Civic Capabilities (11 Pillars)

### Core Loop
$$\text{Citizen speaks} \longrightarrow \text{Sahayak understands} \longrightarrow \text{Identifies service} \longrightarrow \text{Guides citizen} \longrightarrow \text{Takes action} \longrightarrow \text{Tracks request}$$

1. **Understand Citizen's Problem**: Understands natural, informal spoken queries (e.g., *"Mere area mein 3 din se kachra nahi uthaya gaya"*, *"Street light kharab hai"*, *"Road par bada pothole hai"*). Asks only minimum necessary follow-ups, one question at a time.
2. **Identify Relevant Public Service**: Correctly maps issues to the designated municipal or civic authority (Waste Management/Sanitation, Water Works/Jal Board, PWD/Roads, Municipal Electrical, DISCOM/Power, Drainage).
3. **Raise Service Tickets**: Collects location and details, confirms with the citizen, generates a standard reference ticket (`SHK-CIVIC-XXXX`), and explains expected resolution turnaround.
4. **Check Existing Tickets**: Retrieves status, department, submission date, latest update, and next expected action, translating bureaucratic terms into simple spoken language.
5. **Public Service Discovery**: Explains where to apply, online/offline channels, eligibility, and required documents progressively without overwhelming the citizen.
6. **Find the Right Place**: Directs citizens to the correct civic facilitation center, municipal ward office, or utility sub-station with operating hours.
7. **Step-by-Step Guidance**: Breaks down complex civic procedures (such as applying for a new water connection or property tax guidance) into conversational steps.
8. **Urgent Public Issues**: Immediately detects life-threatening hazards (exposed live wires, sparking transformers, gas leaks, road collapse) and directs citizens to emergency helplines (112) rather than slow ticketing.
9. **Multilingual Voice-First Experience**: Supports Hindi, English, and natural Hinglish code-switching with authentic native pronunciation (`hindi_female_2_v1`), low conversational latency (~350ms VAD), and short spoken turns.
10. **Human Escalation**: Seamlessly transitions edge cases to human support while preserving full conversation context (language, intent, location, timeline, actions taken).
11. **Trust and Safety**: Anti-hallucination guarantee—never invents fake schemes, deadlines, or fees. Never asks for passwords, OTPs, or banking PINs.
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
