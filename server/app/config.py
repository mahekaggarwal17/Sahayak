from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


SERVER_DIR = Path(__file__).resolve().parents[1]


def _csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    agora_app_id: str
    agora_app_certificate: str
    agora_customer_id: str = ""
    agora_customer_secret: str = ""
    auth_secret_key: str = "sahayak-default-secret-key-change-in-production"
    asr_model: str = "nova-3"
    llm_model: str = "gpt-4o-mini"
    tts_model: str = "speech_2_6_turbo"
    tts_voice_id: str = "hindi_female_2_v1"
    agora_area: str = "ASIA_PACIFIC"
    agent_uid: int = 123456
    host: str = "127.0.0.1"
    port: int = 8000
    allowed_origins: tuple[str, ...] = ("*",)
    token_expiry_seconds: int = 3600
    session_ttl_seconds: int = 7200
    requests_per_minute: int = 60
    build_version: str = "1.0.0"
    google_client_id: str = ""
    google_client_secret: str = ""

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(SERVER_DIR / ".env", override=False)
        load_dotenv(SERVER_DIR / ".env.local", override=True)
        app_id = os.getenv("AGORA_APP_ID", "").strip()
        app_cert = os.getenv("AGORA_APP_CERTIFICATE", "").strip()
        return cls(
            agora_app_id=app_id,
            agora_app_certificate=app_cert,
            agora_customer_id=os.getenv("AGORA_CUSTOMER_ID", "").strip(),
            agora_customer_secret=os.getenv("AGORA_CUSTOMER_SECRET", "").strip(),
            auth_secret_key=os.getenv("AUTH_SECRET_KEY", "sahayak-default-secret-key-change-in-production").strip(),
            asr_model=os.getenv("ASR_MODEL", "nova-3"),
            llm_model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            tts_model=os.getenv("TTS_MODEL", "speech_2_6_turbo"),
            tts_voice_id=os.getenv("TTS_VOICE_ID", "hindi_female_2_v1"),
            agora_area=os.getenv("AGORA_AREA", "ASIA_PACIFIC"),
            agent_uid=int(os.getenv("AGORA_AGENT_UID", "123456")),
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "8000")),
            allowed_origins=_csv(os.getenv("ALLOWED_ORIGINS", "*")),
            token_expiry_seconds=int(os.getenv("TOKEN_EXPIRY_SECONDS", "3600")),
            session_ttl_seconds=int(os.getenv("SESSION_TTL_SECONDS", "7200")),
            requests_per_minute=int(os.getenv("REQUESTS_PER_MINUTE", "60")),
            build_version=os.getenv("BUILD_VERSION", "1.0.0"),
            google_client_id=os.getenv("GOOGLE_CLIENT_ID", "").strip(),
            google_client_secret=os.getenv("GOOGLE_CLIENT_SECRET", "").strip(),
        )

    def validate(self) -> None:
        missing = [
            name
            for name, value in (
                ("AGORA_APP_ID", self.agora_app_id),
                ("AGORA_APP_CERTIFICATE", self.agora_app_certificate),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing required server configuration: {', '.join(missing)}")
