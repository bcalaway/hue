from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app, settings

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
            "nyc": {"available": False, "rooms": [], "unassigned_lights": [], "automations": []},
            "rambles": {"available": False, "rooms": [], "unassigned_lights": [], "automations": []},
        }
    }


def test_set_light_state_without_configured_agent():
    # "nyc"/"rambles" are the only known site keys but neither has
    # AGENT_HOST_* set in the test environment -- same graceful-degradation
    # contract as /api/state, just on the write path.
    response = client.post("/api/site/nyc/light/light-1", json={"on": True})
    assert response.status_code == 502
    assert response.json()["ok"] is False


def test_set_light_state_success():
    with patch("app.main.set_light_state", return_value=(True, "")) as mock_set:
        response = client.post("/api/site/nyc/light/light-1", json={"on": True})
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    mock_set.assert_called_once_with("", "light-1", True)


def test_set_light_brightness_without_configured_agent():
    response = client.post("/api/site/nyc/light/light-1/brightness", json={"brightness": 40})
    assert response.status_code == 502
    assert response.json()["ok"] is False


def test_set_light_brightness_success():
    with patch("app.main.set_light_brightness", return_value=(True, "")) as mock_set:
        response = client.post("/api/site/nyc/light/light-1/brightness", json={"brightness": 40})
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    mock_set.assert_called_once_with("", "light-1", 40.0)


def test_set_light_brightness_rejects_out_of_range():
    # 0 is not a valid CLIP v2 brightness (a light at 0% is off) -- the
    # slider's range starts at 1, and the body model enforces it as a 422
    # rather than letting it reach the bridge as a 502.
    response = client.post("/api/site/nyc/light/light-1/brightness", json={"brightness": 0})
    assert response.status_code == 422


def test_activate_scene_without_configured_agent():
    response = client.post("/api/site/nyc/scene/scene-1/activate")
    assert response.status_code == 502
    assert response.json()["ok"] is False


def test_activate_scene_success():
    with patch("app.main.activate_scene", return_value=(True, "")) as mock_activate:
        response = client.post("/api/site/nyc/scene/scene-1/activate")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    mock_activate.assert_called_once_with("", "scene-1")


def test_set_room_state_without_configured_agent():
    response = client.post("/api/site/nyc/grouped-light/grouped-1", json={"on": False})
    assert response.status_code == 502
    assert response.json()["ok"] is False


def test_set_room_state_off_success():
    with patch("app.main.set_grouped_light_state", return_value=(True, "")) as mock_set:
        response = client.post("/api/site/nyc/grouped-light/grouped-1", json={"on": False})
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    mock_set.assert_called_once_with("", "grouped-1", False)


def test_set_room_state_on_success():
    with patch("app.main.set_grouped_light_state", return_value=(True, "")) as mock_set:
        response = client.post("/api/site/nyc/grouped-light/grouped-1", json={"on": True})
    assert response.status_code == 200
    mock_set.assert_called_once_with("", "grouped-1", True)


def test_detected_site_unknown_ip():
    # An IP not in the WAN-IP map (none configured in the test env) -- the
    # UI treats a null site as "no auto-pick, use manual/first-available".
    response = client.get("/api/detected-site", headers={"X-Forwarded-For": "203.0.113.50"})
    assert response.status_code == 200
    assert response.json() == {"site": None, "client_ip": "203.0.113.50"}


def test_detected_site_matches_configured_ip(monkeypatch):
    # settings is a frozen dataclass instance -- the attribute can't be
    # rebound, but mutating the dict it already holds is fine and
    # monkeypatch undoes it afterwards. Only the leftmost X-Forwarded-For
    # entry (the original client) is matched, not the proxy hops after it.
    monkeypatch.setitem(settings.site_wan_ips, "203.0.113.7", "rambles")
    response = client.get(
        "/api/detected-site", headers={"X-Forwarded-For": "203.0.113.7, 172.20.0.3"}
    )
    assert response.json() == {"site": "rambles", "client_ip": "203.0.113.7"}


def test_login_without_configured_auth():
    # No AUTHENTIK_CLIENT_ID/SECRET in the test environment -- confirms the
    # auth route responds cleanly instead of crashing when Authentik isn't
    # wired up yet.
    response = client.get("/login")
    assert response.status_code == 501
