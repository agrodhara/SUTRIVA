from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy.orm import Session, sessionmaker

from app.db.config import DatabaseSettings
from app.db.engine import get_engine


def get_session_factory(settings: DatabaseSettings) -> sessionmaker[Session]:
    engine = get_engine(settings)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@contextmanager
def session_scope(settings: DatabaseSettings) -> Generator[Session, None, None]:
    session = get_session_factory(settings)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
