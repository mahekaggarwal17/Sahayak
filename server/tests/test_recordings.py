import base64
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.recordings_store import RecordingsStore
from tests.test_api import FakeAgoraClient


def test_recording_store_and_api(tmp_path):
    store = RecordingsStore(base_storage_dir=tmp_path)
    fake_agora = FakeAgoraClient()
    settings = Settings(
        agora_app_id="app-id",
        agora_app_certificate="cert",
    )
    app = create_app(settings=settings, agora_client=fake_agora, recordings_store=store)

    with TestClient(app) as client:
        # Initially empty
        res = client.get("/v1/recordings")
        assert res.status_code == 200
        assert res.json()["total_count"] == 0

        # Upload a recording
        audio_content = b"RIFFFAKEWAVEFORMDATA12345"
        audio_b64 = base64.b64encode(audio_content).decode("ascii")
        transcripts = [
            {"speaker": "agent", "text": "नमस्ते, मैं सहायक हूँ।", "timestamp": "12:00 PM"},
            {"speaker": "user", "text": "Mere area mein 3 din se kachra nahi uthaya gaya hai.", "timestamp": "12:01 PM"},
            {"speaker": "agent", "text": "Aapka ticket number SHK-CIVIC-8921 darj kar liya gaya hai.", "timestamp": "12:02 PM"},
        ]

        payload = {
            "channel_name": "test-channel-123",
            "duration_seconds": 45,
            "audio_base64": f"data:audio/webm;base64,{audio_b64}",
            "audio_format": "webm",
            "transcripts": transcripts,
            "metadata": {"requester_rtc_uid": 12345},
        }

        upload_res = client.post("/v1/recordings", json=payload)
        assert upload_res.status_code == 201
        rec_data = upload_res.json()
        assert rec_data["channel_name"] == "test-channel-123"
        assert rec_data["duration_seconds"] == 45
        assert rec_data["category"] == "Waste Management"
        assert rec_data["ticket_number"] == "SHK-CIVIC-8921"
        assert len(rec_data["transcripts"]) == 3
        rec_id = rec_data["id"]

        # List recordings
        list_res = client.get("/v1/recordings")
        assert list_res.status_code == 200
        assert list_res.json()["total_count"] == 1
        assert list_res.json()["recordings"][0]["id"] == rec_id

        # Get recording detail
        get_res = client.get(f"/v1/recordings/{rec_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == rec_id
        assert get_res.json()["category"] == "Waste Management"

        # Stream audio
        audio_res = client.get(f"/v1/recordings/{rec_id}/audio")
        assert audio_res.status_code == 200
        assert audio_res.content == audio_content
        assert "audio/webm" in audio_res.headers.get("content-type", "")

        # Search/filter recordings
        search_res = client.get("/v1/recordings?query=kachra")
        assert search_res.status_code == 200
        assert search_res.json()["total_count"] == 1

        cat_res = client.get("/v1/recordings?category=Waste Management")
        assert cat_res.status_code == 200
        assert cat_res.json()["total_count"] == 1

        # Delete recording
        del_res = client.delete(f"/v1/recordings/{rec_id}")
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True

        # Verify deletion
        assert client.get(f"/v1/recordings/{rec_id}").status_code == 404
        assert client.get(f"/v1/recordings/{rec_id}/audio").status_code == 404
        assert client.get("/v1/recordings").json()["total_count"] == 0
