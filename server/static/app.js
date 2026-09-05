// SAHAYAK (सहायक) Web Voice Client - Agora Web RTC Integration

let rtcClient = null;
let localAudioTrack = null;
let isCallActive = false;
let isMuted = false;
let currentSession = null;
let callStartTime = null;
let timerInterval = null;

// DOM Elements
const btnStart = document.getElementById("btnStart");
const btnStartText = document.getElementById("btnStartText");
const btnMute = document.getElementById("btnMute");
const btnMuteText = document.getElementById("btnMuteText");
const btnInterrupt = document.getElementById("btnInterrupt");
const voiceOrb = document.getElementById("voiceOrb");
const agentStateLabel = document.getElementById("agentStateLabel");
const audioWaveform = document.getElementById("audioWaveform");
const connectionStatus = document.getElementById("connectionStatus");
const transcriptFeed = document.getElementById("transcriptFeed");
const emergencyBanner = document.getElementById("emergencyBanner");

// Metrics Elements
const metricChannel = document.getElementById("metricChannel");
const metricUid = document.getElementById("metricUid");
const metricLatency = document.getElementById("metricLatency");

// Toggle Call (Start / End)
async function toggleCall() {
    if (isCallActive) {
        await endCall();
    } else {
        await startCall();
    }
}

// Start Call
async function startCall() {
    try {
        updateState("connecting", "Initializing voice session...");
        btnStart.disabled = true;

        // 1. Bootstrap conversation session from backend
        const bootstrapRes = await fetch("/v1/conversation/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });

        if (!bootstrapRes.ok) {
            const err = await bootstrapRes.json().catch(() => ({}));
            throw new Error(err.detail || `Bootstrap failed with status ${bootstrapRes.status}`);
        }

        const sessionData = await bootstrapRes.json();
        currentSession = sessionData;

        // Update metrics
        metricChannel.textContent = sessionData.channel_name;
        metricUid.textContent = sessionData.requester_rtc_uid;

        addTranscriptMessage("system", `Session initialized on channel: ${sessionData.channel_name}`);

        // 2. Initialize Agora RTC Client
        rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

        // Subscribe to remote audio (SAHAYAK Agent)
        rtcClient.on("user-published", async (user, mediaType) => {
            if (mediaType === "audio") {
                await rtcClient.subscribe(user, mediaType);
                user.audioTrack.play();
                updateState("speaking", "SAHAYAK is speaking...");
                addTranscriptMessage("agent", "SAHAYAK voice connected. Listening...");
            }
        });

        rtcClient.on("user-unpublished", (user, mediaType) => {
            if (mediaType === "audio") {
                updateState("active", "Listening to your voice...");
            }
        });

        // Audio volume indicator for animated reactive orb
        AgoraRTC.enableLogUpload();
        rtcClient.enableAudioVolumeIndicator();
        rtcClient.on("volume-indicator", (volumes) => {
            let maxLevel = 0;
            let isAgentSpeaking = false;

            volumes.forEach((vol) => {
                if (vol.level > maxLevel) maxLevel = vol.level;
                if (vol.uid == sessionData.agent_rtc_uid && vol.level > 5) {
                    isAgentSpeaking = true;
                }
            });

            if (isAgentSpeaking) {
                voiceOrb.className = "voice-orb speaking";
                agentStateLabel.textContent = "SAHAYAK is speaking...";
                audioWaveform.classList.remove("hidden");
            } else if (maxLevel > 5) {
                voiceOrb.className = "voice-orb active";
                agentStateLabel.textContent = "Listening to your voice...";
                audioWaveform.classList.remove("hidden");
            } else if (isCallActive) {
                voiceOrb.className = "voice-orb active";
                agentStateLabel.textContent = "Connected. Say something...";
                audioWaveform.classList.add("hidden");
            }
        });

        // 3. Join RTC Channel
        updateState("connecting", "Connecting audio stream...");
        await rtcClient.join(
            sessionData.app_id,
            sessionData.channel_name,
            sessionData.rtc_token,
            sessionData.requester_rtc_uid
        );

        // 4. Create and publish microphone audio track
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "high_quality_stereo",
            AEC: true,
            ANS: true
        });
        await rtcClient.publish([localAudioTrack]);

        // 5. Trigger Backend to start the AI Voice Agent
        updateState("connecting", "Starting SAHAYAK Agent...");
        const joinRes = await fetch("/v1/conversation/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                channel_name: sessionData.channel_name,
                requester_rtc_uid: sessionData.requester_rtc_uid
            })
        });

        if (!joinRes.ok) {
            const err = await joinRes.json().catch(() => ({}));
            throw new Error(err.detail || `Agent join failed with status ${joinRes.status}`);
        }

        const agentData = await joinRes.json();
        currentSession.agent_id = agentData.agent_id;

        // Session Active!
        isCallActive = true;
        btnStart.disabled = false;
        btnStart.classList.add("btn-active-call");
        btnStartText.textContent = "End Session";
        btnMute.disabled = false;
        btnInterrupt.disabled = false;

        updateState("active", "SAHAYAK is ready. Speak in Hindi, English, or Hinglish!");
        addTranscriptMessage("agent", "Namaste! Main SAHAYAK hoon, aapka public utility assistant. Main paani, bijli ya gas supply jaise services mein aapki kya madad kar sakta hoon?");

        // Latency check interval
        callStartTime = Date.now();
        timerInterval = setInterval(() => {
            if (rtcClient && rtcClient.getRemoteAudioStats) {
                const stats = rtcClient.getRemoteAudioStats();
                const firstUid = Object.keys(stats)[0];
                if (firstUid && stats[firstUid]) {
                    metricLatency.textContent = `${stats[firstUid].networkTransportDelay || 45} ms`;
                }
            }
        }, 2000);

    } catch (error) {
        console.error("Call initialization error:", error);
        alert(`Failed to start session: ${error.message}`);
        await endCall();
    }
}

