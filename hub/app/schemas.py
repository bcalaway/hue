from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AnimationCreate(BaseModel):
    room_id: str
    room_name: str
    scene_a_id: str
    scene_a_name: str
    scene_b_id: str
    scene_b_name: str
    interval_seconds: int


class AnimationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site: str
    room_id: str
    room_name: str
    scene_a_id: str
    scene_a_name: str
    scene_b_id: str
    scene_b_name: str
    interval_seconds: int
    enabled: bool
    created_at: datetime
