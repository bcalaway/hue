import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base


@pytest.fixture()
def client():
    # Fresh in-memory SQLite per test -- exercises the real animations
    # CRUD/ORM code path (not just the "DB unconfigured" degradation
    # covered in test_main.py) without needing a live Postgres instance.
    # StaticPool is required, not optional, for an in-memory SQLite DB used
    # across threads (FastAPI's TestClient runs sync endpoints in a
    # threadpool) -- without it each connection checkout gets its own
    # empty :memory: database, and create_all()'s tables "disappear".
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # `with TestClient(app) as c:` (not a bare TestClient(app)) -- needed so
    # the app's lifespan actually runs: its shutdown phase calls
    # animator.stop_all(), which cancels any animation task a test spawned.
    # Without it, background tasks from one test would keep running into
    # the next (animator._tasks is module-level state shared across the
    # whole test process).
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
