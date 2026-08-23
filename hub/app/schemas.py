from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SceneRef(BaseModel):
    id: str
    name: str


class AnimationCreate(BaseModel):
    room_id: str
    room_name: str
    # At least 2 -- a one-scene "rotation" isn't an animation, and the
    # crossfade loop (animator.py) assumes there's always a "next" scene
    # distinct from the current one.
    scenes: list[SceneRef] = Field(min_length=2)
    interval_seconds: int


class AnimationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site: str
    room_id: str
    room_name: str
    scenes: list[SceneRef]
    interval_seconds: int
    enabled: bool
    created_at: datetime
