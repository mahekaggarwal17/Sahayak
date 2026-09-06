// SAHAYAK (सहायक) Web Voice Client - Agora Web RTC + RTM 2.x + Dual-Stream Recording
'use strict';

let rtcClient = null;
let rtmClient = null;
let localAudioTrack = null;
let remoteAudioTrack = null;
let isCallActive = false;
let isMuted = false;
let currentSession = null;
let callStartTime = null;
let timerInterval = null;

// Live Captions & Transcripts State
let captionsVisible = true;
let currentAssistantCaption = "";
let callTranscripts = []; // Array of { speaker, text, timestamp, turn_id }
let allRecordingsData = [];

// Web Audio API & MediaRecorder for Dual-Stream Call Recording
let audioContext = null;
let mediaStreamDestination = null;
let mediaRecorder = null;
let recordedAudioChunks = [];

// DOM Elements
const btnStart = document.getElementById("btnStart");
const btnStartText = document.getElementById("btnStartText");
const btnHeaderCta = document.getElementById("btnHeaderCta");
const btnHeaderCtaText = document.getElementById("btnHeaderCtaText");
const btnMute = document.getElementById("btnMute");
const btnMuteText = document.getElementById("btnMuteText");
const btnInterrupt = document.getElementById("btnInterrupt");
const voiceOrb = document.getElementById("voiceOrb");
const agentStateLabel = document.getElementById("agentStateLabel");
const audioWaveform = document.getElementById("audioWaveform");
const connectionStatus = document.getElementById("connectionStatus");
const connectionStatusText = document.getElementById("connectionStatusText");
const transcriptFeed = document.getElementById("transcriptFeed");
const emergencyBanner = document.getElementById("emergencyBanner");

// Live Captions Elements
const liveCaptionsCard = document.getElementById("liveCaptionsCard");
const liveCaptionsText = document.getElementById("liveCaptionsText");
const captionsEqualizer = document.getElementById("captionsEqualizer");

// Metrics Elements
const metricChannel = document.getElementById("metricChannel");
const metricUid = document.getElementById("metricUid");
const metricLatency = document.getElementById("metricLatency");

// Call Storage Elements
const storageCountBadge = document.getElementById("storageCountBadge");
const storageTabBadge = document.getElementById("storageTabBadge");
const statCallsCount = document.getElementById("statCallsCount");
const statTotalDuration = document.getElementById("statTotalDuration");
const storageSearchInput = document.getElementById("storageSearchInput");
const recordingsList = document.getElementById("recordingsList");

// Citizen Auth & Recording State
let currentCitizen = null;
let localAudioConnected = false;

function getAuthToken() {
    return localStorage.getItem("sahayak_auth_token") || "";
}

function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const token = getAuthToken();
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

async function checkAuthStatus() {
    const token = getAuthToken();
    if (!token) {
        updateAuthUI(null);
        return;
    }
    try {
        const res = await fetch("/v1/auth/me", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            currentCitizen = await res.json();
            updateAuthUI(currentCitizen);
        } else {
            logoutCitizen(false);
        }
    } catch (e) {
        console.warn("Auth check failed:", e);
    }
}

function updateAuthUI(citizen) {
    const btnLogin = document.getElementById("btnCitizenLogin");
    const badge = document.getElementById("citizenProfileBadge");
    const nameLabel = document.getElementById("citizenNameLabel");
    const pinBadge = document.getElementById("citizenPinBadge");
    const avatar = badge ? badge.querySelector(".citizen-avatar") : null;

    if (citizen) {
        if (btnLogin) btnLogin.classList.add("hidden");
        if (badge) badge.classList.remove("hidden");
        if (nameLabel) nameLabel.textContent = citizen.name || "Citizen";
        if (pinBadge) pinBadge.textContent = `PIN: ${citizen.pin || "SAH-XXXX"}`;
        if (avatar) {
            if (citizen.picture) {
                avatar.innerHTML = `<img src="${escapeHtml(citizen.picture)}" alt="${escapeHtml(citizen.name || 'Citizen')}" class="citizen-avatar-img" referrerpolicy="no-referrer">`;
            } else {
                avatar.textContent = "👤";
            }
        }
        if (citizen.pin) {
            localStorage.setItem("sahayak_citizen_pin", citizen.pin);
        }
    } else {
        if (btnLogin) btnLogin.classList.remove("hidden");
        if (badge) badge.classList.add("hidden");
        if (avatar) avatar.textContent = "👤";
    }
}

let googleAuthInitialized = false;
let googleClientIdCache = null;

async function initGoogleAuth() {
    try {
        if (!googleClientIdCache) {
            try {
                const res = await fetch("/v1/auth/google-config");
                if (res.ok) {
                    const data = await res.json();
                    googleClientIdCache = data.client_id;
                }
            } catch (e) {
                console.warn("Could not fetch /v1/auth/google-config:", e);
            }
            if (!googleClientIdCache) {
                googleClientIdCache = "962346377917-nk61oe72ckp9vi8edfulktcr1prfp10d.apps.googleusercontent.com";
            }
        }

        // Update Origin Label & Link
        const originLabel = document.getElementById("currentOriginLabel");
        const originTip = document.getElementById("googleOriginTip");
        if (originLabel) {
            originLabel.textContent = window.location.origin;
        }
        if (originTip && window.location.hostname === "127.0.0.1") {
            const localhostUrl = window.location.href.replace("127.0.0.1", "localhost");
            originTip.innerHTML = ` · <a href="${localhostUrl}" class="origin-switch-link" title="Open via localhost if registered in Google Console">Switch to localhost</a>`;
        } else if (originTip && window.location.hostname === "localhost") {
            originTip.innerHTML = ` · <span style="color:var(--green)">✓ Standard OAuth origin</span>`;
        }

        if (window.google && window.google.accounts && window.google.accounts.id) {
            window.google.accounts.id.initialize({
                client_id: googleClientIdCache,
                callback: handleGoogleLoginSuccess,
                auto_select: false,
                cancel_on_tap_outside: true,
            });

            const btnContainer = document.getElementById("googleSignInButton");
            if (btnContainer) {
                btnContainer.innerHTML = ""; // Always clear to ensure exactly ONE button
                window.google.accounts.id.renderButton(btnContainer, {
                    theme: "outline",
                    size: "large",
                    type: "standard",
                    shape: "rectangular",
                    text: "signin_with",
                    logo_alignment: "left",
                    width: 340,
                });
            }
            googleAuthInitialized = true;
        } else {
            setTimeout(() => {
                if (!googleAuthInitialized && window.google && window.google.accounts) {
                    initGoogleAuth();
                }
            }, 600);
        }
    } catch (err) {
        console.error("Error initializing Google Auth:", err);
    }
}

async function handleGoogleLoginSuccess(response) {
    if (!response || !response.credential) {
        console.error("Google login callback missing credential", response);
        showToast("Google sign-in did not return a credential.", "error");
        return;
    }

    const errEl = document.getElementById("authErrorMsg");
    if (errEl) {
        errEl.classList.add("hidden");
        errEl.style.display = "none";
    }

    try {
        showToast("Verifying Google account with SAHAYAK...", "info", 3000);
        const res = await fetch("/v1/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Google verification failed");
        }

        localStorage.setItem("sahayak_auth_token", data.token);
        if (data.pin) {
            localStorage.setItem("sahayak_citizen_pin", data.pin);
        }

        currentCitizen = {
            citizen_id: data.citizen_id,
            phone: data.phone,
            name: data.name,
            email: data.email,
            picture: data.picture,
            pin: data.pin
        };

        updateAuthUI(currentCitizen);
        closeAuthModal();
        showToast(`Welcome ${data.name}! Verified via Google (PIN: ${data.pin})`, "success", 5000);
        await loadTickets();
        await loadRecordings();
    } catch (err) {
        console.error("Google Auth failed:", err);
        if (errEl) {
            errEl.textContent = `⚠ Google Sign-In failed: ${err.message}`;
            errEl.classList.remove("hidden");
            errEl.style.display = "flex";
        }
        showToast(`Google Sign-In failed: ${err.message}`, "error");
    }
}
window.handleGoogleLoginSuccess = handleGoogleLoginSuccess;
window.initGoogleAuth = initGoogleAuth;

