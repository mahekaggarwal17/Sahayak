from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class BootstrapRequest(BaseModel):
    requester_rtc_uid: int | None = Field(default=None, ge=1, le=2_147_483_647)
    requester_rtm_user_id: str | None = Field(default=None, min_length=1, max_length=64)


class BootstrapResponse(BaseModel):
    app_id: str
    agent_rtc_uid: int
    channel_name: str
    rtc_token: str
    rtm_token: str
    requester_rtc_uid: int
    requester_rtm_user_id: str
    expires_at_unix: int


class JoinRequest(BaseModel):
    channel_name: str = Field(min_length=1, max_length=64)
    requester_rtc_uid: int = Field(ge=1, le=2_147_483_647)
    agent_profile: str | None = Field(default=None, max_length=256)
    system_prompt: str | None = Field(default=None, max_length=8_000)


class JoinResponse(BaseModel):
    agent_id: str
    created_at_unix: int
    status: str


class AgentActionRequest(BaseModel):
    agent_id: str = Field(min_length=1, max_length=128)
    channel_name: str = Field(min_length=1, max_length=64)


class ActionResponse(BaseModel):
    success: bool
    message: str


class RefreshRequest(BaseModel):
    channel_name: str = Field(min_length=1, max_length=64)
    requester_rtc_uid: int = Field(ge=1, le=2_147_483_647)
    requester_rtm_user_id: str = Field(min_length=1, max_length=64)


class RefreshResponse(BaseModel):
    rtc_token: str
    rtm_token: str
    expires_at_unix: int


class HealthResponse(BaseModel):
    status: str
    version: str
    agora_configured: bool
    active_sessions: int


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    context: dict[str, Any] | None = None


class TranscriptTurnSchema(BaseModel):
    speaker: str = "agent"
    text: str
    timestamp: str | None = None
    turn_id: int | None = None


class SaveRecordingRequest(BaseModel):
    channel_name: str
    duration_seconds: int = 0
    audio_base64: str = ""
    audio_format: str = "webm"
    transcripts: list[dict[str, Any]] = []
    metadata: dict[str, Any] = {}


class RecordingSummaryResponse(BaseModel):
    id: str
    channel_name: str
    created_at_iso: str
    created_at_formatted: str
    timestamp_unix: int
    duration_seconds: int
    audio_filename: str
    audio_url: str
    file_size_bytes: int
    category: str
    ticket_number: str | None = None
    summary: str
    turns_count: int
    agent_id: str | None = None
    caller_rtc_uid: str | None = None


class RecordingDetailResponse(RecordingSummaryResponse):
    transcripts: list[dict[str, Any]] = []


class RecordingsListResponse(BaseModel):
    total_count: int
    recordings: list[RecordingSummaryResponse]


# --- Citizen Auth & Profile Schemas ---

class CitizenLoginRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=15)
    name: str | None = Field(default=None, max_length=120)
    pin: str | None = Field(default=None, max_length=20)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=10)


class CitizenAuthResponse(BaseModel):
    token: str
    citizen_id: str
    phone: str
    name: str
    pin: str
    email: str | None = None
    picture: str | None = None
    message: str = "Authenticated successfully."


class CitizenProfileResponse(BaseModel):
    citizen_id: str
    phone: str
    name: str
    pin: str
    email: str | None = None
    picture: str | None = None


# --- Civic Ticket Schemas ---

class TicketCreateRequest(BaseModel):
    problem: str = Field(min_length=3, max_length=1000)
    category: str = Field(default="Municipal Civic Services", max_length=120)
    address: str = Field(default="Reported via Sahayak Voice Session", max_length=300)
    department: str | None = Field(default=None, max_length=200)
    ticket_id: str | None = Field(default=None, max_length=50)
    citizen_pin: str | None = Field(default=None, max_length=30)


class TicketResponse(BaseModel):
    id: str
    problem: str
    category: str
    category_icon: str = "📋"
    status: str = "In Progress"
    address: str
    department: str
    raised: str
    updated: str
    citizen_pin: str
    citizen_id: str | None = None
    timestamp_unix: int


class TicketsListResponse(BaseModel):
    total_count: int
    tickets: list[TicketResponse]

