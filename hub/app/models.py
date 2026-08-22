from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Animation(Base):
    __tablename__ = "animations"
    # At most one animation per room -- two running animations targeting
    # the same room would just fight each other, each overriding the
    # other's scene on its own schedule with no coherent result. Creating a
    # second one for a room replaces the first rather than stacking (see
    # main.py's api_create_animation upsert).
    __table_args__ = (UniqueConstraint("site", "room_id", name="uq_animations_site_room"),)

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