function openAuthModal() {
    const modal = document.getElementById("citizenAuthModal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.removeAttribute("hidden");
        modal.style.display = "flex";
        modal.classList.add("active");
    }
    const err = document.getElementById("authErrorMsg");
    if (err) {
        err.classList.add("hidden");
        err.style.display = "none";
    }
    initGoogleAuth();
    setTimeout(() => {
        const phoneInput = document.getElementById("inputCitizenPhone");
        if (phoneInput) phoneInput.focus();
    }, 60);
}

function closeAuthModal() {
    const modal = document.getElementById("citizenAuthModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.setAttribute("hidden", "");
        modal.style.display = "none";
        modal.classList.remove("active");
    }
}

function handleModalBackdropClick(event) {
    if (event.target.id === "citizenAuthModal") {
        closeAuthModal();
    }
}

function fillDemoPersona(phone, name, pin) {
    const phoneInput = document.getElementById("inputCitizenPhone");
    const nameInput = document.getElementById("inputCitizenName");
    const pinInput = document.getElementById("inputCitizenPin");
    if (phoneInput) phoneInput.value = phone;
    if (nameInput) nameInput.value = name;
    if (pinInput) pinInput.value = pin;
}

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeAuthModal();
        closeComplaintModal();
    }
});

async function handleCitizenLoginSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const phoneInput = document.getElementById("inputCitizenPhone");
    const nameInput = document.getElementById("inputCitizenName");
    const pinInput = document.getElementById("inputCitizenPin");
    const phone = phoneInput ? phoneInput.value.trim() : "";
    const name = nameInput ? nameInput.value.trim() : "";
    const pin = pinInput ? pinInput.value.trim() : "";
    const btnSubmit = document.getElementById("btnSubmitAuth");
    const errEl = document.getElementById("authErrorMsg");

    try {
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<span>⏳ Verifying &amp; Logging In...</span>`;
        }
        const res = await fetch("/v1/auth/citizen-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, name, pin: pin || null })
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Authentication failed");
        }
        localStorage.setItem("sahayak_auth_token", data.token);
        currentCitizen = {
            citizen_id: data.citizen_id,
            phone: data.phone,
            name: data.name,
            pin: data.pin
        };
        updateAuthUI(currentCitizen);
        closeAuthModal();
        await loadTickets();
        await loadRecordings();
    } catch (err) {
        if (errEl) {
            errEl.textContent = `⚠ ${err.message}`;
            errEl.classList.remove("hidden");
            errEl.style.display = "flex";
        }
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>🔐 Login &amp; Connect Identity</span>`;
        }
    }
}

async function quickDemoLogin() {
    fillDemoPersona("9876543210", "Rajesh Kumar (Citizen Demo)", "SAH-4821");
    await handleCitizenLoginSubmit({ preventDefault: () => {} });
}

function logoutCitizen(reload = true) {
    localStorage.removeItem("sahayak_auth_token");
    currentCitizen = null;
    updateAuthUI(null);
    if (reload) {
        loadTickets();
        loadRecordings();
    }
}

// ─── CITIZEN PIN ────────────────────────────────────────────────────────────
function getCitizenPin() {
    if (currentCitizen && currentCitizen.pin) {
        return currentCitizen.pin;
    }
    let pin = localStorage.getItem('sahayak_citizen_pin');
    if (!pin) {
        const digits = Math.floor(1000 + Math.random() * 9000);
        pin = `SAH-${digits}`;
        localStorage.setItem('sahayak_citizen_pin', pin);
    }
    return pin;
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
    await checkAuthStatus();
    initGoogleAuth();
    await loadRecordings();
    await loadTickets();
});

// ==========================================================================
// TOAST NOTIFICATIONS & AUDIO RECOVERY
// ==========================================================================
function showToast(message, type = "info", duration = 5000) {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icons = { info: "ℹ️", warning: "⚠️", error: "🚨", success: "✅" };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || "ℹ️"}</span>
        <div class="toast-msg">${escapeHtml(message)}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(toast);
    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(8px)";
            setTimeout(() => toast.remove(), 260);
        }, duration);
    }
}

async function acquireMicrophoneTrack() {
    // 1. Release any lingering tracks to free audio hardware
    if (localAudioTrack) {
        try {
            localAudioTrack.stop();
            localAudioTrack.close();
        } catch (e) {
            console.warn("Could not close previous track:", e);
        }
        localAudioTrack = null;
    }

    // Tier 1: Agora recommended conversational voice profile (Mono 32kHz, AEC, ANS, AGC)
    try {
        console.log("Acquiring microphone (Tier 1: speech_standard with full processing)...");
        return await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "speech_standard",
            AEC: true,
            ANS: true,
            AGC: true
        });
    } catch (err1) {
        console.warn("Tier 1 mic acquisition failed:", err1);
    }

    // Tier 2: speech_standard with AEC only (avoids noise suppression hardware conflicts)
    try {
        console.log("Acquiring microphone (Tier 2: speech_standard AEC only)...");
        return await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "speech_standard",
            AEC: true
        });
    } catch (err2) {
        console.warn("Tier 2 mic acquisition failed:", err2);
    }

    // Tier 3: speech_standard without audio processing constraints
    try {
        console.log("Acquiring microphone (Tier 3: speech_standard clean)...");
        return await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: "speech_standard"
        });
    } catch (err3) {
        console.warn("Tier 3 mic acquisition failed:", err3);
    }

    // Tier 4: Zero constraints - pure browser default stream
    try {
        console.log("Acquiring microphone (Tier 4: bare createMicrophoneAudioTrack)...");
        return await AgoraRTC.createMicrophoneAudioTrack();
    } catch (err4) {
        console.warn("Tier 4 mic acquisition failed:", err4);
    }

    // Tier 5: Enumerate individual microphone devices and test each one
    try {
        const devices = await AgoraRTC.getMicrophones();
        console.log("Enumerating available microphones:", devices);
        for (const dev of devices) {
            if (!dev.deviceId) continue;
            try {
                console.log(`Trying specific microphone ID: ${dev.deviceId} (${dev.label})...`);
                return await AgoraRTC.createMicrophoneAudioTrack({
                    microphoneId: dev.deviceId,
                    encoderConfig: "speech_standard"
                });
            } catch (devErr) {
                console.warn(`Device ${dev.deviceId} failed:`, devErr);
            }
        }
    } catch (enumErr) {
        console.warn("Device enumeration failed:", enumErr);
    }

    return null;
}

// ==========================================================================
// CALL LIFECYCLE (START / END)
// ==========================================================================
async function toggleCall() {
    if (isCallActive) {
        await endCall();
    } else {
        await startCall();
    }
}

