import asyncio
import logging

from app.config import settings
from app.grpc_client import activate_scene

log = logging.getLogger("hue.animator")

# One asyncio task per running animation, keyed by its Animation.id. This is
# the only place "is animation N actually looping right now" lives -- the
# database's `enabled` column is the durable "should it be running" intent,
# rebuilt into real tasks on every hub startup (see main.py's lifespan),
# since a running task can't itself survive a redeploy.
_tasks: dict[int, asyncio.Task] = {}


def _fade_duration_ms(interval_seconds: int) -> int:
    # The fade spans the whole cycle, not just a portion of it -- a 200ms
    # margin before the *next* flip fires so the bridge has processed the
    # current transition before the next PUT lands on top of it, floored at
    # 200ms itself so a very short interval doesn't go negative.
    return max(200, interval_seconds * 1000 - 200)


async def _run(animation_id: int, site: str, scene_a_id: str, scene_b_id: str, interval_seconds: int) -> None:
    host = settings.agent_hosts.get(site, "")
    duration_ms = _fade_duration_ms(interval_seconds)
    flip = False
    while True:
        scene_id = scene_b_id if flip else scene_a_id
        # Blocking gRPC call offloaded to a thread so it doesn't stall the
        # event loop -- grpc_client's stubs are sync, matching every other
        # caller in this app (the request-handling endpoints run sync too,
        # FastAPI's own threadpool handles those).
        ok, error = await asyncio.to_thread(activate_scene, host, scene_id, duration_ms)
        if not ok:
            log.warning("animation %d: activate_scene(%s) failed: %s", animation_id, scene_id, error)
        flip = not flip
        await asyncio.sleep(interval_seconds)


def start(animation_id: int, site: str, scene_a_id: str, scene_b_id: str, interval_seconds: int) -> None:
    if animation_id in _tasks:
        return
    _tasks[animation_id] = asyncio.create_task(_run(animation_id, site, scene_a_id, scene_b_id, interval_seconds))


def stop(animation_id: int) -> None:
    task = _tasks.pop(animation_id, None)
    if task:
        task.cancel()


def stop_all() -> None:
    for animation_id in list(_tasks):
        stop(animation_id)


def is_running(animation_id: int) -> bool:
    return animation_id in _tasks
