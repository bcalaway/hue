from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Animation(Base):
    __tablename__ = "animations"

    id = Column(Integer, primary_key=True, index=True)
    site = Column(String, nullable=False)
    room_id = Column(String, nullable=False)
    room_name = Column(String, nullable=False)  # display label only, snapshotted at creation
    scene_a_id = Column(String, nullable=False)
    scene_a_name = Column(String, nullable=False)
    scene_b_id = Column(String, nullable=False)
    scene_b_name = Column(String, nullable=False)
    interval_seconds = Column(Integer, nullable=False)
    # The durable "should this be running" flag -- the actual asyncio task
    # driving the loop lives only in the hub process's memory (app.animator)
    # and is rebuilt from every enabled=true row on startup, since a running
    # task can't itself survive a redeploy.
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
