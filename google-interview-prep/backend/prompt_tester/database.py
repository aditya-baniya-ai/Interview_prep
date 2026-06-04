"""
Database setup for Prompt Engineering Tester.
Uses SQLite for MVP. Swap path: replace the engine URL with
a PostgreSQL DSN (e.g. from env) and remove the connect_args for production.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

SQLALCHEMY_DATABASE_URL = "sqlite:///./prompt_tester.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite + threading
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Safe to call multiple times (CREATE TABLE IF NOT EXISTS)."""
    # Import models so SQLAlchemy sees them before create_all
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
