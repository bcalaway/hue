import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# grpc_tools.protoc's generated *_pb2_grpc.py does a bare `import
# agent_service_pb2`, not a relative/package import, regardless of where
# the generated files actually live -- a well-known quirk of the Python
# gRPC codegen. Adding the generated directory to sys.path lets that bare
# import resolve, without needing PYTHONPATH set externally.
sys.path.insert(0, str(Path(__file__).parent / "generated"))

import grpc  # noqa: E402

from app.config import settings  # noqa: E402
from app.generated import agent_service_pb2, agent_service_pb2_grpc  # noqa: E402

# A live agent on the same LAN responds in well under a second; this just
# bounds how long a genuinely unreachable one (e.g. a site's WireGuard
# tunnel being down) can hold up a request.
_TIMEOUT_SECONDS = 3


def get_state(host: str) -> agent_service_pb2.GetStateResponse | None:
    # No host configured means this site isn't pointed at a real agent yet
    # (e.g. before that site's NUC deploy exists) -- degrade to "no data"
    # instead of crashing.
    if not host:
        return None
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            return stub.GetState(agent_service_pb2.GetStateRequest(), timeout=_TIMEOUT_SECONDS)
    except grpc.RpcError:
        return None


def get_all_states() -> dict[str, agent_service_pb2.GetStateResponse | None]:
    # Concurrent, not sequential -- one unreachable site (its own bounded
    # _TIMEOUT_SECONDS wait) used to add straight onto every other site's
    # wait too, so a single dead agent made every page load pay for all of
    # them one after another instead of just the slowest one.
    with ThreadPoolExecutor(max_workers=max(len(settings.agent_hosts), 1)) as pool:
        futures = {site: pool.submit(get_state, host) for site, host in settings.agent_hosts.items()}
        return {site: future.result() for site, future in futures.items()}


def set_light_state(host: str, light_id: str, on: bool) -> tuple[bool, str]:
    if not host:
        return False, "site has no agent configured"
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            response = stub.SetLightState(
                agent_service_pb2.SetLightStateRequest(light_id=light_id, on=on), timeout=_TIMEOUT_SECONDS
            )
            return response.ok, response.error
    except grpc.RpcError as exc:
        return False, exc.details() or "agent unreachable"


def activate_scene(host: str, scene_id: str, duration_ms: int = 0) -> tuple[bool, str]:
    # duration_ms=0 (the default, used by the manual "click a scene chip"
    # path) omits CLIP v2's recall.duration -- the bridge's own default
    # transition. animator.py passes a real value so animations crossfade.
    if not host:
        return False, "site has no agent configured"
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            request = agent_service_pb2.ActivateSceneRequest(scene_id=scene_id, duration_ms=duration_ms)
            response = stub.ActivateScene(request, timeout=_TIMEOUT_SECONDS)
            return response.ok, response.error
    except grpc.RpcError as exc:
        return False, exc.details() or "agent unreachable"


def set_grouped_light_state(host: str, grouped_light_id: str, on: bool) -> tuple[bool, str]:
    if not host:
        return False, "site has no agent configured"
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            request = agent_service_pb2.SetGroupedLightStateRequest(grouped_light_id=grouped_light_id, on=on)
            response = stub.SetGroupedLightState(request, timeout=_TIMEOUT_SECONDS)
            return response.ok, response.error
    except grpc.RpcError as exc:
        return False, exc.details() or "agent unreachable"
