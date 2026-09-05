package com.androidengineers.agent_quickstart_android.ui

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Brush
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicOff
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.util.Locale
import com.androidengineers.agent_quickstart_android.audio.TurnState
import com.androidengineers.agent_quickstart_android.model.AgentVisualState
import com.androidengineers.agent_quickstart_android.model.ConversationUiState
import com.androidengineers.agent_quickstart_android.model.SessionIssue
import com.androidengineers.agent_quickstart_android.model.TranscriptSpeaker
import com.androidengineers.agent_quickstart_android.model.TranscriptTurn
import com.androidengineers.agent_quickstart_android.model.TranscriptTurnStatus
import com.androidengineers.agent_quickstart_android.ui.components.AgentAvatarBadge
import com.androidengineers.agent_quickstart_android.ui.components.AgentButton
import com.androidengineers.agent_quickstart_android.ui.components.AgentButtonVariant
import com.androidengineers.agent_quickstart_android.ui.components.AgentCard
import com.androidengineers.agent_quickstart_android.ui.components.AgentIconControlButton
import com.androidengineers.agent_quickstart_android.ui.components.InfoField
import com.androidengineers.agent_quickstart_android.ui.components.LabeledIconText
import com.androidengineers.agent_quickstart_android.ui.components.StatusChip
import com.androidengineers.agent_quickstart_android.ui.theme.AgentquickstartandroidTheme

private object VoiceAiLayout {
    val ScreenPadding = 20.dp
    val SectionSpacing = 18.dp
    val CardSpacing = 16.dp
    val ContentMaxWidth = 980.dp
    val BottomBarHeight = 112.dp
    val TranscriptMinHeight = 280.dp
    val TranscriptMaxHeight = 460.dp
}

private data class StatusChipModel(
    val label: String,
    val highlighted: Boolean,
    val accent: Color,
)

private data class InfoItemModel(
    val label: String,
    val value: String,
)

@Composable
fun ConversationScreen(
    uiState: ConversationUiState,
    onStartRequested: () -> Unit,
    onEndConversation: () -> Unit,
    onToggleMicrophone: () -> Unit,
    onToggleTheme: () -> Unit,
    onDismissMessages: () -> Unit,
) {
    VoiceAiAppScreen(
        uiState = uiState,
        onStartRequested = onStartRequested,
        onEndConversation = onEndConversation,
        onToggleMicrophone = onToggleMicrophone,
        onToggleTheme = onToggleTheme,
        onDismissMessages = onDismissMessages,
    )
}

