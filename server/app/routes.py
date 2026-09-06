from __future__ import annotations

import random
import secrets
import time
from typing import Any

import base64
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse

from .agora_client import AgoraClient, AgoraTimeoutError, AgoraUpstreamError
from .auth import citizen_store, create_jwt_token, get_auth_secret_key, get_current_citizen, get_optional_citizen
from .config import Settings
from .recordings_store import RecordingsStore
from .schemas import (
    ActionResponse,
    AgentActionRequest,
    BootstrapRequest,
    BootstrapResponse,
    CitizenAuthResponse,
    CitizenLoginRequest,
    CitizenProfileResponse,
    GoogleLoginRequest,
    HealthResponse,
    JoinRequest,
    JoinResponse,
    RecordingDetailResponse,
    RecordingSummaryResponse,
    RecordingsListResponse,
    RefreshRequest,
    RefreshResponse,
    SaveRecordingRequest,
    TicketCreateRequest,
    TicketResponse,
    TicketsListResponse,
)
from .security import build_rate_limiter
from .session_store import SessionRecord, SessionStore
from .ticket_store import ticket_store


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

    # --- Citizen Authentication Endpoints ---

    @router.post(
        "/v1/auth/citizen-login",
        response_model=CitizenAuthResponse,
        dependencies=throttled,
    )
    async def citizen_login(body: CitizenLoginRequest) -> CitizenAuthResponse:
        citizen = citizen_store.authenticate_or_register(
            phone=body.phone,
            name=body.name,
            pin=body.pin,
        )
        token = create_jwt_token(
            payload={
                "sub": citizen["citizen_id"],
                "phone": citizen["phone"],
                "name": citizen["name"],
                "pin": citizen["pin"],
            },
            secret_key=get_auth_secret_key(),
        )
        return CitizenAuthResponse(
            token=token,
            citizen_id=citizen["citizen_id"],
            phone=citizen["phone"],
            name=citizen["name"],
            pin=citizen["pin"],
            email=citizen.get("email"),
            picture=citizen.get("picture"),
            message=f"Welcome back, {citizen['name']}!",
        )

    @router.get("/v1/auth/google-config")
    async def google_config() -> dict[str, str]:
        return {
            "client_id": settings.google_client_id or "962346377917-nk61oe72ckp9vi8edfulktcr1prfp10d.apps.googleusercontent.com"
        }

    @router.post(
        "/v1/auth/google",
        response_model=CitizenAuthResponse,
        dependencies=throttled,
    )
    async def google_login(body: GoogleLoginRequest) -> CitizenAuthResponse:
        credential = body.credential.strip()
        try:
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
                res = await http_client.get(verify_url)
                if res.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid Google credential or expired token.",
                    )
                token_data = res.json()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Google token verification failed: {exc}",
            )

        expected_client_id = settings.google_client_id
        if expected_client_id and token_data.get("aud") != expected_client_id:
            if expected_client_id not in str(token_data.get("aud", "")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Token audience does not match configured Google Client ID.",
                )

        email = token_data.get("email", "").strip().lower()
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google token did not contain an email address.",
            )

        name = token_data.get("name") or token_data.get("given_name") or email.split("@")[0]
        google_sub = str(token_data.get("sub", ""))
        picture = token_data.get("picture")

        citizen = citizen_store.authenticate_or_register_google(
            email=email,
            name=name,
            google_sub=google_sub,
            picture=picture,
        )

        token = create_jwt_token(
            payload={
                "sub": citizen["citizen_id"],
                "phone": citizen.get("phone") or citizen.get("email"),
                "email": citizen.get("email"),
                "name": citizen["name"],
                "pin": citizen["pin"],
            },
            secret_key=get_auth_secret_key(),
        )

        return CitizenAuthResponse(
            token=token,
            citizen_id=citizen["citizen_id"],
            phone=citizen["phone"],
            name=citizen["name"],
            pin=citizen["pin"],
            email=citizen.get("email"),
            picture=citizen.get("picture"),
            message=f"Welcome, {citizen['name']}!",
        )

    @router.get(
        "/v1/auth/me",
        response_model=CitizenProfileResponse,
    )
    async def citizen_me(
        citizen: dict[str, Any] = Depends(get_current_citizen),
    ) -> CitizenProfileResponse:
        return CitizenProfileResponse(
            citizen_id=citizen["citizen_id"],
            phone=citizen.get("phone", ""),
            name=citizen.get("name", ""),
            pin=citizen.get("pin", ""),
            email=citizen.get("email"),
            picture=citizen.get("picture"),
        )

    # --- Civic Tickets Endpoints ---

    @router.get(
        "/v1/tickets",
        response_model=TicketsListResponse,
    )
    async def list_tickets(
        category: str | None = None,
        pin: str | None = None,
        citizen: Optional[dict[str, Any]] = Depends(get_optional_citizen),
    ) -> TicketsListResponse:
        # If authenticated, filter by citizen PIN/ID; otherwise filter by pin query param if provided
        effective_pin = citizen["pin"] if citizen else (pin.strip() if pin else None)
        citizen_id = citizen["citizen_id"] if citizen else None
        tickets_data = ticket_store.list_tickets(citizen_pin=effective_pin, citizen_id=citizen_id, category=category)
        tickets = [TicketResponse(**t) for t in tickets_data]
        return TicketsListResponse(total_count=len(tickets), tickets=tickets)

    @router.post(
        "/v1/tickets",
        response_model=TicketResponse,
        status_code=status.HTTP_201_CREATED,
        dependencies=throttled,
    )
    async def create_ticket(
        body: TicketCreateRequest,
        citizen: Optional[dict[str, Any]] = Depends(get_optional_citizen),
    ) -> TicketResponse:
        pin = body.citizen_pin or (citizen["pin"] if citizen else "SAH-4821")
        c_id = citizen["citizen_id"] if citizen else None
        ticket = ticket_store.create_ticket(
            problem=body.problem,
            category=body.category,
            address=body.address,
            citizen_pin=pin,
            citizen_id=c_id,
            department=body.department,
            ticket_id=body.ticket_id,
        )
        return TicketResponse(**ticket)

    @router.get(
        "/v1/tickets/{ticket_id}",
        response_model=TicketResponse,
    )
    async def get_ticket(ticket_id: str) -> TicketResponse:
        ticket = ticket_store.get_ticket(ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found.")
        return TicketResponse(**ticket)

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
        citizen: Optional[dict[str, Any]] = Depends(get_optional_citizen),
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

        meta = dict(body.metadata or {})
        if citizen:
            if not meta.get("citizen_pin"):
                meta["citizen_pin"] = citizen["pin"]
            if not meta.get("citizen_id"):
                meta["citizen_id"] = citizen["citizen_id"]
        elif not meta.get("citizen_pin"):
            meta["citizen_pin"] = "SAH-4821"

        record = rec_store.save_recording(
            audio_bytes=audio_bytes,
            channel_name=body.channel_name,
            duration_seconds=body.duration_seconds,
            transcripts=body.transcripts,
            metadata=meta,
            file_extension=ext,
        )

        # Automatically create or sync ticket in ticket_store
        t_id = record.get("ticket_number")
        if t_id:
            ticket_store.create_ticket(
                problem=record.get("summary") or "Civic consultation recorded via SAHAYAK Voice AI",
                category=record.get("category") or "Municipal Civic Services",
                address="Reported via SAHAYAK Voice Call",
                citizen_pin=meta.get("citizen_pin", "SAH-4821"),
                citizen_id=meta.get("citizen_id"),
                ticket_id=t_id,
            )

        return RecordingDetailResponse(**record)

    @router.post(
        "/v1/recordings/{recording_id}/generate-ticket",
        response_model=TicketResponse,
        status_code=status.HTTP_200_OK,
    )
    async def generate_ticket_for_recording(
        recording_id: str,
        citizen: Optional[dict[str, Any]] = Depends(get_optional_citizen),
    ) -> TicketResponse:
        record = rec_store.get_recording(recording_id)
        if not record:
            raise HTTPException(status_code=404, detail="Recording not found.")

        c_pin = record.get("citizen_pin") or (citizen["pin"] if citizen else "SAH-4821")
        c_id = record.get("citizen_id") or (citizen["citizen_id"] if citizen else None)

        ticket_id = record.get("ticket_number")
        if not ticket_id:
            ticket_id = f"SHK-CIVIC-{random.randint(1000, 9999)}"
            rec_store.update_recording_ticket(recording_id, ticket_id)

        ticket = ticket_store.create_ticket(
            problem=record.get("summary") or "Civic consultation recorded via SAHAYAK Voice AI",
            category=record.get("category") or "Municipal Civic Services",
            address="Reported via SAHAYAK Voice Call",
            citizen_pin=c_pin,
            citizen_id=c_id,
            ticket_id=ticket_id,
        )
        return TicketResponse(**ticket)

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

    # Ensure all previously saved recordings have generated tickets in ticket_store
    try:
        for r in rec_store.list_recordings():
            t_num = r.get("ticket_number")
            if not t_num:
                t_num = f"SHK-CIVIC-{random.randint(1000, 9999)}"
                rec_store.update_recording_ticket(r["id"], t_num)
            if not ticket_store.get_ticket(t_num):
                ticket_store.create_ticket(
                    problem=r.get("summary") or "Civic consultation recorded via SAHAYAK Voice AI",
                    category=r.get("category") or "Civic Assistance",
                    address="Reported via SAHAYAK Voice Call",
                    citizen_pin=r.get("citizen_pin") or "SAH-4821",
                    citizen_id=r.get("citizen_id"),
                    ticket_id=t_num,
                )
    except Exception:
        pass

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
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Agora communication error: {exc}") from exc