// End Call
async function endCall() {
    updateState("idle", "Disconnecting session...");

    if (currentSession && currentSession.agent_id) {
        try {
            await fetch("/v1/conversation/leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel_name: currentSession.channel_name,
                    agent_id: currentSession.agent_id
                })
            });
        } catch (e) {
            console.warn("Leave agent request error:", e);
        }
    }

    if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack.close();
        localAudioTrack = null;
    }

    if (rtcClient) {
        await rtcClient.leave();
        rtcClient = null;
    }

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    isCallActive = false;
    isMuted = false;
    currentSession = null;

    btnStart.disabled = false;
    btnStart.classList.remove("btn-active-call");
    btnStartText.textContent = "Start Voice Session";
    btnMute.disabled = true;
    btnMuteText.textContent = "Mute";
    btnInterrupt.disabled = true;

    updateState("idle", "Click Start to Speak");
    addTranscriptMessage("system", "Session ended.");
}

// Toggle Mute
function toggleMute() {
    if (!localAudioTrack) return;
    isMuted = !isMuted;
    localAudioTrack.setEnabled(!isMuted);
    btnMuteText.textContent = isMuted ? "Unmute" : "Mute";
    addTranscriptMessage("system", isMuted ? "Microphone muted." : "Microphone unmuted.");
}

// Interrupt Agent
async function interruptAgent() {
    if (!currentSession || !currentSession.agent_id) return;
    try {
        btnInterrupt.disabled = true;
        await fetch("/v1/conversation/interrupt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                channel_name: currentSession.channel_name,
                agent_id: currentSession.agent_id
            })
        });
        addTranscriptMessage("system", "Agent speech interrupted.");
        setTimeout(() => { btnInterrupt.disabled = false; }, 1000);
    } catch (e) {
        console.error("Interrupt failed:", e);
    }
}

// Update State UI
function updateState(state, text) {
    agentStateLabel.textContent = text;
    connectionStatus.className = `status-indicator status-${state}`;

    if (state === "idle") {
        voiceOrb.className = "voice-orb idle";
        connectionStatus.querySelector(".status-text").textContent = "Ready to Connect";
        audioWaveform.classList.add("hidden");
    } else if (state === "connecting") {
        voiceOrb.className = "voice-orb idle";
        connectionStatus.querySelector(".status-text").textContent = "Connecting...";
        audioWaveform.classList.add("hidden");
    } else if (state === "active") {
        voiceOrb.className = "voice-orb active";
        connectionStatus.querySelector(".status-text").textContent = "Live Voice Session";
    }
}

// Add Message to Transcript Feed
function addTranscriptMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${role}-message`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let senderTitle = "You";
    if (role === "agent") senderTitle = "SAHAYAK (सहायक)";
    if (role === "system") senderTitle = "System";

    bubble.innerHTML = `
        <div class="bubble-header">
            <span class="sender-name">${senderTitle}</span>
            <span class="msg-time">${timeStr}</span>
        </div>
        <div class="bubble-body">${escapeHtml(text)}</div>
    `;

    transcriptFeed.appendChild(bubble);
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

// Quick Prompt Simulation
function simulatePrompt(text) {
    addTranscriptMessage("user", text);

    if (text.toLowerCase().includes("gas leak")) {
        emergencyBanner.classList.remove("hidden");
    } else {
        emergencyBanner.classList.add("hidden");
    }

    if (!isCallActive) {
        setTimeout(() => {
            addTranscriptMessage("system", "To speak with SAHAYAK, click 'Start Voice Session' above.");
        }, 400);
    }
}

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    if (tabId === "transcript") {
        document.getElementById("tabTranscriptBtn").classList.add("active");
        document.getElementById("tabTranscript").classList.add("active");
    } else if (tabId === "kb") {
        document.getElementById("tabKbBtn").classList.add("active");
        document.getElementById("tabKb").classList.add("active");
    } else if (tabId === "metrics") {
        document.getElementById("tabMetricsBtn").classList.add("active");
        document.getElementById("tabMetrics").classList.add("active");
    }
}

// Utility: Escape HTML
function escapeHtml(string) {
    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}
