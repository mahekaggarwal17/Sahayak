from __future__ import annotations

import json
import logging
import os
import random
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("uvicorn.error")


class RecordingsStore:
    def __init__(self, base_storage_dir: Path | None = None) -> None:
        if base_storage_dir is None:
            # Default to server/storage
            base_dir = Path(__file__).resolve().parents[1] / "storage"
        else:
            base_dir = base_storage_dir

        self.storage_dir = base_dir / "recordings"
        self.metadata_file = base_dir / "recordings.json"
        self._ensure_storage_ready()

    def _ensure_storage_ready(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        if not self.metadata_file.exists():
            try:
                self.metadata_file.write_text(json.dumps([], indent=2), encoding="utf-8")
            except Exception as e:
                logger.error("Failed to initialize recordings metadata file: %s", e)

    def _read_metadata(self) -> list[dict[str, Any]]:
        try:
            if not self.metadata_file.exists():
                return []
            content = self.metadata_file.read_text(encoding="utf-8").strip()
            if not content:
                return []
            return json.loads(content)
        except Exception as e:
            logger.error("Error reading recordings metadata: %s", e)
            return []

    def _write_metadata(self, data: list[dict[str, Any]]) -> None:
        temp_file = self.metadata_file.with_suffix(".tmp")
        temp_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        temp_file.replace(self.metadata_file)

    @staticmethod
    def _detect_civic_category(transcripts: list[dict[str, Any]]) -> str:
        combined_text = " ".join([turn.get("text", "") for turn in transcripts]).lower()

        if any(w in combined_text for w in ["wire", "current", "gas leak", "flame", "emergency", "aag", "accident", "112"]):
            return "Urgent Public Safety"
        if any(w in combined_text for w in ["kachra", "garbage", "dustbin", "safai", "waste", "cleaning", "drain", "naali"]):
            return "Waste Management"
        if any(w in combined_text for w in ["street light", "light", "andhera", "pole", "bulb", "flicker", "bijli"]):
            return "Street Light & Electrical"
        if any(w in combined_text for w in ["road", "pothole", "gaddha", "asphalt", "divider", "traffic"]):
            return "Roads & Potholes"
        if any(w in combined_text for w in ["paani", "water", "supply", "pipe", "connection", "tanker", "sewer"]):
            return "Water Supply & Connections"
        if any(w in combined_text for w in ["ticket", "status", "shk-", "complaint", "number", "check"]):
            return "Ticket Tracking"
        return "Civic Assistance"

    @staticmethod
    def _detect_ticket(transcripts: list[dict[str, Any]]) -> str | None:
        combined_text = " ".join([turn.get("text", "") for turn in transcripts])
        # Look for explicit SHK-CIVIC-XXXX or SHK-XXXX
        match_shk = re.search(r"\b(SHK-[A-Z0-9-]+)\b", combined_text, re.IGNORECASE)
        if match_shk:
            return match_shk.group(1).upper()
        # Look for phrases like 'ticket number 1234' or 'complaint 1234' or 'शिकायत 1234'
        match_num = re.search(r"(?:ticket|complaint|शिकायत)\s*(?:number|no|id|संख्या)?\s*[:#-]?\s*(\d{4,6})", combined_text, re.IGNORECASE)
        if match_num:
            return f"SHK-CIVIC-{match_num.group(1)}"
        return None

    @staticmethod
    def _generate_summary(transcripts: list[dict[str, Any]], category: str) -> str:
        # Find first meaningful user utterance
        user_turn = next((t.get("text", "") for t in transcripts if t.get("speaker") == "user" and len(t.get("text", "")) > 10), None)
        if user_turn:
            snippet = user_turn[:120].strip()
            if len(user_turn) > 120:
                snippet += "..."
            return f"{category}: {snippet}"
        return f"{category} consultation with SAHAYAK Voice AI"

    def save_recording(
        self,
        audio_bytes: bytes,
        channel_name: str,
        duration_seconds: int = 0,
        transcripts: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
        file_extension: str = "webm",
    ) -> dict[str, Any]:
        transcripts = transcripts or []
        metadata = metadata or {}

        now_ts = int(time.time())
        rec_id = f"rec_{now_ts}_{uuid.uuid4().hex[:8]}"
        clean_ext = file_extension.lstrip(".").lower()
        if clean_ext not in ["webm", "wav", "mp3", "m4a", "aac", "ogg"]:
            clean_ext = "webm"

        audio_filename = f"{rec_id}.{clean_ext}"
        audio_filepath = self.storage_dir / audio_filename

        # Write audio data to disk
        audio_filepath.write_bytes(audio_bytes)
        file_size = len(audio_bytes)

        category = self._detect_civic_category(transcripts)
        ticket = self._detect_ticket(transcripts)
        if not ticket:
            ticket = f"SHK-CIVIC-{random.randint(1000, 9999)}"
        summary = self._generate_summary(transcripts, category)

        now_dt = datetime.now(timezone.utc)
        created_at_iso = now_dt.isoformat()
        created_at_formatted = now_dt.strftime("%b %d, %Y, %I:%M %p")

        record: dict[str, Any] = {
            "id": rec_id,
            "channel_name": channel_name,
            "created_at_iso": created_at_iso,
            "created_at_formatted": created_at_formatted,
            "timestamp_unix": now_ts,
            "duration_seconds": duration_seconds,
            "audio_filename": audio_filename,
            "audio_url": f"/v1/recordings/{rec_id}/audio",
            "file_size_bytes": file_size,
            "category": category,
            "ticket_number": ticket,
            "summary": summary,
            "turns_count": len(transcripts),
            "transcripts": transcripts,
            "agent_id": str(metadata.get("agent_id", "") or ""),
            "caller_rtc_uid": str(metadata.get("requester_rtc_uid", "") or ""),
            "citizen_pin": str(metadata.get("citizen_pin", "") or ""),
            "citizen_id": str(metadata.get("citizen_id", "") or "") if metadata.get("citizen_id") else None,
        }

        records = self._read_metadata()
        records.insert(0, record)
        self._write_metadata(records)

        logger.info("Saved call recording id=%s channel=%s size=%d bytes ticket=%s", rec_id, channel_name, file_size, ticket)
        return record

    def update_recording_ticket(self, recording_id: str, ticket_number: str) -> dict[str, Any] | None:
        records = self._read_metadata()
        for r in records:
            if r.get("id") == recording_id:
                r["ticket_number"] = ticket_number
                self._write_metadata(records)
                logger.info("Updated recording id=%s with ticket_number=%s", recording_id, ticket_number)
                return r
        return None

    def list_recordings(self, category: str | None = None, query: str | None = None) -> list[dict[str, Any]]:
        records = self._read_metadata()
        if category:
            records = [r for r in records if r.get("category", "").lower() == category.lower()]
        if query:
            q = query.lower()
            records = [
                r for r in records
                if q in r.get("summary", "").lower()
                or q in r.get("channel_name", "").lower()
                or (r.get("ticket_number") and q in r.get("ticket_number", "").lower())
            ]
        # Sort descending by timestamp
        records.sort(key=lambda x: x.get("timestamp_unix", 0), reverse=True)
        return records

    def get_recording(self, recording_id: str) -> dict[str, Any] | None:
        records = self._read_metadata()
        return next((r for r in records if r.get("id") == recording_id), None)

    def get_audio_path(self, recording_id: str) -> Path | None:
        rec = self.get_recording(recording_id)
        if not rec:
            return None
        filepath = self.storage_dir / rec.get("audio_filename", "")
        if filepath.exists():
            return filepath
        return None

    def delete_recording(self, recording_id: str) -> bool:
        records = self._read_metadata()
        target = next((r for r in records if r.get("id") == recording_id), None)
        if not target:
            return False

        # Remove audio file
        audio_file = self.storage_dir / target.get("audio_filename", "")
        if audio_file.exists():
            try:
                audio_file.unlink()
            except Exception as e:
                logger.warning("Could not delete audio file %s: %s", audio_file, e)

        # Remove from metadata list
        updated = [r for r in records if r.get("id") != recording_id]
        self._write_metadata(updated)
        logger.info("Deleted call recording id=%s", recording_id)
        return True