async function startCall() {
    if (typeof AgoraRTC === "undefined") {
        showToast("Agora WebRTC SDK failed to load. Please check your internet connection or ad-blocker.", "error", 8000);
        updateState("idle", "SDK offline — check network connection");
        return;
    }

    try {
        updateState("connecting", "Initializing voice session...");
        btnStart.disabled = true;
        callTranscripts = [];
        recordedAudioChunks = [];

        // 1. Bootstrap conversation session from backend
        const bootstrapRes = await fetch("/v1/conversation/bootstrap", {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({})
        });

        if (!bootstrapRes.ok) {
            const err = await bootstrapRes.json().catch(() => ({}));
            throw new Error(err.detail || `Bootstrap failed with status ${bootstrapRes.status}`);
        }

        const sessionData = await bootstrapRes.json();
        currentSession = sessionData;

        // Update metrics
        if (metricChannel) metricChannel.textContent = sessionData.channel_name;
        if (metricUid) metricUid.textContent = sessionData.requester_rtc_uid;

        addTranscriptMessage("system", `Session initialized on channel: ${sessionData.channel_name}`);

        // 2. Initialize Agora RTC Client setup function
        function setupRtcClient() {
            const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

            client.on("user-published", async (user, mediaType) => {
                if (mediaType === "audio") {
                    await client.subscribe(user, mediaType);
                    remoteAudioTrack = user.audioTrack;
                    remoteAudioTrack.play();
                    updateState("speaking", "SAHAYAK is speaking...");

                    // Initialize Dual-Stream Recording once remote audio arrives
                    if (localAudioTrack && remoteAudioTrack) {
                        initDualStreamRecording(localAudioTrack, remoteAudioTrack);
                    }
                }
            });

            client.on("user-unpublished", (user, mediaType) => {
                if (mediaType === "audio") {
                    remoteAudioTrack = null;
                    updateState("active", "Listening to your voice...");
                    setEqualizerActive(false);
                }
            });

            // Audio volume indicator for animated reactive orb
            AgoraRTC.enableLogUpload();
            client.enableAudioVolumeIndicator();
            client.on("volume-indicator", (volumes) => {
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
                    setEqualizerActive(true);
                    const ld = document.getElementById('liveDot');
                    if (ld) { ld.classList.add('active'); }
                } else if (maxLevel > 5) {
                    voiceOrb.className = "voice-orb listening";
                    agentStateLabel.textContent = "Listening...";
                    audioWaveform.classList.remove("hidden");
                    setEqualizerActive(false);
                } else if (isCallActive) {
                    voiceOrb.className = "voice-orb idle";
                    agentStateLabel.textContent = "Connected — speak with SAHAYAK";
                    audioWaveform.classList.add("hidden");
                    setEqualizerActive(false);
                    const ld = document.getElementById('liveDot');
                    if (ld) { ld.classList.remove('active'); }
                }
            });

            return client;
        }

        // 3. Join RTC Channel with automatic client resilience
        updateState("connecting", "Connecting audio stream...");
        rtcClient = setupRtcClient();
        let joinedUid = sessionData.requester_rtc_uid;
        try {
            // Attempt 1: Standard join with issued AccessToken2 & assigned UID
            joinedUid = await rtcClient.join(
                sessionData.app_id,
                sessionData.channel_name,
                sessionData.rtc_token || null,
                sessionData.requester_rtc_uid
            );
        } catch (tokenErr) {
            console.warn("RTC Token join with specific UID encountered error, trying fallback...", tokenErr);
            try { await rtcClient.leave(); } catch (e) {}
            rtcClient = setupRtcClient();
            try {
                // Attempt 2: Testing-mode fallback without token (for App-ID-only projects)
                joinedUid = await rtcClient.join(
                    sessionData.app_id,
                    sessionData.channel_name,
                    null,
                    sessionData.requester_rtc_uid
                );
            } catch (fallbackErr) {
                console.error("Agora RTC connection failed:", { tokenErr, fallbackErr });
                const code = tokenErr.code || fallbackErr.code || "";
                const reason = tokenErr.message || fallbackErr.message || "Authorization failed";
                throw new Error(`Agora audio connection failed (${code ? code + ': ' : ''}${reason}). Please check AGORA_APP_CERTIFICATE or network.`);
            }
        }
        if (joinedUid && joinedUid !== sessionData.requester_rtc_uid) {
            console.log(`Agora allocated UID ${joinedUid} (requested: ${sessionData.requester_rtc_uid})`);
            sessionData.requester_rtc_uid = joinedUid;
            if (metricUid) metricUid.textContent = joinedUid;
        }

        // 4. Create and publish microphone audio track with resilient multi-profile fallback
        updateState("connecting", "Connecting audio & microphone...");
        localAudioTrack = await acquireMicrophoneTrack();

        if (localAudioTrack) {
            await rtcClient.publish([localAudioTrack]);
            // Start local recording buffer in case remote track joins shortly
            initDualStreamRecording(localAudioTrack, null);
        } else {
            console.warn("Continuing in Listen & Chat Mode without microphone.");
            showToast("Microphone is currently unavailable (in use by another app or permissions). Connected in Listen & Text mode so you can hear SAHAYAK.", "warning", 8000);
            addTranscriptMessage("system", "🎙️ Notice: Microphone could not be accessed. You can still hear SAHAYAK speak in real-time and interact using the quick prompt chips below.");
        }

        // 5. Connect Agora Signaling (RTM 2.x) for Real-Time Transcripts & Live Captions
        await connectAgoraRTM(sessionData);

        // 6. Trigger Backend to spawn SAHAYAK Agent
        updateState("connecting", "Connecting SAHAYAK Voice Agent...");
        const joinRes = await fetch("/v1/conversation/join", {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
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
        callStartTime = Date.now();
        btnStart.disabled = false;
        btnStart.classList.add("danger-btn");
        btnStartText.textContent = "End Session";
        if (btnHeaderCta) {
            btnHeaderCta.classList.add("danger");
            if (btnHeaderCtaText) btnHeaderCtaText.textContent = "⏹ End Call";
        }
        // Update status dot
        const sd = document.getElementById('statusDot');
        if (sd) sd.classList.add('active');
        btnMute.disabled = false;
        btnMuteText.textContent = localAudioTrack ? "Mute Mic" : "Connect Mic";
        btnInterrupt.disabled = false;

        updateLiveCaptions("नमस्ते! मैं सहायक हूँ, आपका पब्लिक यूटिलिटी असिस्टेंट। आप किसी भी नागरिक समस्या के लिए मुझसे बात कर सकते हैं।", true);
        updateState("active", localAudioTrack ? "SAHAYAK is ready. Speak in Hindi, English, or Hinglish!" : "Listen & Chat Mode — hear SAHAYAK and use prompt chips below");

        // Latency measurement loop
        timerInterval = setInterval(() => {
            if (rtcClient && rtcClient.getRemoteAudioStats) {
                const stats = rtcClient.getRemoteAudioStats();
                const firstUid = Object.keys(stats)[0];
                if (firstUid && stats[firstUid]) {
                    const delay = stats[firstUid].networkTransportDelay || 38;
                    metricLatency.textContent = `${delay} ms`;
                }
            }
        }, 2000);

    } catch (error) {
        console.error("Call initialization error:", error);
        showToast(`Could not start session: ${error.message}`, "error", 8000);
        addTranscriptMessage("system", `Call initialization error: ${error.message}`);
        await endCall();
    }
}

async function endCall() {
    const wasActive = isCallActive;
    updateState("idle", "Disconnecting and saving call recording...");

    const sessionDurationSec = callStartTime ? Math.max(1, Math.round((Date.now() - callStartTime) / 1000)) : 0;
    const sessionToSave = currentSession ? { ...currentSession } : null;
    const transcriptsToSave = [...callTranscripts];

    // 1. Leave Agent on backend
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

    // 2. Disconnect RTM
    if (rtmClient) {
        try {
            await rtmClient.logout();
        } catch (e) {
            console.warn("RTM logout error:", e);
        }
        rtmClient = null;
    }

    // 3. Stop Local Audio Track & Leave RTC
    if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack.close();
        localAudioTrack = null;
    }
    remoteAudioTrack = null;

    if (rtcClient) {
        await rtcClient.leave();
        rtcClient = null;
    }

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // 4. Finalize Audio Recording & Save to Storage
    if (wasActive && sessionToSave) {
        await finalizeAndSaveRecording(sessionToSave, sessionDurationSec, transcriptsToSave);
    }

    isCallActive = false;
    isMuted = false;
    localAudioConnected = false;
    currentSession = null;
    callStartTime = null;

    btnStart.disabled = false;
    btnStart.classList.remove("danger-btn");
    btnStartText.textContent = "Start Voice Session";
    if (btnHeaderCta) {
        btnHeaderCta.classList.remove("danger");
        if (btnHeaderCtaText) btnHeaderCtaText.textContent = "▶ Start Session";
    }
    const sd = document.getElementById('statusDot');
    if (sd) { sd.classList.remove('active'); sd.classList.remove('calling'); }
    const ld = document.getElementById('liveDot');
    if (ld) ld.classList.remove('active');
    btnMute.disabled = true;
    btnMuteText.textContent = "Mute Mic";
    btnInterrupt.disabled = true;

    setEqualizerActive(false);
    updateState("idle", "Click Start to Speak");
    addTranscriptMessage("system", `Session ended. Total duration: ${sessionDurationSec}s.`);
    updateLiveCaptions("Session ended. Call audio and transcript saved to storage.", false);
}

