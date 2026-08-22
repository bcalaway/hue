import time

from app import grpc_client


def test_get_all_states_queries_sites_concurrently_not_sequentially(monkeypatch):
    # Each fake site "call" takes 0.2s; sequential would take >=0.4s for two
    # sites, concurrent should take roughly one call's worth. This is what
    # actually broke page-load time for real: NYC's agent was unreachable
    # for days, and every /api/state call used to pay its full timeout on
    # top of every other site's, one after another.
    #
    # settings is a frozen dataclass instance -- can't monkeypatch an
    # attribute on it directly, so replace grpc_client's whole module-level
    # `settings` name with a stand-in instead.
    class FakeSettings:
        agent_hosts = {"nyc": "nyc-host", "rambles": "rambles-host"}
        agent_port = 9090

    monkeypatch.setattr(grpc_client, "settings", FakeSettings())

    def fake_get_state(host):
        time.sleep(0.2)
        return host

    monkeypatch.setattr(grpc_client, "get_state", fake_get_state)

    start = time.monotonic()
    result = grpc_client.get_all_states()
    elapsed = time.monotonic() - start

    assert result == {"nyc": "nyc-host", "rambles": "rambles-host"}
    assert elapsed < 0.35
