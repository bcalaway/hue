def test_no_favorites_by_default(client):
    assert client.get("/api/site/nyc/favorites").json() == {"room_ids": []}


def test_add_and_list_favorite(client):
    response = client.post("/api/site/nyc/favorites/room-1")
    assert response.status_code == 200

    assert client.get("/api/site/nyc/favorites").json() == {"room_ids": ["room-1"]}


def test_adding_the_same_favorite_twice_is_idempotent(client):
    client.post("/api/site/nyc/favorites/room-1")
    client.post("/api/site/nyc/favorites/room-1")

    assert client.get("/api/site/nyc/favorites").json() == {"room_ids": ["room-1"]}


def test_remove_favorite(client):
    client.post("/api/site/nyc/favorites/room-1")

    response = client.delete("/api/site/nyc/favorites/room-1")

    assert response.status_code == 200
    assert client.get("/api/site/nyc/favorites").json() == {"room_ids": []}


def test_removing_a_favorite_that_was_never_set_is_a_no_op(client):
    response = client.delete("/api/site/nyc/favorites/room-1")
    assert response.status_code == 200


def test_favorites_are_scoped_per_site(client):
    client.post("/api/site/nyc/favorites/room-1")

    assert client.get("/api/site/rambles/favorites").json() == {"room_ids": []}
