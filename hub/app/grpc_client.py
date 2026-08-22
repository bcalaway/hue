import sys
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


def get_state(host: str) -> agent_service_pb2.GetStateResponse | None:
    # No host configured means this site isn't pointed at a real agent yet
    # (e.g. before that site's NUC deploy exists) -- degrade to "no data"
    # instead of crashing.
    if not host:
        return None
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            return stub.GetState(agent_service_pb2.GetStateRequest(), timeout=5)
    except grpc.RpcError:
        return None


def get_all_states() -> dict[str, agent_service_pb2.GetStateResponse | None]:
    return {site: get_state(host) for site, host in settings.agent_hosts.items()}


def set_light_state(host: str, light_id: str, on: bool) -> tuple[bool, str]:
    if not host:
        return False, "site has no agent configured"
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            response = stub.SetLightState(
                agent_service_pb2.SetLightStateRequest(light_id=light_id, on=on), timeout=5
            )
            return response.ok, response.error
    except grpc.RpcError as exc:
        return False, exc.details() or "agent unreachable"


def activate_scene(host: str, scene_id: str) -> tuple[bool, str]:
    if not host:
        return False, "site has no agent configured"
    try:
        with grpc.insecure_channel(f"{host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            request = agent_service_pb2.ActivateSceneRequest(scene_id=scene_id)
            response = stub.ActivateScene(request, timeout=5)
            return response.ok, response.error
    except grpc.RpcError as exc:
        return False, exc.details() or "agent unreachable"
