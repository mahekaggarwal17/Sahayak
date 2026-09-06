from __future__ import annotations

import base64
import hashlib
import hmac
import json
import random
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, Header, HTTPException, status

STORAGE_DIR = Path(__file__).resolve().parents[1] / "storage"
CITIZENS_FILE = STORAGE_DIR / "citizens.json"


def _urlsafe_b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _urlsafe_b64decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def create_jwt_token(payload: dict[str, Any], secret_key: str, expires_in_seconds: int = 86400 * 30) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    exp_payload = payload.copy()
    exp_payload["exp"] = int(time.time()) + expires_in_seconds
    exp_payload["iat"] = int(time.time())

    header_b64 = _urlsafe_b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _urlsafe_b64encode(json.dumps(exp_payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    signature = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _urlsafe_b64encode(signature)
    return f"{header_b64}.{payload_b64}.{sig_b64}"


from threading import RLock

def verify_jwt_token(token: str, secret_key: str) -> dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed token format.")
        header_b64, payload_b64, sig_b64 = parts

        header = json.loads(_urlsafe_b64decode(header_b64).decode("utf-8"))
        if header.get("alg") != "HS256":
            raise ValueError(f"Unsupported algorithm '{header.get('alg')}'. Expected HS256.")

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
        provided_sig = _urlsafe_b64decode(sig_b64)

        if not hmac.compare_digest(expected_sig, provided_sig):
            raise ValueError("Token signature verification failed.")

        payload = json.loads(_urlsafe_b64decode(payload_b64).decode("utf-8"))
        if "exp" in payload and payload["exp"] < time.time():
            raise ValueError("Token has expired.")
        return payload
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


class CitizenStore:
    def __init__(self, file_path: Path = CITIZENS_FILE) -> None:
        self.file_path = file_path
        self._lock = RLock()
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        with self._lock:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            if not self.file_path.exists():
                # Seed with demo citizen
                demo_citizens = {
                    "9876543210": {
                        "citizen_id": "CTZ-74892",
                        "phone": "9876543210",
                        "name": "Rajesh Kumar (Citizen Demo)",
                        "pin": "SAH-4821",
                        "created_at_unix": int(time.time()),
                    }
                }
                temp_file = self.file_path.with_suffix(".tmp")
                temp_file.write_text(json.dumps(demo_citizens, indent=2), encoding="utf-8")
                temp_file.replace(self.file_path)

    def _read(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            try:
                if not self.file_path.exists():
                    return {}
                return json.loads(self.file_path.read_text(encoding="utf-8"))
            except Exception:
                return {}

    def _write(self, data: dict[str, dict[str, Any]]) -> None:
        with self._lock:
            temp_file = self.file_path.with_suffix(".tmp")
            temp_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            temp_file.replace(self.file_path)

    def get_by_phone(self, phone: str) -> Optional[dict[str, Any]]:
        data = self._read()
        return data.get(phone.strip())

    def get_by_id(self, citizen_id: str) -> Optional[dict[str, Any]]:
        data = self._read()
        for c in data.values():
            if c.get("citizen_id") == citizen_id:
                return c
        return None

    def authenticate_or_register(
        self,
        phone: str,
        name: str | None = None,
        pin: str | None = None,
    ) -> dict[str, Any]:
        clean_phone = phone.strip()
        data = self._read()

        if clean_phone in data:
            citizen = data[clean_phone]
            if name and name.strip():
                citizen["name"] = name.strip()
            if pin and pin.strip():
                citizen["pin"] = pin.strip()
            data[clean_phone] = citizen
            self._write(data)
            return citizen

        # Register new citizen
        citizen_id = f"CTZ-{random.randint(10000, 99999)}"
        assigned_pin = pin.strip() if pin and pin.strip() else f"SAH-{random.randint(1000, 9999)}"
        citizen_name = name.strip() if name and name.strip() else f"Citizen {clean_phone[-4:]}"

        new_citizen = {
            "citizen_id": citizen_id,
            "phone": clean_phone,
            "name": citizen_name,
            "pin": assigned_pin,
            "created_at_unix": int(time.time()),
        }
        data[clean_phone] = new_citizen
        self._write(data)
        return new_citizen

    def get_by_email(self, email: str) -> Optional[dict[str, Any]]:
        clean = email.strip().lower()
        data = self._read()
        for c in data.values():
            if c.get("email", "").lower() == clean:
                return c
        return None

    def authenticate_or_register_google(
        self,
        email: str,
        name: str,
        google_sub: str,
        picture: str | None = None,
    ) -> dict[str, Any]:
        clean_email = email.strip().lower()
        data = self._read()

        # Check by google_sub or email
        existing_key = None
        for k, c in data.items():
            if c.get("google_sub") == google_sub or c.get("email", "").lower() == clean_email or c.get("phone") == clean_email:
                existing_key = k
                break

        if existing_key:
            citizen = data[existing_key]
            if name and name.strip():
                citizen["name"] = name.strip()
            if picture:
                citizen["picture"] = picture
            citizen["email"] = clean_email
            citizen["google_sub"] = google_sub
            citizen["auth_provider"] = "google"
            data[existing_key] = citizen
            self._write(data)
            return citizen

        # Register new citizen with Google
        citizen_id = f"CTZ-{random.randint(10000, 99999)}"
        assigned_pin = f"SAH-{random.randint(1000, 9999)}"
        new_citizen = {
            "citizen_id": citizen_id,
            "phone": clean_email,
            "email": clean_email,
            "name": name.strip() if name else "Citizen",
            "pin": assigned_pin,
            "google_sub": google_sub,
            "picture": picture,
            "auth_provider": "google",
            "created_at_unix": int(time.time()),
        }
        data[clean_email] = new_citizen
        self._write(data)
        return new_citizen


_warned_about_secret = False


def get_auth_secret_key() -> str:
    global _warned_about_secret
    import os
    import logging
    key = os.getenv("AUTH_SECRET_KEY", "sahayak-default-secret-key-change-in-production").strip()
    if key == "sahayak-default-secret-key-change-in-production" and not _warned_about_secret:
        logging.getLogger("uvicorn.error").warning(
            "SECURITY WARNING: Default AUTH_SECRET_KEY is in use. Set AUTH_SECRET_KEY for production deployments."
        )
        _warned_about_secret = True
    return key


citizen_store = CitizenStore()


def get_current_citizen(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in as a citizen.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_jwt_token(token, get_auth_secret_key())
    citizen = citizen_store.get_by_id(payload.get("sub"))
    if not citizen:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Citizen profile not found.",
        )
    return citizen


def get_optional_citizen(authorization: Optional[str] = Header(None)) -> Optional[dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.split(" ", 1)[1].strip()
        payload = verify_jwt_token(token, get_auth_secret_key())
        return citizen_store.get_by_id(payload.get("sub"))
    except Exception:
        return None
