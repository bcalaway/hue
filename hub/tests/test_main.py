from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_api_state_without_configured_agents():
    # No AGENT_HOST_NYC/AGENT_HOST_RAMBLES in the test environment --
    # confirms the app degrades gracefully per site instead of crashing
    # when neither agent is reachable yet.
    response = client.get("/api/state")
    assert response.status_code == 200
    assert response.json() == {
        "sites": {
            "nyc": {"available": False, "lights": [], "scenes": [], "automations": []},
            "rambles": {"available": False, "lights": [], "scenes": [], "automations": []},
        }
    }


def test_login_without_configured_auth():
    # No AUTHENTIK_CLIENT_ID/SECRET in the test environment -- confirms the
    # auth route responds cleanly instead of crashing when Authentik isn't
    # wired up yet.
    response = client.get("/login")
    assert response.status_code == 501
