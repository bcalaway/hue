from collections.abc import Generator

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

# No password configured means this app hasn't been onboarded to Postgres
# yet (docs/app-platform.md in nyc_pa_aws_gitops) -- a valid state, not an
# error, so callers get a clean response instead of a crash.
_engine = None
if settings.postgres_password:
    _url = (
        f"postgresql+psycopg2://{settings.app_name}:{settings.postgres_password}"
        f"@{settings.postgres_host}:5432/{settings.app_name}"
    )
    _engine = create_engine(_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine) if _engine else None


def create_tables() -> None:
    if _engine is not None:
        from app.models import Base

        Base.metadata.create_all(bind=_engine)


def get_db() -> Generator:
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
