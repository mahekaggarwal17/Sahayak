import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from tests.test_api import FakeAgoraClient


def test_auth_login_and_me_lifecycle():
    app = create_app(Settings(agora_app_id="test", agora_app_certificate="test"), FakeAgoraClient())
    with TestClient(app) as client:
        # 1. Login or register citizen
        res = client.post(
            "/v1/auth/citizen-login",
            json={
                "phone": "9876543210",
                "name": "Aarav Sharma",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["phone"] == "9876543210"
        assert data["name"] == "Aarav Sharma"
        assert data["pin"].startswith("SAH-")
        token = data["token"]

        # 2. Get profile with token
        me_res = client.get(
            "/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["phone"] == "9876543210"
        assert me_data["name"] == "Aarav Sharma"
        assert me_data["pin"] == data["pin"]

        # 3. Requesting without token fails with 401
        unauth_res = client.get("/v1/auth/me")
        assert unauth_res.status_code == 401


def test_tickets_create_and_list_lifecycle():
    app = create_app(Settings(agora_app_id="test", agora_app_certificate="test"), FakeAgoraClient())
    with TestClient(app) as client:
        # 1. Login citizen
        login_res = client.post(
            "/v1/auth/citizen-login",
            json={"phone": "9123456789", "name": "Priya Verma"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["token"]
        pin = login_res.json()["pin"]

        # 2. Create ticket
        create_res = client.post(
            "/v1/tickets",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "problem": "Street lights in Block C are broken for 2 days",
                "category": "Street Lighting",
                "address": "Sector 4, Block C, Rohini",
            },
        )
        assert create_res.status_code == 201
        ticket = create_res.json()
        assert ticket["id"].startswith("SHK-CIVIC-")
        assert ticket["category"] == "Street Lighting"
        assert ticket["category_icon"] == "💡"
        assert ticket["citizen_pin"] == pin

        # 3. List tickets
        list_res = client.get(
            "/v1/tickets",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert list_res.status_code == 200
        tickets = list_res.json()["tickets"]
        assert len(tickets) >= 1
        assert any(t["id"] == ticket["id"] for t in tickets)

        # 4. Get specific ticket
        get_res = client.get(f"/v1/tickets/{ticket['id']}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == ticket["id"]


def test_google_config():
    client_id = "962346377917-nk61oe72ckp9vi8edfulktcr1prfp10d.apps.googleusercontent.com"
    settings = Settings(
        agora_app_id="test",
        agora_app_certificate="test",
        google_client_id=client_id,
    )
    app = create_app(settings, FakeAgoraClient())
    with TestClient(app) as client:
        res = client.get("/v1/auth/google-config")
        assert res.status_code == 200
        assert res.json()["client_id"] == client_id


def test_google_login_lifecycle():
    from unittest.mock import AsyncMock, patch

    client_id = "962346377917-nk61oe72ckp9vi8edfulktcr1prfp10d.apps.googleusercontent.com"
    settings = Settings(
        agora_app_id="test",
        agora_app_certificate="test",
        google_client_id=client_id,
    )
    app = create_app(settings, FakeAgoraClient())

    fake_google_token_data = {
        "aud": client_id,
        "sub": "109876543210123456789",
        "email": "mahek.aggarwal@example.com",
        "name": "Mahek Aggarwal",
        "picture": "https://lh3.googleusercontent.com/a/test-avatar",
    }

    class FakeResponse:
        status_code = 200

        def json(self):
            return fake_google_token_data

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = FakeResponse()
        with TestClient(app) as client:
            res = client.post(
                "/v1/auth/google",
                json={"credential": "mock_google_id_token_xyz"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["name"] == "Mahek Aggarwal"
            assert data["email"] == "mahek.aggarwal@example.com"
            assert data["picture"] == "https://lh3.googleusercontent.com/a/test-avatar"
            assert data["pin"].startswith("SAH-")
            token = data["token"]

            # Test /v1/auth/me with the issued Google citizen token
            me_res = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me_res.status_code == 200
            me_data = me_res.json()
            assert me_data["name"] == "Mahek Aggarwal"
            assert me_data["email"] == "mahek.aggarwal@example.com"
            assert me_data["pin"] == data["pin"]


def test_google_login_invalid_token():
    from unittest.mock import AsyncMock, patch

    client_id = "962346377917-nk61oe72ckp9vi8edfulktcr1prfp10d.apps.googleusercontent.com"
    settings = Settings(
        agora_app_id="test",
        agora_app_certificate="test",
        google_client_id=client_id,
    )
    app = create_app(settings, FakeAgoraClient())

    class FakeErrorResponse:
        status_code = 400

        def json(self):
            return {"error": "invalid_token"}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = FakeErrorResponse()
        with TestClient(app) as client:
            res = client.post(
                "/v1/auth/google",
                json={"credential": "invalid_google_token_xyz"}
            )
            assert res.status_code == 400
            assert "Invalid Google credential" in res.json()["detail"]

