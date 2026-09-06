from __future__ import annotations

import json
import random
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

STORAGE_DIR = Path(__file__).resolve().parents[1] / "storage"
TICKETS_FILE = STORAGE_DIR / "tickets.json"

CATEGORY_ICONS = {
    "waste & sanitation": "🗑",
    "waste": "🗑",
    "sanitation": "🗑",
    "street lighting": "💡",
    "lighting": "💡",
    "electrical": "💡",
    "roads & potholes": "🕳",
    "roads": "🕳",
    "potholes": "🕳",
    "water supply": "💧",
    "water": "💧",
    "drainage": "🌊",
    "sewage": "🌊",
    "emergency": "⚠",
}

DEPARTMENT_MAP = {
    "waste": "Nagar Nigam Sanitation Dept.",
    "sanitation": "Nagar Nigam Sanitation Dept.",
    "lighting": "Municipal Electrical Dept.",
    "electrical": "Municipal Electrical Dept.",
    "roads": "PWD Roads Division",
    "potholes": "PWD Roads Division",
    "water": "Jal Board / Water Works Dept.",
    "drainage": "Sewerage & Drainage Board",
    "emergency": "Emergency Control Room 112",
}


class TicketStore:
    def __init__(self, file_path: Path = TICKETS_FILE) -> None:
        self.file_path = file_path
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists():
            # Seed tickets
            initial_tickets = [
                {
                    "id": "SHK-CIVIC-1042",
                    "problem": "Uncollected garbage piling up near Sector 12 main road for 3 days.",
                    "category": "Waste & Sanitation",
                    "category_icon": "🗑",
                    "status": "In Progress",
                    "address": "Sector 12, Block B, Near Main Gate, New Delhi – 110001",
                    "department": "Nagar Nigam Sanitation Dept.",
                    "raised": "04 Sep 2026, 10:32 AM",
                    "updated": "05 Sep 2026, 08:15 AM",
                    "citizen_pin": "SAH-4821",
                    "citizen_id": "CTZ-74892",
                    "timestamp_unix": int(time.time()) - 172800,
                },
                {
                    "id": "SHK-CIVIC-1038",
                    "problem": "Street light on MG Road near bus stand is non-functional since last week.",
                    "category": "Street Lighting",
                    "category_icon": "💡",
                    "status": "Problem Solved",
                    "address": "MG Road, Bus Stand Area, Connaught Place, New Delhi – 110020",
                    "department": "Municipal Electrical Dept.",
                    "raised": "01 Sep 2026, 07:45 PM",
                    "updated": "03 Sep 2026, 04:00 PM",
                    "citizen_pin": "SAH-4821",
                    "citizen_id": "CTZ-74892",
                    "timestamp_unix": int(time.time()) - 432000,
                },
                {
                    "id": "SHK-CIVIC-1055",
                    "problem": "Large pothole on Ring Road near Lajpat Nagar flyover causing accidents.",
                    "category": "Roads & Potholes",
                    "category_icon": "🕳",
                    "status": "In Progress",
                    "address": "Ring Road, Near Lajpat Nagar Flyover, New Delhi – 110024",
                    "department": "PWD Roads Division",
                    "raised": "05 Sep 2026, 09:10 AM",
                    "updated": "05 Sep 2026, 09:10 AM",
                    "citizen_pin": "SAH-4821",
                    "citizen_id": "CTZ-74892",
                    "timestamp_unix": int(time.time()) - 86400,
                },
            ]
            self.file_path.write_text(json.dumps(initial_tickets, indent=2), encoding="utf-8")

    def _read(self) -> list[dict[str, Any]]:
        try:
            return json.loads(self.file_path.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _write(self, tickets: list[dict[str, Any]]) -> None:
        self.file_path.write_text(json.dumps(tickets, indent=2), encoding="utf-8")

    def list_tickets(
        self,
        citizen_pin: str | None = None,
        citizen_id: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        tickets = self._read()
        filtered = tickets

        if citizen_pin:
            filtered = [t for t in filtered if t.get("citizen_pin") == citizen_pin]
        elif citizen_id:
            filtered = [t for t in filtered if t.get("citizen_id") == citizen_id]

        if category:
            cat_lower = category.lower()
            filtered = [t for t in filtered if cat_lower in t.get("category", "").lower()]

        # Sort newest first
        filtered.sort(key=lambda x: x.get("timestamp_unix", 0), reverse=True)
        return filtered

    def get_ticket(self, ticket_id: str) -> Optional[dict[str, Any]]:
        tickets = self._read()
        ticket_id_clean = ticket_id.strip().upper()
        for t in tickets:
            if t.get("id", "").upper() == ticket_id_clean:
                return t
        return None

    def create_ticket(
        self,
        problem: str,
        category: str,
        address: str,
        citizen_pin: str,
        citizen_id: str | None = None,
        department: str | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]:
        tickets = self._read()

        clean_cat = category.strip()
        cat_lower = clean_cat.lower()
        icon = "📋"
        for k, v in CATEGORY_ICONS.items():
            if k in cat_lower:
                icon = v
                break

        dept = department or "Municipal Civic Services"
        for k, v in DEPARTMENT_MAP.items():
            if k in cat_lower:
                dept = v
                break

        now_formatted = datetime.now().strftime("%d %b %Y, %I:%M %p")
        assigned_id = ticket_id.strip().upper() if ticket_id else f"SHK-CIVIC-{random.randint(1000, 9999)}"

        # If a ticket with this ID already exists, update and return it
        for existing in tickets:
            if existing.get("id", "").upper() == assigned_id:
                existing["updated"] = now_formatted
                if problem:
                    existing["problem"] = problem.strip()
                if citizen_pin:
                    existing["citizen_pin"] = citizen_pin.strip()
                if citizen_id:
                    existing["citizen_id"] = citizen_id
                self._write(tickets)
                return existing

        new_ticket = {
            "id": assigned_id,
            "problem": problem.strip(),
            "category": clean_cat,
            "category_icon": icon,
            "status": "In Progress",
            "address": address.strip(),
            "department": dept,
            "raised": now_formatted,
            "updated": now_formatted,
            "citizen_pin": citizen_pin.strip(),
            "citizen_id": citizen_id,
            "timestamp_unix": int(time.time()),
        }

        # Prepend to list
        tickets.insert(0, new_ticket)
        self._write(tickets)
        return new_ticket


ticket_store = TicketStore()