// ==========================================================================
// AGORA RTM 2.x (REAL-TIME TRANSCRIPTIONS & LIVE CAPTIONS)
// ==========================================================================
async function connectAgoraRTM(sessionData) {
    if (!window.AgoraRTM) {
        console.warn("AgoraRTM Web SDK not loaded. Live captions will use fallback display.");
        return;
    }

    try {
        const { RTM } = AgoraRTM;
        rtmClient = new RTM(sessionData.app_id, sessionData.requester_rtm_user_id, {
            token: sessionData.rtm_token
        });

        // Event: Incoming signaling message
        rtmClient.addEventListener("message", (event) => {
            handleRtmSignalingMessage(event);
        });

        // Event: Presence changes
        rtmClient.addEventListener("presence", (event) => {
            if (event && event.stateChanged) {
                const state = event.stateChanged.state;
                if (state) updateAgentPresenceState(state);
            }
        });

        await rtmClient.login();
        await rtmClient.subscribe(sessionData.channel_name, {
            withMessage: true,
            withPresence: true
        });

        console.log("Agora RTM 2.x subscribed to channel:", sessionData.channel_name);
    } catch (err) {
        console.warn("Agora RTM connection could not be established:", err);
    }
}

function handleRtmSignalingMessage(event) {
    try {
        let rawData = event.message;
        if (typeof rawData !== "string") {
            rawData = new TextDecoder().decode(rawData);
        }

        const payload = JSON.parse(rawData);
        const objType = payload.object;

        if (objType === "assistant.transcription") {
            // Live AI Agent Speech
            const text = (payload.text || "").trim();
            const turnStatus = payload.turn_status; // 0 = in progress, 1 = completed, 2 = interrupted
            const isFinal = turnStatus === 1;

            if (text) {
                currentAssistantCaption = text;
                updateLiveCaptions(text, true, isFinal);

                // Add or update assistant turn in transcript feed
                upsertTranscriptTurn("agent", text, payload.turn_id, isFinal);

                if (isFinal) {
                    detectAndRegisterTicketFromText(text);
                }
            }
        } else if (objType === "user.transcription") {
            // Citizen / User Speech
            const text = (payload.text || "").trim();
            const isFinal = payload.final !== false;

            if (text) {
                upsertTranscriptTurn("user", text, payload.turn_id, isFinal);
                checkForCivicEmergency(text);
            }
        } else if (objType === "message.state") {
            const rawState = payload.state;
            if (rawState) updateAgentPresenceState(rawState);
        } else if (objType === "message.interrupt") {
            setEqualizerActive(false);
            if (liveCaptionsCard) liveCaptionsCard.classList.remove("agent-speaking");
            addTranscriptMessage("system", "Agent speech interrupted.");
        }
    } catch (e) {
        console.warn("Error parsing RTM signaling message:", e);
    }
}

const seenTickets = new Set();
async function detectAndRegisterTicketFromText(text) {
    let ticketId = null;
    const match = text.match(/SHK-CIVIC-\d{4}/i);
    if (match) {
        ticketId = match[0].toUpperCase();
    } else {
        const matchAlt = text.match(/(?:ticket|complaint|शिकायत)\s*(?:id|number|no|संख्या)?\s*[:#-]?\s*(\d{4,6})/i);
        if (matchAlt) {
            ticketId = `SHK-CIVIC-${matchAlt[1]}`;
        }
    }
    if (!ticketId) return;

    if (seenTickets.has(ticketId)) return;
    seenTickets.add(ticketId);

    console.log("Detected AI-generated ticket:", ticketId);

    // Extract context: find the latest user problem description from callTranscripts
    let userProblem = "Civic complaint reported in voice session.";
    for (let i = callTranscripts.length - 1; i >= 0; i--) {
        if (callTranscripts[i].speaker === "user" && callTranscripts[i].text) {
            userProblem = callTranscripts[i].text;
            break;
        }
    }

    // Determine category from keywords
    const lower = (text + " " + userProblem).toLowerCase();
    let category = "Municipal Civic Services";
    if (lower.includes("kachra") || lower.includes("garbage") || lower.includes("waste") || lower.includes("safai")) {
        category = "Waste & Sanitation";
    } else if (lower.includes("light") || lower.includes("bijli") || lower.includes("andhera") || lower.includes("pole")) {
        category = "Street Lighting";
    } else if (lower.includes("pothole") || lower.includes("gaddha") || lower.includes("road") || lower.includes("sadak")) {
        category = "Roads & Potholes";
    } else if (lower.includes("paani") || lower.includes("water") || lower.includes("pipeline") || lower.includes("tanker")) {
        category = "Water Supply";
    } else if (lower.includes("wire") || lower.includes("spark") || lower.includes("gas") || lower.includes("112")) {
        category = "Emergency & Hazards";
    }

    try {
        const res = await fetch("/v1/tickets", {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                ticket_id: ticketId,
                problem: userProblem,
                category: category,
                address: "Captured via SAHAYAK Voice Call",
                citizen_pin: getCitizenPin()
            })
        });
        if (res.ok) {
            console.log("Successfully persisted ticket:", ticketId);
            await loadTickets();
            addTranscriptMessage("system", `🎫 Ticket ${ticketId} registered with Municipal Authority and saved to 'My Tickets'.`);
        }
    } catch (e) {
        console.warn("Could not auto-register detected ticket:", e);
    }
}

function updateAgentPresenceState(state) {
    const lower = String(state).toLowerCase();
    if (lower === "speaking") {
        setEqualizerActive(true);
        if (liveCaptionsCard) liveCaptionsCard.classList.add("agent-speaking");
        agentStateLabel.textContent = "SAHAYAK is speaking...";
        const ld = document.getElementById('liveDot');
        if (ld) ld.classList.add('active');
    } else if (lower === "listening") {
        setEqualizerActive(false);
        if (liveCaptionsCard) liveCaptionsCard.classList.remove("agent-speaking");
        agentStateLabel.textContent = "Listening...";
        const ld = document.getElementById('liveDot');
        if (ld) ld.classList.remove('active');
    } else if (lower === "thinking") {
        setEqualizerActive(false);
        agentStateLabel.textContent = "Thinking...";
    }
}