@Composable
fun VoiceAiAppScreen(
    uiState: ConversationUiState,
    onStartRequested: () -> Unit,
    onEndConversation: () -> Unit,
    onToggleMicrophone: () -> Unit,
    onToggleTheme: () -> Unit,
    onDismissMessages: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            VoiceAiTopBar(
                isDarkTheme = uiState.isDarkTheme,
                onToggleTheme = onToggleTheme,
            )
        },
        bottomBar = {
            if (uiState.inConversation) {
                BottomCallControls(
                    micEnabled = uiState.micRequestedEnabled,
                    isStopping = uiState.isStopping,
                    onToggleMicrophone = onToggleMicrophone,
                    onEndConversation = onEndConversation,
                )
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .consumeWindowInsets(innerPadding),
            ) {
                val bottomPadding = if (uiState.inConversation) {
                    VoiceAiLayout.BottomBarHeight
                } else {
                    24.dp
                }

                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = VoiceAiLayout.ScreenPadding)
                        .widthIn(max = VoiceAiLayout.ContentMaxWidth)
                        .align(Alignment.TopCenter),
                    color = Color.Transparent,
                ) {
                    if (uiState.inConversation) {
                        ConnectedSessionScreen(
                            uiState = uiState,
                            bottomPadding = bottomPadding,
                            onDismissMessages = onDismissMessages,
                        )
                    } else {
                        PreSessionScreen(
                            uiState = uiState,
                            onStartRequested = onStartRequested,
                            onDismissMessages = onDismissMessages,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CivicEclipseOrb(
    modifier: Modifier = Modifier,
    isSpeaking: Boolean = false,
    isListening: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "OrbPulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = if (isSpeaking) 0.94f else 0.98f,
        targetValue = if (isSpeaking) 1.08f else 1.02f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (isSpeaking) 600 else 2200),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "PulseScale",
    )
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = if (isSpeaking) 0.55f else 0.25f,
        targetValue = if (isSpeaking) 0.95f else 0.45f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (isSpeaking) 600 else 2200),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "GlowAlpha",
    )

    Box(
        modifier = modifier
            .size(170.dp)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        // Outer glowing ambient aura
        Box(
            modifier = Modifier
                .size(160.dp * pulseScale)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFFFF7A3D).copy(alpha = glowAlpha),
                            Color(0xFFFF5E22).copy(alpha = glowAlpha * 0.45f),
                            Color.Transparent,
                        ),
                    ),
                ),
        )

        // Main dark obsidian sphere with luminous metallic border
        Box(
            modifier = Modifier
                .size(118.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF231F2E),
                            Color(0xFF0A090F),
                        ),
                    ),
                )
                .border(
                    width = 2.dp,
                    brush = Brush.linearGradient(
                        colors = listOf(
                            Color(0xFFFF7A3D).copy(alpha = 0.85f),
                            Color(0x33FF5E22),
                            Color(0xFFFFB84D).copy(alpha = 0.85f),
                        ),
                    ),
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            // Overlapping luminous crescent rings (inspiration insignia)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .border(3.5.dp, Color(0xFFFFB84D), CircleShape)
                        .background(Color(0x28FFB84D)),
                )
                Spacer(modifier = Modifier.size(0.dp))
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .border(3.5.dp, Color(0xFFFF5E22), CircleShape)
                        .background(Color(0x28FF5E22)),
                )
            }
        }
    }
}

@Composable
fun CivicUtilityTagsCluster(
    modifier: Modifier = Modifier,
) {
    val civicTags = listOf(
        "🗑️ Waste & Sanitation",
        "💧 Water Works",
        "💡 Street Lights",
        "🕳️ Roads & Potholes",
        "📋 Ticket Status",
        "⚠️ Emergency 112",
    )

    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        civicTags.forEach { tag ->
            Surface(
                modifier = Modifier.padding(horizontal = 4.dp),
                shape = CircleShape,
                color = Color(0x18FFFFFF),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x33FF5E22)),
            ) {
                Text(
                    text = tag,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFFF1F5F9),
                )
            }
        }
    }
}

@Composable
private fun VoiceAiTopBar(
    isDarkTheme: Boolean,
    onToggleTheme: () -> Unit,
) {
    Surface(
        modifier = Modifier.statusBarsPadding(),
        color = MaterialTheme.colorScheme.background.copy(alpha = 0.96f),
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VoiceAiLayout.ScreenPadding, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Insignia
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .border(2.dp, Color(0xFFFF7A3D), CircleShape)
                        .background(Color(0x33FF5E22)),
                )
                Text(
                    text = "SAHAYAK.",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
                Surface(
                    shape = CircleShape,
                    color = Color(0x22FF5E22),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x44FF5E22)),
                ) {
                    Text(
                        text = "सहायक",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFFF7A3D),
                    )
                }
            }

            AgentIconControlButton(
                icon = if (isDarkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                contentDescription = if (isDarkTheme) "Switch to light theme" else "Switch to dark theme",
                active = isDarkTheme,
                onClick = onToggleTheme,
            )
        }
    }
}

