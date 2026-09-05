from __future__ import annotations

import random
import secrets
import time
from typing import Any

import base64
import json
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse

from .agora_client import AgoraClient, AgoraTimeoutError, AgoraUpstreamError
from .config import Settings
from .recordings_store import RecordingsStore
from .schemas import (
    ActionResponse,
    AgentActionRequest,
    BootstrapRequest,
    BootstrapResponse,
    HealthResponse,
    JoinRequest,
    JoinResponse,
    RecordingDetailResponse,
    RecordingSummaryResponse,
    RecordingsListResponse,
    RefreshRequest,
    RefreshResponse,
    SaveRecordingRequest,
)
from .security import build_rate_limiter
from .session_store import SessionRecord, SessionStore


def create_router(
    settings: Settings,
    store: SessionStore,
    agora: AgoraClient,
    recordings: RecordingsStore | None = None,
) -> APIRouter:
    router = APIRouter()
    rec_store = recordings or RecordingsStore()
    rate_limit = build_rate_limiter(settings)
    throttled = [Depends(rate_limit)]

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=settings.build_version,
            agora_configured=bool(settings.agora_app_id and settings.agora_app_certificate),
            active_sessions=await store.count(),
        )

    @router.post(
        "/v1/conversation/bootstrap",
        response_model=BootstrapResponse,
        dependencies=throttled,
    )
    async def bootstrap(body: BootstrapRequest) -> BootstrapResponse:
        rtc_uid = body.requester_rtc_uid or random.randint(100_000, 899_999)
        rtm_user_id = body.requester_rtm_user_id or str(rtc_uid)
        if rtm_user_id != str(rtc_uid):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="requester_rtm_user_id must match requester_rtc_uid for the combined RTC/RTM token.",
            )
        channel = f"android-convoai-{int(time.time())}-{secrets.randbelow(900000) + 100000}"
        rtc_token, rtm_token, expires_at = agora.create_user_tokens(channel, rtc_uid)
        await store.put(
            SessionRecord(
                channel_name=channel,
                requester_rtc_uid=rtc_uid,
                requester_rtm_user_id=rtm_user_id,
                token_expires_at_unix=expires_at,
                created_at_unix=int(time.time()),
            )
        )
        return BootstrapResponse(
            app_id=settings.agora_app_id,
            agent_rtc_uid=settings.agent_uid,
            channel_name=channel,
            rtc_token=rtc_token,
            rtm_token=rtm_token,
            requester_rtc_uid=rtc_uid,
            requester_rtm_user_id=rtm_user_id,
            expires_at_unix=expires_at,
        )

    @router.post(
        "/v1/conversation/join",
        response_model=JoinResponse,
        dependencies=throttled,
    )
    async def join(body: JoinRequest) -> JoinResponse:
        async with store.join_guard(body.channel_name):
            record = await require_session(store, body.channel_name)
            if record.requester_rtc_uid != body.requester_rtc_uid:
                raise HTTPException(status_code=400, detail="Requester RTC UID does not match bootstrap.")
            if record.agent_id:
                return JoinResponse(
                    agent_id=record.agent_id,
                    created_at_unix=record.created_at_unix,
                    status=record.agent_state,
                )
            result = await call_agora(
                agora.join_agent(
                    channel_name=body.channel_name,
                    requester_rtc_uid=body.requester_rtc_uid,
                    agent_profile=body.agent_profile,
                    system_prompt=body.system_prompt,
                )
            )
            agent_id = str(result.get("agent_id", "")).strip()
            if not agent_id:
                raise HTTPException(status_code=502, detail="Agora response did not include agent_id.")
            created_at = int(result.get("create_ts") or time.time())
            agent_state = str(result.get("status") or "started")
            await store.set_agent(body.channel_name, agent_id, agent_state)
            return JoinResponse(
                agent_id=agent_id,
                created_at_unix=created_at,
                status=agent_state,
            )

    @router.post(
        "/v1/conversation/interrupt",
        response_model=ActionResponse,
        dependencies=throttled,
    )
    async def interrupt(body: AgentActionRequest) -> ActionResponse:
        await require_agent(store, body)
        await call_agora(agora.interrupt_agent(body.agent_id, body.channel_name))
        return ActionResponse(success=True, message="Agent interrupted.")

    @router.post(
        "/v1/conversation/leave",
        response_model=ActionResponse,
        dependencies=throttled,
    )
    async def leave(body: AgentActionRequest) -> ActionResponse:
        await require_agent(store, body)
        await call_agora(agora.leave_agent(body.agent_id, body.channel_name))
        await store.remove(body.channel_name)
        return ActionResponse(success=True, message="Agent left the channel.")

    @router.post(
        "/v1/conversation/refresh",
        response_model=RefreshResponse,
        dependencies=throttled,
    )
    async def refresh(body: RefreshRequest) -> RefreshResponse:
        record = await require_session(store, body.channel_name)
        if (
            record.requester_rtc_uid != body.requester_rtc_uid
            or record.requester_rtm_user_id != body.requester_rtm_user_id
        ):
            raise HTTPException(status_code=400, detail="Refresh identity does not match bootstrap.")
        rtc_token, rtm_token, expires_at = agora.create_user_tokens(
            body.channel_name,
            body.requester_rtc_uid,
        )
        record.token_expires_at_unix = expires_at
        await store.put(record)
        return RefreshResponse(
            rtc_token=rtc_token,
            rtm_token=rtm_token,
            expires_at_unix=expires_at,
        )

    # --- Recorded Calls Storage Endpoints ---

    @router.post(
        "/v1/recordings",
        response_model=RecordingDetailResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def upload_recording(
        body: SaveRecordingRequest,
    ) -> RecordingDetailResponse:
        audio_bytes = b""
        if body.audio_base64:
            try:
                # Strip data URL prefix if present (e.g. data:audio/webm;base64,...)
                raw_b64 = body.audio_base64
                if "," in raw_b64:
                    raw_b64 = raw_b64.split(",", 1)[1]
                audio_bytes = base64.b64decode(raw_b64)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64 audio data: {e}")

        # If audio_bytes is empty, provide a minimal silent placeholder or allow empty
        ext = (body.audio_format or "webm").lower().lstrip(".")

        record = rec_store.save_recording(
            audio_bytes=audio_bytes,
            channel_name=body.channel_name,
            duration_seconds=body.duration_seconds,
            transcripts=body.transcripts,
            metadata=body.metadata,
            file_extension=ext,
        )
        return RecordingDetailResponse(**record)

    @router.get(
        "/v1/recordings",
        response_model=RecordingsListResponse,
    )
    async def list_recordings(
        category: str | None = None,
        query: str | None = None,
    ) -> RecordingsListResponse:
        records = rec_store.list_recordings(category=category, query=query)
        summaries = [RecordingSummaryResponse(**r) for r in records]
        return RecordingsListResponse(
            total_count=len(summaries),
            recordings=summaries,
        )

    @router.get(
        "/v1/recordings/{recording_id}",
        response_model=RecordingDetailResponse,
    )
    async def get_recording(recording_id: str) -> RecordingDetailResponse:
        record = rec_store.get_recording(recording_id)
        if not record:
            raise HTTPException(status_code=404, detail="Recording not found.")
        return RecordingDetailResponse(**record)

    @router.get(
        "/v1/recordings/{recording_id}/audio",
    )
    async def get_recording_audio(recording_id: str):
        path = rec_store.get_audio_path(recording_id)
        if not path or not path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found for recording.")

        ext = path.suffix.lower()
        media_type_map = {
            ".webm": "audio/webm",
            ".wav": "audio/wav",
            ".aac": "audio/aac",
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".ogg": "audio/ogg",
        }
        media_type = media_type_map.get(ext, "application/octet-stream")
        return FileResponse(path=path, media_type=media_type, filename=path.name)

    @router.delete(
        "/v1/recordings/{recording_id}",
        response_model=ActionResponse,
    )
    async def delete_recording(recording_id: str) -> ActionResponse:
        deleted = rec_store.delete_recording(recording_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Recording not found.")
        return ActionResponse(success=True, message="Recording deleted successfully.")

    return router


async def require_session(store: SessionStore, channel_name: str) -> SessionRecord:
    record = await store.get(channel_name)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation session was not found or expired.")
    return record


async def require_agent(store: SessionStore, body: AgentActionRequest) -> SessionRecord:
    record = await require_session(store, body.channel_name)
    if record.agent_id != body.agent_id:
        raise HTTPException(status_code=400, detail="Agent ID does not match the conversation session.")
    return record


async def call_agora(awaitable: Any) -> Any:
    try:
        return await awaitable
    except AgoraTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except AgoraUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
