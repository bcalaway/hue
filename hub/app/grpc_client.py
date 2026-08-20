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


def get_state() -> agent_service_pb2.GetStateResponse | None:
    # No AGENT_HOST configured means this app isn't pointed at a real agent
    # yet (e.g. before the NUC deploy exists) -- degrade to "no data"
    # instead of crashing.
    if not settings.agent_host:
        return None
    try:
        with grpc.insecure_channel(f"{settings.agent_host}:{settings.agent_port}") as channel:
            stub = agent_service_pb2_grpc.AgentServiceStub(channel)
            return stub.GetState(agent_service_pb2.GetStateRequest(), timeout=5)
    except grpc.RpcError:
        return None