@Composable
private fun PreSessionScreen(
    uiState: ConversationUiState,
    onStartRequested: () -> Unit,
    onDismissMessages: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 16.dp, bottom = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            // Version Pill Badge
            Surface(
                shape = CircleShape,
                color = Color(0x22FF5E22),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x55FF5E22)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFFF7A3D)),
                    )
                    Text(
                        text = "Agora AI • Civic Voice v2.0",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFB84D),
                    )
                }
            }
        }

        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Meet! SAHAYAK",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "Public Voice AI for Civic Utilities.",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFFF7A3D),
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "Empowering citizens with natural voice guidance for water supply, streetlights, garbage, potholes, and civic emergencies.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }

        item {
            // Central Eclipse Voice Orb Stage
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                CivicEclipseOrb(
                    isSpeaking = false,
                    onClick = onStartRequested,
                )
                CivicUtilityTagsCluster()
            }
        }

        item {
            AgentButton(
                text = if (uiState.isStarting) "Starting voice session..." else "Start Voice Session",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                enabled = uiState.isConfigured && !uiState.isStarting,
                onClick = onStartRequested,
            )
        }

        transientMessages(
            errorMessage = uiState.errorMessage,
            warningMessage = uiState.warningMessage,
            onDismissMessages = onDismissMessages,
        )

        item {
            SessionSetupCard(
                uiState = uiState,
                onStartRequested = onStartRequested,
            )
        }
    }
}

@Composable
private fun SessionSetupCard(
    uiState: ConversationUiState,
    onStartRequested: () -> Unit,
) {
    AgentCard(
        title = "Ready to start",
        subtitle = "Everything needed for the demo is condensed into one card so the page stays focused.",
    ) {
        LabeledIconText(
            icon = Icons.Outlined.Link,
            label = "Backend-managed session",
            value = "The Python server owns Agora credentials, token generation, and agent lifecycle calls. Android receives only short-lived session tokens.",
        )

        LabeledIconText(
            icon = Icons.Outlined.Link,
            label = "Default Agora-managed engine",
            value = "Uses Agora-managed Deepgram ASR, OpenAI LLM, and MiniMax TTS for the voice agent.",
        )

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            preSessionStatusChips(uiState).forEach { chip ->
                StatusChip(
                    text = chip.label,
                    highlighted = chip.highlighted,
                    accentColor = chip.accent,
                )
            }
        }

        ResponsiveInfoGrid(
            items = listOf(
                InfoItemModel(
                    label = "Conversation engine",
                    value = "Default Agora",
                ),
                InfoItemModel(
                    label = "Configuration",
                    value = if (uiState.isConfigured) "Server configured" else "Server URL needed",
                ),
                InfoItemModel(
                    label = "Microphone",
                    value = if (uiState.microphonePermissionGranted) {
                        "Permission granted"
                    } else {
                        "Permission required"
                    },
                ),
            ),
        )

        if (!uiState.isConfigured && uiState.configMessage != null) {
            InlineNoticeCard(
                title = "Configuration needed",
                message = uiState.configMessage,
                accentColor = MaterialTheme.colorScheme.error,
                icon = Icons.Outlined.ErrorOutline,
            )
        }

        AgentButton(
            text = if (uiState.isStarting) "Starting voice session..." else "Start voice session",
            modifier = Modifier.fillMaxWidth(),
            enabled = uiState.isConfigured && !uiState.isStarting,
            onClick = onStartRequested,
        )
    }
}

@Composable
fun ConnectedSessionScreen(
    uiState: ConversationUiState,
    bottomPadding: Dp,
    onDismissMessages: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 24.dp, bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(VoiceAiLayout.SectionSpacing),
    ) {
        transientMessages(
            errorMessage = uiState.errorMessage,
            warningMessage = uiState.warningMessage,
            onDismissMessages = onDismissMessages,
        )

        item {
            AgentPresenceCard(
                visualState = uiState.agentVisualState,
                label = uiState.agentStateLabel,
                turnState = uiState.turnState,
                isSpeaking = uiState.isAgentSpeaking,
            )
        }

        item {
            LiveCaptionsCard(
                captionText = uiState.liveAgentCaption,
                isAgentSpeaking = uiState.isAgentSpeaking,
                agentState = uiState.agentVisualState,
            )
        }

        item {
            TranscriptPanel(
                history = uiState.transcriptHistory,
                liveTranscript = uiState.liveTranscript,
            )
        }

        if (uiState.issues.isNotEmpty()) {
            item {
                IssuesPanel(issues = uiState.issues)
            }
        }

        item {
            LiveSessionCard(uiState = uiState)
        }
    }
}