// ==========================================================================
// LIVE CAPTIONS UI HANDLER
// ==========================================================================
function updateLiveCaptions(text, isLive = true, isFinal = false) {
    if (!liveCaptionsText) return;

    liveCaptionsText.textContent = text;
    liveCaptionsText.classList.toggle("is-live", isLive);

    if (liveCaptionsCard) {
        if (isLive && !isFinal) {
            liveCaptionsCard.classList.add("agent-speaking");
            setEqualizerActive(true);
        } else {
            liveCaptionsCard.classList.remove("agent-speaking");
            setEqualizerActive(false);
        }
    }
    if (liveCaptionsText) liveCaptionsText.classList.remove('placeholder');
}

function toggleCaptionsVisibility() {
    captionsVisible = !captionsVisible;
    const body = document.getElementById("liveCaptionsContent");
    if (body) {
        body.style.display = captionsVisible ? "block" : "none";
    }
    const btn = document.getElementById("btnToggleCaptions");
    if (btn) btn.textContent = captionsVisible ? "Hide" : "Show";
}

function setEqualizerActive(active) {
    if (captionsEqualizer) {
        if (active) {
            captionsEqualizer.classList.remove("hidden");
        } else {
            captionsEqualizer.classList.add("hidden");
        }
    }
}

// ==========================================================================
// DUAL-STREAM AUDIO RECORDING (WEB AUDIO API + MEDIARECORDER)
// ==========================================================================
function initDualStreamRecording(localTrack, remoteTrack) {
    try {
        if (!window.AudioContext && !window.webkitAudioContext) {
            console.warn("Web Audio API not supported on this browser.");
            return;
        }

        if (!audioContext || audioContext.state === "closed") {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioCtx();
            mediaStreamDestination = audioContext.createMediaStreamDestination();
        }

        // Add local mic stream (only once per session to avoid doubled volume and clipping)
        if (localTrack && localTrack.getMediaStreamTrack && !localAudioConnected) {
            try {
                const localMediaStream = new MediaStream([localTrack.getMediaStreamTrack()]);
                const localSource = audioContext.createMediaStreamSource(localMediaStream);
                localSource.connect(mediaStreamDestination);
                localAudioConnected = true;
            } catch (e) {
                console.warn("Could not connect local audio track to recorder:", e);
            }
        }

        // Add remote agent stream
        if (remoteTrack && remoteTrack.getMediaStreamTrack) {
            try {
                const remoteMediaStream = new MediaStream([remoteTrack.getMediaStreamTrack()]);
                const remoteSource = audioContext.createMediaStreamSource(remoteMediaStream);
                remoteSource.connect(mediaStreamDestination);
            } catch (e) {
                console.warn("Could not connect remote audio track to recorder:", e);
            }
        }

        if (!mediaRecorder && mediaStreamDestination) {
            let mimeType = "audio/webm;codecs=opus";
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = "audio/webm";
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = "";
            }

            mediaRecorder = mimeType ? new MediaRecorder(mediaStreamDestination.stream, { mimeType }) : new MediaRecorder(mediaStreamDestination.stream);
            recordedAudioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedAudioChunks.push(e.data);
                }
            };

            mediaRecorder.start(1000); // 1-second timeslices
            console.log("Dual-stream call recording started with MIME:", mediaRecorder.mimeType);
        }
    } catch (err) {
        console.warn("Dual-stream audio recorder initialization error:", err);
    }
}

async function finalizeAndSaveRecording(session, durationSeconds, transcripts) {
    try {
        let audioBase64 = "";

        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            await Promise.race([
                new Promise((resolve) => {
                    mediaRecorder.onstop = resolve;
                    try {
                        mediaRecorder.stop();
                    } catch (e) {
                        resolve();
                    }
                }),
                new Promise((resolve) => setTimeout(resolve, 1500))
            ]);
        }

        if (audioContext && audioContext.state !== "closed") {
            try {
                await audioContext.close();
            } catch (e) {}
            audioContext = null;
            mediaRecorder = null;
            mediaStreamDestination = null;
        }

        if (recordedAudioChunks.length > 0) {
            const audioBlob = new Blob(recordedAudioChunks, { type: "audio/webm" });
            audioBase64 = await blobToBase64(audioBlob);
        }

        // Payload for POST /v1/recordings
        const savePayload = {
            channel_name: session.channel_name,
            duration_seconds: durationSeconds,
            audio_base64: audioBase64,
            audio_format: "webm",
            transcripts: transcripts,
            metadata: {
                agent_id: session.agent_id || "",
                requester_rtc_uid: session.requester_rtc_uid || "",
                citizen_pin: getCitizenPin(),
                citizen_id: currentCitizen ? currentCitizen.citizen_id : "",
            }
        };

        const res = await fetch("/v1/recordings", {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(savePayload)
        });

        if (res.ok) {
            const savedRec = await res.json();
            console.log("Call successfully recorded & saved to storage:", savedRec.id);
            // Refresh storage tab list and tickets
            await loadRecordings();
            await loadTickets();
            const tNum = savedRec.ticket_number ? ` (Ticket #${savedRec.ticket_number})` : "";
            showToast(`Call recorded & complaint saved${tNum}! Check 'My Tickets' and 'Recordings'.`, "success", 5000);
        } else {
            console.warn("Server recording save failed status:", res.status);
        }

    } catch (err) {
        console.error("Error finalizing recording save:", err);
    }
}

async function generateTicketForRecording(recordingId) {
    try {
        showToast("Generating official complaint ticket...", "info", 2000);
        const res = await fetch(`/v1/recordings/${encodeURIComponent(recordingId)}/generate-ticket`, {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" })
        });
        if (!res.ok) {
            throw new Error("Could not generate ticket for this recording.");
        }
        const ticket = await res.json();
        showToast(`🎫 Ticket ${ticket.id} generated and saved to My Tickets!`, "success", 4000);
        await loadRecordings();
        await loadTickets();
        jumpToTicket(ticket.id);
    } catch (e) {
        console.error("Error generating ticket:", e);
        showToast(e.message || "Failed to generate ticket.", "error");
    }
}

