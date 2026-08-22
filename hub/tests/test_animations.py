from app import animator

ANIMATION_BODY = {
    "room_id": "room-1",
    "room_name": "Living Room",
    "scene_a_id": "scene-a",
    "scene_a_name": "Relax",
    "scene_b_id": "scene-b",
    "scene_b_name": "Energize",
    "interval_seconds": 30,
}


def test_create_and_list_animation(client):
    response = client.post("/api/site/nyc/animations", json=ANIMATION_BODY)

    assert response.status_code == 200
    body = response.json()
    assert body["site"] == "nyc"
    assert body["room_name"] == "Living Room"
    assert body["enabled"] is True
    assert body["running"] is True

    listed = client.get("/api/site/nyc/animations").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]
    assert listed[0]["running"] is True


def test_creating_a_second_animation_for_the_same_room_replaces_it_instead_of_stacking(client):
    first = client.post("/api/site/nyc/animations", json=ANIMATION_BODY).json()

    replacement = {**ANIMATION_BODY, "scene_a_name": "Bright", "interval_seconds": 60}
    second = client.post("/api/site/nyc/animations", json=replacement).json()

    assert second["id"] == first["id"]
    assert second["scene_a_name"] == "Bright"
    assert second["interval_seconds"] == 60

    listed = client.get("/api/site/nyc/animations").json()
    assert len(listed) == 1


def test_stop_and_start_animation(client):
    animation_id = client.post("/api/site/nyc/animations", json=ANIMATION_BODY).json()["id"]

    stop_response = client.post(f"/api/site/nyc/animations/{animation_id}/stop")
    assert stop_response.status_code == 200
    assert not animator.is_running(animation_id)

    listed = client.get("/api/site/nyc/animations").json()
    assert listed[0]["enabled"] is False
    assert listed[0]["running"] is False

    start_response = client.post(f"/api/site/nyc/animations/{animation_id}/start")
    assert start_response.status_code == 200
    assert animator.is_running(animation_id)


def test_stop_unknown_animation_returns_404(client):
    response = client.post("/api/site/nyc/animations/999/stop")
    assert response.status_code == 404


def test_animations_are_scoped_per_site(client):
    client.post("/api/site/nyc/animations", json=ANIMATION_BODY)

    assert client.get("/api/site/rambles/animations").json() == []