@Composable
private fun HeroIntroCard(
    title: String,
    subtitle: String,
) {
    AgentCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LiveSessionCard(
    modifier: Modifier = Modifier,
    uiState: ConversationUiState,
) {
    AgentCard(
        modifier = modifier,
        title = "Live call snapshot",
        subtitle = "A compact view of the channel, transport health, and microphone state.",
    ) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            connectedStatusChips(uiState).forEach { item ->
                StatusChip(
                    text = item.label,
                    highlighted = item.highlighted,
                    accentColor = item.accent,
                )
            }
        }

        ResponsiveInfoGrid(
            items = connectedInfoItems(uiState),
        )
    }
}

@Composable
private fun ResponsiveInfoGrid(
    items: List<InfoItemModel>,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        if (maxWidth >= 640.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items.chunked(2).forEach { rowItems ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        rowItems.forEach { item ->
                            InfoField(
                                label = item.label,
                                value = item.value,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (rowItems.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items.forEach { item ->
                    InfoField(
                        label = item.label,
                        value = item.value,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

@Composable
private fun AgentPresenceCard(
    modifier: Modifier = Modifier,
    visualState: AgentVisualState,
    label: String,
    turnState: TurnState,
    isSpeaking: Boolean = false,
) {
    AgentCard(
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CivicEclipseOrb(
                isSpeaking = isSpeaking,
                isListening = turnState == TurnState.USER_SPEAKING,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            StatusChip(
                text = turnState.toReadableLabel(),
                highlighted = true,
                accentColor = if (isSpeaking) Color(0xFFFF7A3D) else visualState.accentColor(),
            )
        }
    }
}

@Composable
fun LiveCaptionsCard(
    modifier: Modifier = Modifier,
    captionText: String?,
    isAgentSpeaking: Boolean,
    agentState: AgentVisualState,
) {
    val borderColor = if (isAgentSpeaking) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
    }

    val displayedText = captionText?.takeIf { it.isNotBlank() }
        ?: if (isAgentSpeaking) "SAHAYAK is speaking..." else "Waiting for speech..."

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.85f),
        ),
        border = androidx.compose.foundation.BorderStroke(
            width = if (isAgentSpeaking) 1.5.dp else 1.dp,
            color = borderColor,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.primary,
                    ) {
                        Text(
                            text = "CC",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                    Text(
                        text = "LIVE CAPTIONS",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                StatusChip(
                    text = if (isAgentSpeaking) "Speaking" else "Standby",
                    highlighted = isAgentSpeaking,
                    accentColor = if (isAgentSpeaking) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                )
            }

            Text(
                text = displayedText,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isAgentSpeaking) FontWeight.Medium else FontWeight.Normal,
                color = if (isAgentSpeaking) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun TranscriptPanel(
    modifier: Modifier = Modifier,
    history: List<TranscriptTurn>,
    liveTranscript: TranscriptTurn?,
) {
    val listState = rememberLazyListState()
    val visibleTurns = buildList {
        addAll(history)
        if (liveTranscript != null) {
            add(liveTranscript)
        }
    }

    LaunchedEffect(visibleTurns.size, liveTranscript?.text) {
        if (visibleTurns.isNotEmpty()) {
            listState.animateScrollToItem(visibleTurns.lastIndex)
        }
    }

    AgentCard(
        modifier = modifier,
        title = "Transcript",
        subtitle = "Realtime user and agent turns for debugging, screenshots, and README demos.",
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.7f),
            ),
        ) {
            if (visibleTurns.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(VoiceAiLayout.TranscriptMinHeight)
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        AgentAvatarBadge(
                            name = "AI",
                            modifier = Modifier.size(64.dp),
                        )
                        Text(
                            text = "Transcript appears here once the session is live.",
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = "The panel keeps both completed turns and the currently streaming line.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(
                            min = VoiceAiLayout.TranscriptMinHeight,
                            max = VoiceAiLayout.TranscriptMaxHeight,
                        )
                        .padding(horizontal = 14.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    state = listState,
                ) {
                    items(items = visibleTurns, key = { it.key }) { turn ->
                        TranscriptBubble(turn = turn)
                    }
                }
            }
        }
    }
}

@Composable
private fun TranscriptBubble(
    turn: TranscriptTurn,
) {
    val isUser = turn.speaker == TranscriptSpeaker.USER
    val containerColor = when {
        isUser -> MaterialTheme.colorScheme.primaryContainer
        turn.status == TranscriptTurnStatus.INTERRUPTED -> MaterialTheme.colorScheme.tertiaryContainer
        else -> MaterialTheme.colorScheme.surface
    }
    val contentColor = when {
        isUser -> MaterialTheme.colorScheme.onPrimaryContainer
        turn.status == TranscriptTurnStatus.INTERRUPTED -> MaterialTheme.colorScheme.onTertiaryContainer
        else -> MaterialTheme.colorScheme.onSurface
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(22.dp),
            color = containerColor,
            tonalElevation = 1.dp,
            shadowElevation = 0.dp,
            modifier = Modifier.widthIn(max = 360.dp),
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = if (isUser) "You" else "Agent",
                    style = MaterialTheme.typography.labelMedium,
                    color = contentColor.copy(alpha = 0.76f),
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = turn.text.ifBlank { "..." },
                    style = MaterialTheme.typography.bodyLarge,
                    color = contentColor,
                )
                if (turn.status != TranscriptTurnStatus.END) {
                    StatusChip(
                        text = if (turn.status == TranscriptTurnStatus.IN_PROGRESS) {
                            "Streaming"
                        } else {
                            "Interrupted"
                        },
                        highlighted = true,
                        accentColor = if (turn.status == TranscriptTurnStatus.IN_PROGRESS) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.tertiary
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun IssuesPanel(
    issues: List<SessionIssue>,
) {
    AgentCard(
        title = "Session diagnostics",
        subtitle = "Recent warnings and runtime signals surfaced by the realtime layer.",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            issues.take(4).forEachIndexed { index, issue ->
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AgentAvatarBadge(
                            name = issue.source.uppercase(Locale.ROOT),
                            modifier = Modifier.size(42.dp),
                            highlightColor = MaterialTheme.colorScheme.error,
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = issue.source.uppercase(Locale.ROOT),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = issue.code,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Text(
                        text = issue.message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (index != issues.take(4).lastIndex) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                    }
                }
            }
        }
    }
}

@Composable
fun BottomCallControls(
    micEnabled: Boolean,
    isStopping: Boolean,
    onToggleMicrophone: () -> Unit,
    onEndConversation: () -> Unit,
) {
    Surface(
        modifier = Modifier.navigationBarsPadding(),
        tonalElevation = 6.dp,
        shadowElevation = 12.dp,
        color = MaterialTheme.colorScheme.background.copy(alpha = 0.96f),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = VoiceAiLayout.ScreenPadding, vertical = 16.dp)
                .heightIn(min = 72.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
        ) {
            AgentIconControlButton(
                icon = if (micEnabled) Icons.Outlined.Mic else Icons.Outlined.MicOff,
                contentDescription = if (micEnabled) "Mute microphone" else "Unmute microphone",
                active = micEnabled,
                onClick = onToggleMicrophone,
            )
            AgentButton(
                text = if (micEnabled) "Mute mic" else "Unmute mic",
                modifier = Modifier.weight(1f),
                variant = AgentButtonVariant.Secondary,
                onClick = onToggleMicrophone,
            )
            AgentButton(
                text = if (isStopping) "Ending..." else "End session",
                modifier = Modifier.weight(1f),
                variant = AgentButtonVariant.Destructive,
                enabled = !isStopping,
                onClick = onEndConversation,
            )
        }
    }
}

@Composable
private fun InlineNoticeCard(
    title: String,
    message: String,
    accentColor: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = accentColor.copy(alpha = 0.1f),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = accentColor,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.transientMessages(
    errorMessage: String?,
    warningMessage: String?,
    onDismissMessages: () -> Unit,
) {
    if (errorMessage != null) {
        item {
            DismissibleMessageCard(
                title = "Action needed",
                message = errorMessage,
                accentColor = MaterialTheme.colorScheme.error,
                icon = Icons.Outlined.ErrorOutline,
                onDismiss = onDismissMessages,
            )
        }
    }

    if (warningMessage != null) {
        item {
            DismissibleMessageCard(
                title = "Heads up",
                message = warningMessage,
                accentColor = MaterialTheme.colorScheme.tertiary,
                icon = Icons.Outlined.WarningAmber,
                onDismiss = onDismissMessages,
            )
        }
    }
}

@Composable
private fun DismissibleMessageCard(
    title: String,
    message: String,
    accentColor: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onDismiss: () -> Unit,
) {
    AgentCard {
        InlineNoticeCard(
            title = title,
            message = message,
            accentColor = accentColor,
            icon = icon,
        )
        AgentButton(
            text = "Dismiss",
            modifier = Modifier.fillMaxWidth(),
            variant = AgentButtonVariant.Secondary,
            onClick = onDismiss,
        )
    }
}

@Composable
private fun preSessionStatusChips(uiState: ConversationUiState): List<StatusChipModel> {
    return listOf(
        StatusChipModel(
            label = if (uiState.isConfigured) "Backend ready" else "Server config needed",
            highlighted = uiState.isConfigured,
            accent = MaterialTheme.colorScheme.primary,
        ),
        StatusChipModel(
            label = if (uiState.microphonePermissionGranted) "Microphone ready" else "Microphone permission needed",
            highlighted = uiState.microphonePermissionGranted,
            accent = MaterialTheme.colorScheme.secondary,
        ),
        StatusChipModel(
            label = "RTC idle",
            highlighted = false,
            accent = MaterialTheme.colorScheme.tertiary,
        ),
        StatusChipModel(
            label = "Agent waiting",
            highlighted = false,
            accent = MaterialTheme.colorScheme.primary,
        ),
    )
}

@Composable
private fun connectedStatusChips(uiState: ConversationUiState): List<StatusChipModel> {
    val agentJoined = uiState.agentVisualState != AgentVisualState.WAITING &&
        uiState.agentVisualState != AgentVisualState.DISCONNECTED

    return listOf(
        StatusChipModel(
            label = "Backend active",
            highlighted = true,
            accent = MaterialTheme.colorScheme.primary,
        ),
        StatusChipModel(
            label = if (uiState.micRequestedEnabled) "Microphone ready" else "Microphone muted",
            highlighted = uiState.micRequestedEnabled,
            accent = MaterialTheme.colorScheme.secondary,
        ),
        StatusChipModel(
            label = uiState.rtcConnectionLabel,
            highlighted = uiState.rtcConnectionLabel.contains("connected", ignoreCase = true),
            accent = MaterialTheme.colorScheme.primary,
        ),
        StatusChipModel(
            label = if (agentJoined) "Agent joined" else "Waiting for agent",
            highlighted = agentJoined,
            accent = uiState.agentVisualState.accentColor(),
        ),
    )
}

private fun connectedInfoItems(uiState: ConversationUiState): List<InfoItemModel> {
    return listOf(
        InfoItemModel("Channel", uiState.channelName ?: "Joining..."),
        InfoItemModel("Local UID", uiState.localUid ?: "Pending"),
        InfoItemModel("RTM status", uiState.rtmConnectionLabel),
        InfoItemModel("Backend latency", uiState.backendLatencyMs?.let { "$it ms" } ?: "Pending"),
        InfoItemModel("Last server response", uiState.lastServerResponse ?: "Pending"),
    )
}

@Composable
private fun AgentVisualState.accentColor(): Color {
    return when (this) {
        AgentVisualState.WAITING -> MaterialTheme.colorScheme.outline
        AgentVisualState.LISTENING -> MaterialTheme.colorScheme.secondary
        AgentVisualState.THINKING -> MaterialTheme.colorScheme.tertiary
        AgentVisualState.SPEAKING -> MaterialTheme.colorScheme.primary
        AgentVisualState.IDLE -> MaterialTheme.colorScheme.primary
        AgentVisualState.DISCONNECTED -> MaterialTheme.colorScheme.error
    }
}

private fun TurnState.toReadableLabel(): String {
    return when (this) {
        TurnState.IDLE -> "Standing by"
        TurnState.USER_SPEAKING -> "User speaking"
        TurnState.USER_TURN_FINALIZING -> "Finalizing user turn"
        TurnState.AGENT_THINKING -> "Agent thinking"
        TurnState.AGENT_SPEAKING -> "Agent speaking"
        TurnState.BARGE_IN_DETECTED -> "Barge-in detected"
    }
}

@Preview(
    name = "Pre-session light",
    showBackground = true,
    widthDp = 420,
    heightDp = 900,
)
@Composable
private fun PreSessionPreview() {
    AgentquickstartandroidTheme {
        ConversationScreen(
            uiState = previewPreSessionState(),
            onStartRequested = {},
            onEndConversation = {},
            onToggleMicrophone = {},
            onToggleTheme = {},
            onDismissMessages = {},
        )
    }
}

@Preview(
    name = "Connected dark",
    showBackground = true,
    widthDp = 420,
    heightDp = 900,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun ConnectedSessionPreview() {
    AgentquickstartandroidTheme(darkTheme = true) {
        ConversationScreen(
            uiState = previewConnectedState(),
            onStartRequested = {},
            onEndConversation = {},
            onToggleMicrophone = {},
            onToggleTheme = {},
            onDismissMessages = {},
        )
    }
}

private fun previewPreSessionState(): ConversationUiState {
    return ConversationUiState(
        isConfigured = true,
        microphonePermissionGranted = true,
        configMessage = null,
        warningMessage = null,
        errorMessage = null,
    )
}

private fun previewConnectedState(): ConversationUiState {
    return ConversationUiState(
        isConfigured = true,
        microphonePermissionGranted = true,
        inConversation = true,
        channelName = "demo-voice-room",
        localUid = "1045",
        rtcConnectionLabel = "RTC connected",
        rtmConnectionLabel = "Connected",
        agentVisualState = AgentVisualState.SPEAKING,
        agentStateLabel = "Speaking back in real time",
        turnState = TurnState.AGENT_SPEAKING,
        micEnabled = true,
        micRequestedEnabled = true,
        transcriptHistory = listOf(
            TranscriptTurn(
                key = "1",
                turnId = 1L,
                streamId = 1L,
                speaker = TranscriptSpeaker.AGENT,
                text = "Hi there. I am ready to help with your Android voice AI testing.",
                status = TranscriptTurnStatus.END,
                createdAtMillis = 0L,
            ),
            TranscriptTurn(
                key = "2",
                turnId = 2L,
                streamId = 1L,
                speaker = TranscriptSpeaker.USER,
                text = "Can you summarize the current session state?",
                status = TranscriptTurnStatus.END,
                createdAtMillis = 1L,
            ),
        ),
        liveTranscript = TranscriptTurn(
            key = "3",
            turnId = 3L,
            streamId = 2L,
            speaker = TranscriptSpeaker.AGENT,
            text = "Agora REST is active, the microphone is ready, and the agent is currently speaking.",
            status = TranscriptTurnStatus.IN_PROGRESS,
            createdAtMillis = 2L,
        ),
        issues = listOf(
            SessionIssue(
                id = "issue-1",
                source = "rtc",
                code = "TOKEN_RENEWAL",
                message = "Token renewal path is active and healthy.",
                timestampMillis = 0L,
            ),
        ),
    )
}