function jumpToTicket(ticketId) {
    if (!ticketId) return;
    switchTab('tickets');
    setTimeout(() => {
        const el = document.getElementById(`ticket-card-${ticketId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.borderColor = 'var(--accent)';
            el.style.boxShadow = '0 0 24px rgba(124,109,250,0.6)';
            setTimeout(() => {
                el.style.borderColor = '';
                el.style.boxShadow = '';
            }, 3000);
        }
    }, 120);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ==========================================================================
// RECORDED CALLS STORAGE TAB & PLAYBACK
// ==========================================================================
async function loadRecordings() {
    try {
        const res = await fetch("/v1/recordings", {
            headers: getAuthHeaders()
        });
        if (!res.ok) return;

        const data = await res.json();
        allRecordingsData = data.recordings || [];

        // Update stats
        if (storageCountBadge) storageCountBadge.textContent = allRecordingsData.length;
        if (storageTabBadge) storageTabBadge.textContent = allRecordingsData.length;
        if (statCallsCount) statCallsCount.textContent = allRecordingsData.length;

        const totalSec = allRecordingsData.reduce((acc, r) => acc + (r.duration_seconds || 0), 0);
        if (statTotalDuration) statTotalDuration.textContent = formatDuration(totalSec);

        renderRecordings(allRecordingsData);
    } catch (e) {
        console.warn("Failed to load recordings list:", e);
    }
}

function renderRecordings(recordings) {
    if (!recordingsList) return;

    if (!recordings || recordings.length === 0) {
        recordingsList.innerHTML = `
            <div class="empty-storage-notice">
                <span class="empty-icon">🎙️</span>
                <h4>No Recorded Calls Yet</h4>
                <p>Start a voice session with SAHAYAK. When your call finishes, the full audio recording and transcript will be automatically saved and stored here.</p>
            </div>
        `;
        return;
    }

    recordingsList.innerHTML = recordings.map(rec => {
        const isUrgent = rec.category === "Urgent Public Safety";
        const catClass = isUrgent ? "category-pill danger" : "category-pill";
        const ticketHtml = rec.ticket_number 
            ? `<span class="ticket-tag clickable" onclick="jumpToTicket('${escapeHtml(rec.ticket_number)}')" title="Click to view ticket in My Tickets">🎫 #${escapeHtml(rec.ticket_number)}</span>` 
            : `<button class="btn-generate-ticket" onclick="generateTicketForRecording('${escapeHtml(rec.id)}')" title="Generate complaint ticket from this call">🎫 Generate Ticket</button>`;

        return `
            <div class="recording-card" id="card-${escapeHtml(rec.id)}">
                <div class="recording-card-header">
                    <div class="recording-meta-left">
                        <div class="recording-date-title">${escapeHtml(rec.created_at_formatted || "Past Call")}</div>
                        <div class="recording-badges-row">
                            <span class="${catClass}">${escapeHtml(rec.category || "Civic Assistance")}</span>
                            ${ticketHtml}
                            <span class="duration-tag">⏱️ ${formatDuration(rec.duration_seconds)}</span>
                        </div>
                    </div>
                    <div class="recording-card-actions">
                        <a href="${rec.audio_url}" download="${escapeHtml(rec.audio_filename)}" class="btn-icon-action" title="Download audio">
                            ⬇️
                        </a>
                        <button class="btn-icon-action delete-btn" onclick="deleteRecording('${escapeHtml(rec.id)}')" title="Delete recording">
                            🗑️
                        </button>
                    </div>
                </div>

                <div class="recording-summary-text">
                    ${escapeHtml(rec.summary || "Conversation with SAHAYAK Voice AI")}
                </div>

                <div class="recording-audio-player">
                    <audio controls preload="none" src="${rec.audio_url}">
                        Your browser does not support the audio element.
                    </audio>
                </div>

                <div class="transcript-accordion">
                    <button class="transcript-toggle-btn" onclick="toggleTranscriptAccordion('${escapeHtml(rec.id)}')">
                        <span>💬 View Conversation Transcript (${rec.turns_count || 0} turns)</span>
                    </button>
                    <div id="transcript-${escapeHtml(rec.id)}" class="transcript-accordion-content hidden">
                        <em>Loading transcript...</em>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function filterRecordings() {
    const query = (storageSearchInput ? storageSearchInput.value : "").toLowerCase().trim();
    if (!query) {
        renderRecordings(allRecordingsData);
        return;
    }

    const filtered = allRecordingsData.filter(r => {
        return (r.summary && r.summary.toLowerCase().includes(query)) ||
            (r.category && r.category.toLowerCase().includes(query)) ||
            (r.ticket_number && r.ticket_number.toLowerCase().includes(query)) ||
            (r.channel_name && r.channel_name.toLowerCase().includes(query));
    });
    renderRecordings(filtered);
}

async function deleteRecording(id) {
    if (!confirm("Are you sure you want to delete this recorded call from storage?")) {
        return;
    }

    try {
        const res = await fetch(`/v1/recordings/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });
        if (res.ok) {
            const card = document.getElementById(`card-${id}`);
            if (card) card.remove();
            await loadRecordings();
        } else {
            showToast("Failed to delete recording.", "error");
        }
    } catch (e) {
        console.error("Error deleting recording:", e);
        showToast("Error deleting recording.", "error");
    }
}

async function toggleTranscriptAccordion(id) {
    const panel = document.getElementById(`transcript-${id}`);
    if (!panel) return;

    if (!panel.classList.contains("hidden")) {
        panel.classList.add("hidden");
        return;
    }

    panel.classList.remove("hidden");
    panel.innerHTML = "<em>Loading transcript...</em>";

    try {
        const res = await fetch(`/v1/recordings/${encodeURIComponent(id)}`);
        if (res.status === 404) {
            showToast("Recording was deleted or not found.", "warning");
            const card = document.getElementById(`card-${id}`);
            if (card) card.remove();
            allRecordingsData = allRecordingsData.filter(r => r.id !== id);
            renderRecordings(allRecordingsData);
            return;
        }
        if (!res.ok) throw new Error("Could not fetch details.");
        const detail = await res.json();
        const turns = detail.transcripts || [];

        if (turns.length === 0) {
            panel.innerHTML = "<em>No speech transcript recorded for this session.</em>";
            return;
        }

        panel.innerHTML = turns.map(t => {
            const isAgent = t.speaker === "agent";
            const speakerName = isAgent ? "SAHAYAK" : "Citizen";
            const cssClass = isAgent ? "accordion-turn agent-turn" : "accordion-turn user-turn";
            return `
                <div class="${cssClass}">
                    <strong>${speakerName}:</strong> ${escapeHtml(t.text || "")}
                </div>
            `;
        }).join("");
    } catch (err) {
        panel.innerHTML = `<span style="color: #ff3b5c;">Error loading transcript: ${escapeHtml(err.message)}</span>`;
    }
}

// ==========================================================================
// TRANSCRIPT & CONTROLS HELPERS
// ==========================================================================
function upsertTranscriptTurn(role, text, turnId, isFinal) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Store in callTranscripts for persistent saving
    const existingIndex = callTranscripts.findIndex(t => t.turn_id != null && t.turn_id === turnId && t.speaker === role);
    if (existingIndex !== -1) {
        callTranscripts[existingIndex].text = text;
        callTranscripts[existingIndex].is_final = isFinal;
    } else {
        callTranscripts.push({
            speaker: role,
            text: text,
            timestamp: timeStr,
            turn_id: turnId,
            is_final: isFinal
        });
    }

    // Update Live Transcript Feed in UI
    const bubbleId = turnId ? `bubble-${role}-${turnId}` : null;
    let bubble = bubbleId ? document.getElementById(bubbleId) : null;

    if (bubble) {
        const body = bubble.querySelector(".msg-body");
        if (body) body.textContent = text;
    } else {
        bubble = document.createElement("div");
        if (bubbleId) bubble.id = bubbleId;
        bubble.className = `msg ${role}`;

        let senderTitle = role === "agent" ? "SAHAYAK सहायक" : "You";

        bubble.innerHTML = `
            <div class="msg-meta">
                <span class="msg-sender">${senderTitle}</span>
                <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-body">${escapeHtml(text)}</div>
        `;
        transcriptFeed.appendChild(bubble);
        transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
    }
}

function addTranscriptMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `msg ${role}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let senderTitle = "You";
    if (role === "agent") senderTitle = "SAHAYAK सहायक";
    if (role === "system") senderTitle = "System";

    bubble.innerHTML = `
        <div class="msg-meta">
            <span class="msg-sender">${senderTitle}</span>
            <span class="msg-time">${timeStr}</span>
        </div>
        <div class="msg-body">${escapeHtml(text)}</div>
    `;

    transcriptFeed.appendChild(bubble);
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function checkForCivicEmergency(text) {
    const lower = text.toLowerCase();
    if (lower.includes("gas leak") || lower.includes("electric wire") || lower.includes("emergency") || lower.includes("hazard") || lower.includes("aag")) {
        if (emergencyBanner) emergencyBanner.classList.remove("hidden");
    }
}

async function toggleMute() {
    if (!localAudioTrack) {
        // Attempt to connect microphone dynamically
        updateState("connecting", "Connecting microphone...");
        const track = await acquireMicrophoneTrack();
        if (track) {
            localAudioTrack = track;
            if (rtcClient) {
                await rtcClient.publish([localAudioTrack]);
                initDualStreamRecording(localAudioTrack, remoteAudioTrack);
            }
            isMuted = false;
            btnMuteText.textContent = "Mute Mic";
            updateState("active", "Microphone connected! Speak with SAHAYAK.");
            showToast("Microphone connected successfully! You can now speak.", "success", 4000);
            addTranscriptMessage("system", "Microphone connected! You can now speak.");
        } else {
            updateState("active", "Listen & Chat Mode — microphone still unavailable.");
            showToast("Microphone still in use or inaccessible. Close other apps (Teams/Zoom) and try again.", "error", 6000);
        }
        return;
    }
    isMuted = !isMuted;
    localAudioTrack.setEnabled(!isMuted);
    btnMuteText.textContent = isMuted ? "Unmute Mic" : "Mute Mic";
    addTranscriptMessage("system", isMuted ? "Microphone muted." : "Microphone unmuted.");
}

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
        setEqualizerActive(false);
        addTranscriptMessage("system", "Agent speech interrupted.");
        setTimeout(() => { btnInterrupt.disabled = false; }, 1000);
    } catch (e) {
        console.error("Interrupt failed:", e);
    }
}

function updateState(state, text) {
    if (agentStateLabel) agentStateLabel.textContent = text;
    if (connectionStatusText) {
        if (state === "idle")       connectionStatusText.textContent = "Ready";
        if (state === "connecting") connectionStatusText.textContent = "Connecting...";
        if (state === "active")     connectionStatusText.textContent = "Live";
        if (state === "speaking")   connectionStatusText.textContent = "Speaking";
    }

    const sd = document.getElementById('statusDot');
    if (sd) {
        if (state === "active" || state === "speaking") {
            sd.classList.add("active"); sd.classList.remove("calling");
        } else if (state === "connecting") {
            sd.classList.add("calling"); sd.classList.remove("active");
        } else {
            sd.classList.remove("active"); sd.classList.remove("calling");
        }
    }

    if (voiceOrb) {
        if (state === "idle") {
            voiceOrb.className = "voice-orb idle";
            if (audioWaveform) audioWaveform.classList.add("hidden");
        } else if (state === "speaking") {
            voiceOrb.className = "voice-orb speaking";
            if (audioWaveform) audioWaveform.classList.remove("hidden");
        } else if (state === "active" || state === "connecting") {
            voiceOrb.className = "voice-orb listening";
        }
    }
}

async function simulatePrompt(text) {
    upsertTranscriptTurn("user", text, Date.now(), true);
    checkForCivicEmergency(text);

    if (isCallActive && rtmClient && currentSession) {
        try {
            await rtmClient.publish(currentSession.channel_name, JSON.stringify({
                object: "user.transcription",
                text: text,
                final: true
            }));
            console.log("Quick prompt sent to AI via Agora RTM:", text);
        } catch (e) {
            console.warn("Could not transmit prompt via RTM:", e);
        }
    } else if (!isCallActive) {
        setTimeout(() => {
            addTranscriptMessage("system", "To speak with SAHAYAK, click 'Start Voice Session' above.");
        }, 400);
    }
}

function switchTab(tabId) {
    const buttons = {
        transcript: document.getElementById("tabTranscriptBtn"),
        storage:    document.getElementById("tabStorageBtn"),
        kb:         document.getElementById("tabKbBtn"),
        tickets:    document.getElementById("tabTicketsBtn"),
        metrics:    document.getElementById("tabMetricsBtn"),
    };
    const panes = {
        transcript: document.getElementById("tabTranscript"),
        storage:    document.getElementById("tabStorage"),
        kb:         document.getElementById("tabKb"),
        tickets:    document.getElementById("tabTickets"),
        metrics:    document.getElementById("tabMetrics"),
    };

    Object.values(buttons).forEach(btn  => btn  && btn.classList.remove("active"));
    Object.values(panes).forEach(pane => pane && pane.classList.remove("active"));

    if (buttons[tabId]) buttons[tabId].classList.add("active");
    if (panes[tabId])   panes[tabId].classList.add("active");

    if (tabId === "storage") loadRecordings();
    if (tabId === "tickets") loadTickets();

    // ── Sync top nav to match the selected workspace tab ──
    const tabToNav = {
        transcript: "navVoice",
        storage:    "navStorage",
        kb:         "navKb",
        tickets:    "navTickets",
        metrics:    "navMetrics",
    };
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    const matchingNav = document.getElementById(tabToNav[tabId]);
    if (matchingNav) matchingNav.classList.add("active");
}

function switchMainTab(tabId) {
    // Update topbar nav tabs
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    const navMap = { voice: 'navVoice', storage: 'navStorage', kb: 'navKb', tickets: 'navTickets', metrics: 'navMetrics' };
    const activeNav = document.getElementById(navMap[tabId]);
    if (activeNav) activeNav.classList.add("active");

    // Always keep on the same page; just jump to relevant workspace tab
    if (tabId === "voice")      { switchTab("transcript"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (tabId === "storage")  { switchTab("storage");  const el = document.getElementById("tabStorage");  if (el) el.scrollIntoView({ behavior: "smooth" }); }
    else if (tabId === "kb")       { switchTab("kb");       const el = document.getElementById("tabKb");       if (el) el.scrollIntoView({ behavior: "smooth" }); }
    else if (tabId === "tickets")  { switchTab("tickets");  const el = document.getElementById("tabTickets");  if (el) el.scrollIntoView({ behavior: "smooth" }); }
    else if (tabId === "metrics")  { switchTab("metrics");  const el = document.getElementById("tabMetrics");  if (el) el.scrollIntoView({ behavior: "smooth" }); }
}

function formatDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    if (mins > 0) {
        return `${mins}m ${rem}s`;
    }
    return `${rem}s`;
}

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

// ─── FAQ ACCORDION ───────────────────────────────────────────
function toggleFaq(btn) {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    // Close all open items
    document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
    // Toggle clicked item
    if (!isOpen) item.classList.add('open');
}

// ─── MY TICKETS TAB ──────────────────────────────────────────
// Seed data — in production these would come from the backend.
// All tickets share the same single Citizen PIN for the current user.
const SEED_TICKETS = [
    {
        id: "SHK-CIVIC-1042",
        problem: "Uncollected garbage piling up near Sector 12 main road for 3 days.",
        category: "Waste & Sanitation",
        categoryIcon: "🗑",
        status: "In Progress",
        address: "Sector 12, Block B, Near Main Gate, New Delhi – 110001",
        department: "Nagar Nigam Sanitation Dept.",
        raised: "04 Sep 2026, 10:32 AM",
        updated: "05 Sep 2026, 08:15 AM"
    },
    {
        id: "SHK-CIVIC-1038",
        problem: "Street light on MG Road near bus stand is non-functional since last week.",
        category: "Street Lighting",
        categoryIcon: "💡",
        status: "Problem Solved",
        address: "MG Road, Bus Stand Area, Connaught Place, New Delhi – 110020",
        department: "Municipal Electrical Dept.",
        raised: "01 Sep 2026, 07:45 PM",
        updated: "03 Sep 2026, 04:00 PM"
    },
    {
        id: "SHK-CIVIC-1055",
        problem: "Large pothole on Ring Road near Lajpat Nagar flyover causing accidents.",
        category: "Roads & Potholes",
        categoryIcon: "🕳",
        status: "In Progress",
        address: "Ring Road, Near Lajpat Nagar Flyover, New Delhi – 110024",
        department: "PWD Roads Division",
        raised: "05 Sep 2026, 09:10 AM",
        updated: "05 Sep 2026, 09:10 AM"
    }
];

let allTicketsData = [];

async function loadTickets() {
    const userPin = getCitizenPin();
    try {
        const query = userPin ? `?pin=${encodeURIComponent(userPin)}` : "";
        const res = await fetch(`/v1/tickets${query}`, {
            headers: getAuthHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            const tickets = (data.tickets || []).map(t => ({
                id: t.id,
                problem: t.problem,
                category: t.category,
                categoryIcon: t.category_icon || "📋",
                status: t.status,
                address: t.address,
                department: t.department,
                raised: t.raised,
                updated: t.updated,
                pin: t.citizen_pin || userPin
            }));
            allTicketsData = tickets;
            renderTickets(tickets);
            return;
        }
    } catch (e) {
        console.warn("Could not fetch tickets from backend:", e);
    }

    // Fallback if offline
    const dynamic = JSON.parse(sessionStorage.getItem('sahayak_tickets') || '[]');
    const all = [...dynamic, ...SEED_TICKETS].map(t => ({ ...t, pin: userPin }));
    allTicketsData = all;
    renderTickets(all);
}

function filterTickets(category, btn) {
    if (btn) {
        document.querySelectorAll(".ticket-filter-pill").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
    }
    if (!category || category === "all") {
        renderTickets(allTicketsData);
        return;
    }
    const filtered = allTicketsData.filter(t => {
        const cat = (t.category || "").toLowerCase() + " " + (t.problem || "").toLowerCase();
        if (category === "waste") return cat.includes("waste") || cat.includes("garbage");
        if (category === "water") return cat.includes("water");
        if (category === "light") return cat.includes("light") || cat.includes("electric");
        if (category === "road") return cat.includes("road") || cat.includes("pothole");
        if (category === "emergency") return cat.includes("hazard") || cat.includes("emergency") || cat.includes("urgent") || cat.includes("accident");
        return true;
    });
    renderTickets(filtered);
}

function renderTickets(tickets) {
    const list   = document.getElementById('ticketsList');
    const empty  = document.getElementById('ticketsEmpty');
    if (!list) return;

    if (!tickets || tickets.length === 0) {
        list.innerHTML  = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    list.innerHTML = tickets.map((t, i) => {
        const isSolved = t.status === 'Problem Solved';
        const statusClass = isSolved ? 'ticket-status solved' : 'ticket-status inprogress';
        const statusIcon  = isSolved ? '✅' : '🔄';
        const maskedPin   = '••••••••';
        return `
        <div class="ticket-card ${isSolved ? 'solved' : ''}" id="ticket-card-${escapeHtml(t.id)}">
            <div class="ticket-card-top">
                <div class="ticket-id-block">
                    <span class="ticket-cat-icon">${t.categoryIcon}</span>
                    <div>
                        <div class="ticket-id">${escapeHtml(t.id)}</div>
                        <div class="ticket-cat">${escapeHtml(t.category)}</div>
                    </div>
                </div>
                <span class="${statusClass}">${statusIcon} ${escapeHtml(t.status)}</span>
            </div>

            <p class="ticket-problem">${escapeHtml(t.problem)}</p>

            <div class="ticket-meta-grid">
                <div class="ticket-meta-item">
                    <span class="ticket-meta-label">📍 Address</span>
                    <span class="ticket-meta-value">${escapeHtml(t.address)}</span>
                </div>
                <div class="ticket-meta-item">
                    <span class="ticket-meta-label">🏢 Department</span>
                    <span class="ticket-meta-value">${escapeHtml(t.department)}</span>
                </div>
                <div class="ticket-meta-item">
                    <span class="ticket-meta-label">📅 Raised</span>
                    <span class="ticket-meta-value">${escapeHtml(t.raised)}</span>
                </div>
                <div class="ticket-meta-item">
                    <span class="ticket-meta-label">🔁 Last Updated</span>
                    <span class="ticket-meta-value">${escapeHtml(t.updated)}</span>
                </div>
            </div>

            <div class="ticket-pin-row">
                <span class="ticket-pin-label">🔐 Citizen PIN</span>
                <div class="ticket-pin-value-wrap">
                    <code class="ticket-pin-value" id="pin-${i}">${maskedPin}</code>
                    <button class="pin-reveal-btn" onclick="togglePin(${i}, '${escapeHtml(t.pin)}')" title="Reveal / Hide PIN" aria-label="Toggle PIN visibility">
                        <span id="pin-eye-${i}">👁</span>
                    </button>
                </div>
                <span class="pin-hint">Your single Citizen PIN — same for all tickets. If you lose your phone, visit the nearest Municipal Ward Office / Jan Seva Kendra with a valid ID to recover it.</span>
            </div>
        </div>`;
    }).join('');
}

function togglePin(index, actualPin) {
    const pinEl = document.getElementById(`pin-${index}`);
    const eyeEl = document.getElementById(`pin-eye-${index}`);
    if (!pinEl) return;
    const isHidden = pinEl.textContent === '••••••••';
    pinEl.textContent = isHidden ? actualPin : '••••••••';
    pinEl.classList.toggle('revealed', isHidden);
    if (eyeEl) eyeEl.textContent = isHidden ? '🙈' : '👁';
}

// ─── FILE COMPLAINT MODAL ──────────────────────────────────────
function openComplaintModal() {
    const modal = document.getElementById("fileComplaintModal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.removeAttribute("hidden");
        modal.style.display = "flex";
        modal.classList.add("active");
    }
    const err = document.getElementById("complaintErrorMsg");
    if (err) {
        err.classList.add("hidden");
        err.style.display = "none";
    }
    setTimeout(() => {
        const prob = document.getElementById("inputComplaintProblem");
        if (prob) prob.focus();
    }, 60);
}

function closeComplaintModal() {
    const modal = document.getElementById("fileComplaintModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.setAttribute("hidden", "");
        modal.style.display = "none";
        modal.classList.remove("active");
    }
}

function handleComplaintModalBackdropClick(event) {
    if (event.target.id === "fileComplaintModal") {
        closeComplaintModal();
    }
}

async function handleManualComplaintSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const catEl = document.getElementById("complaintCategorySelect");
    const probEl = document.getElementById("inputComplaintProblem");
    const addrEl = document.getElementById("inputComplaintAddress");
    const errEl = document.getElementById("complaintErrorMsg");
    const btnSubmit = document.getElementById("btnSubmitComplaint");

    const category = catEl ? catEl.value : "Municipal Civic Services";
    const problem = probEl ? probEl.value.trim() : "";
    const address = addrEl ? addrEl.value.trim() : "";

    if (!problem || problem.length < 5) {
        if (errEl) {
            errEl.textContent = "Please describe the problem in at least 5 characters.";
            errEl.classList.remove("hidden");
            errEl.style.display = "flex";
        }
        return;
    }

    try {
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<span>⏳ Registering Complaint...</span>`;
        }

        const res = await fetch("/v1/tickets", {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                category,
                problem,
                address: address || "Reported via SAHAYAK Web Portal",
                citizen_pin: getCitizenPin()
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Could not file complaint ticket.");
        }

        closeComplaintModal();
        if (probEl) probEl.value = "";
        if (addrEl) addrEl.value = "";

        showToast(`✅ Ticket ${data.id} registered with Municipal Authority!`, "success", 5000);
        await loadTickets();
        switchTab("tickets");
        jumpToTicket(data.id);
    } catch (e) {
        if (errEl) {
            errEl.textContent = `⚠ ${e.message}`;
            errEl.classList.remove("hidden");
            errEl.style.display = "flex";
        }
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>🎫 Submit &amp; Generate Ticket</span>`;
        }
    }
}

