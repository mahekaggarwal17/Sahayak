from __future__ import annotations

import secrets
import time
from typing import Any

import httpx
from agora_agent.agentkit.token import generate_convo_ai_token

from .config import Settings


DEFAULT_SYSTEM_PROMPT = """You are Ada, an agentic developer advocate from Agora. Help developers understand and build with Agora Conversational AI. Be concise and technically precise. If you do not know an Agora-specific fact, say so and suggest checking docs.agora.io."""


class AgoraUpstreamError(RuntimeError):
    pass


class AgoraTimeoutError(TimeoutError):
    pass


class AgoraClient:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._http = http_client or httpx.AsyncClient(timeout=httpx.Timeout(15.0))
        self._owns_http = http_client is None

    def create_user_tokens(self, channel_name: str, rtc_uid: int) -> tuple[str, str, int]:
        token = generate_convo_ai_token(
            app_id=self.settings.agora_app_id,
            app_certificate=self.settings.agora_app_certificate,
            channel_name=channel_name,
            uid=rtc_uid,
            token_expire=self.settings.token_expiry_seconds,
        )
        expires_at = int(time.time()) + self.settings.token_expiry_seconds
        return token, token, expires_at

    def create_agent_token(self, channel_name: str) -> str:
        return generate_convo_ai_token(
            app_id=self.settings.agora_app_id,
            app_certificate=self.settings.agora_app_certificate,
            channel_name=channel_name,
            uid=self.settings.agent_uid,
            token_expire=self.settings.token_expiry_seconds,
        )

    async def join_agent(
        self,
        channel_name: str,
        requester_rtc_uid: int,
        agent_profile: str | None = None,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        agent_token = self.create_agent_token(channel_name)
        payload = {
            "name": f"android-server-agent-{int(time.time())}-{secrets.randbelow(9000) + 1000}",
            "preset": agent_profile or self.settings.default_preset,
            "properties": {
                "channel": channel_name,
                "token": agent_token,
                "agent_rtc_uid": str(self.settings.agent_uid),
                "remote_rtc_uids": [str(requester_rtc_uid)],
                "enable_string_uid": False,
                "idle_timeout": 30,
                "geofence": {"area": self.settings.agora_area},
                "advanced_features": {"enable_rtm": True},
                "asr": {
                    "vendor": "deepgram",
                    "params": {"language": "en", "model": self.settings.asr_model},
                },
                "llm": {
                    "system_messages": [
                        {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}
                    ],
                    "model": self.settings.llm_model,
                    "max_history": 15,
                    "greeting_message": "Hi there!",
                    "failure_message": "Please wait a moment.",
                    "params": {"max_tokens": 1024, "temperature": 0.7, "top_p": 0.95},
                },
                "tts": {
                    "vendor": "minimax",
                    "params": {
                        "model": self.settings.tts_model,
                        "voice_setting": {"voice_id": self.settings.tts_voice_id},
                    },
                },
                "turn_detection": {
                    "mode": "default",
                    "config": {
                        "speech_threshold": 0.38,
                        "start_of_speech": {
                            "mode": "vad",
                            "vad_config": {
                                "interrupt_duration_ms": 160,
                                "speaking_interrupt_duration_ms": 160,
                                "prefix_padding_ms": 480,
                            },
                        },
                        "end_of_speech": {
                            "mode": "vad",
                            "vad_config": {"silence_duration_ms": 720},
                        },
                    },
                },
                "interruption": {"enable": True, "mode": "start_of_speech"},
                "parameters": {
                    "audio_scenario": "chorus",
                    "data_channel": "rtm",
                    "enable_error_message": True,
                    "enable_metrics": True,
                },
            },
        }
        return await self._request("POST", "join", channel_name, json=payload)

    async def interrupt_agent(self, agent_id: str, channel_name: str) -> None:
        await self._request(
            "POST",
            f"agents/{agent_id}/interrupt",
            channel_name,
            json={},
        )

    async def leave_agent(self, agent_id: str, channel_name: str) -> None:
        await self._request("POST", f"agents/{agent_id}/leave", channel_name)

    async def close(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        channel_name: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        url = f"{self.settings.convoai_base_url}/{self.settings.agora_app_id}/{path}"
        headers = {"Authorization": f"agora token={self.create_agent_token(channel_name)}"}
        try:
            response = await self._http.request(method, url, headers=headers, **kwargs)
        except httpx.TimeoutException as exc:
            raise AgoraTimeoutError("Agora request timed out.") from exc
        except httpx.HTTPError as exc:
            raise AgoraUpstreamError("Unable to reach Agora Conversational AI.") from exc

        if response.is_error:
            message = "Agora Conversational AI request failed."
            try:
                payload = response.json()
                message = payload.get("reason") or payload.get("message") or message
            except ValueError:
                pass
            raise AgoraUpstreamError(f"{message} (status {response.status_code})")
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise AgoraUpstreamError("Agora returned an invalid JSON response.") from exc
