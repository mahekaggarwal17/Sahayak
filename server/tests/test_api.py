from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class FakeAgoraClient:
    def __init__(self) -> None:
        self.join_calls = 0

    def create_user_tokens(self, channel_name: str, rtc_uid: int):
        return f"rtc-{channel_name}-{rtc_uid}", f"rtm-{rtc_uid}", 2_000_000_000

    async def join_agent(self, **kwargs):
        self.join_calls += 1
        return {"agent_id": "agent-1", "create_ts": 1_700_000_000, "status": "started"}

    async def interrupt_agent(self, agent_id: str, channel_name: str):
        return None

    async def leave_agent(self, agent_id: str, channel_name: str):
        return None

    async def close(self):
        return None


def settings() -> Settings:
    return Settings(
        agora_app_id="app-id",
        agora_app_certificate="certificate",
        quickstart_app_token="test-token",
    )


def test_health_is_public_and_protected_routes_require_auth():
    with TestClient(create_app(settings(), FakeAgoraClient())) as client:
        assert client.get("/health").status_code == 200
        assert client.post("/v1/conversation/bootstrap", json={}).status_code == 401


def test_full_conversation_contract_and_idempotent_join():
    fake = FakeAgoraClient()
    headers = {"Authorization": "Bearer test-token"}
    with TestClient(create_app(settings(), fake)) as client:
        bootstrap = client.post(
            "/v1/conversation/bootstrap",
            headers=headers,
            json={"requester_rtc_uid": 42, "requester_rtm_user_id": "42"},
        )
        assert bootstrap.status_code == 200
        session = bootstrap.json()
        assert session["app_id"] == "app-id"
        assert session["rtc_token"].startswith("rtc-")

        join_body = {"channel_name": session["channel_name"], "requester_rtc_uid": 42}
        first_join = client.post("/v1/conversation/join", headers=headers, json=join_body)
        second_join = client.post("/v1/conversation/join", headers=headers, json=join_body)
        assert first_join.json()["agent_id"] == "agent-1"
        assert second_join.json()["agent_id"] == "agent-1"
        assert fake.join_calls == 1

        refresh = client.post(
            "/v1/conversation/refresh",
            headers=headers,
            json={
                "channel_name": session["channel_name"],
                "requester_rtc_uid": 42,
                "requester_rtm_user_id": "42",
            },
        )
        assert refresh.status_code == 200
        assert refresh.json()["rtm_token"] == "rtm-42"

        action = {"channel_name": session["channel_name"], "agent_id": "agent-1"}
        assert client.post("/v1/conversation/interrupt", headers=headers, json=action).status_code == 200
        assert client.post("/v1/conversation/leave", headers=headers, json=action).status_code == 200
        assert client.post("/v1/conversation/refresh", headers=headers, json={
            "channel_name": session["channel_name"],
            "requester_rtc_uid": 42,
            "requester_rtm_user_id": "42",
        }).status_code == 404
