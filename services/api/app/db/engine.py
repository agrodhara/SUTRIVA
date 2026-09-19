from __future__ import annotations

from dataclasses import dataclass
from hashlib import blake2b
from threading import Lock

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.db.config import DatabaseSettings, require_database_url


_ENGINE: Engine | None = None
_ENGINE_KEY: "EngineKey" | None = None
_ENGINE_LOCK = Lock()


@dataclass(frozen=True, repr=False)
class EngineKey:
    url_fingerprint: str
    pool_size: int
    max_overflow: int
    pool_timeout: int
    pool_recycle: int
    connect_timeout: int

    def __repr__(self) -> str:
        return (
            "EngineKey("
            f"url_fingerprint={self.url_fingerprint[:12]}..., "
            f"pool_size={self.pool_size}, "
            f"max_overflow={self.max_overflow}, "
            f"pool_timeout={self.pool_timeout}, "
            f"pool_recycle={self.pool_recycle}, "
            f"connect_timeout={self.connect_timeout}"
            ")"
        )

    __str__ = __repr__


def _settings_key(settings: DatabaseSettings) -> EngineKey:
    url = require_database_url(settings)
    fingerprint = blake2b(url.encode("utf-8"), digest_size=20).hexdigest()
    return EngineKey(
        url_fingerprint=fingerprint,
        pool_size=settings.pool_size,
        max_overflow=settings.max_overflow,
        pool_timeout=settings.pool_timeout,
        pool_recycle=settings.pool_recycle,
        connect_timeout=settings.connect_timeout,
    )


def _build_engine(settings: DatabaseSettings) -> Engine:
    return create_engine(
        require_database_url(settings),
        pool_pre_ping=True,
        pool_size=settings.pool_size,
        max_overflow=settings.max_overflow,
        pool_timeout=settings.pool_timeout,
        pool_recycle=settings.pool_recycle,
        connect_args={"connect_timeout": settings.connect_timeout},
        future=True,
    )


def get_engine(settings: DatabaseSettings) -> Engine:
    global _ENGINE, _ENGINE_KEY

    key = _settings_key(settings)
    with _ENGINE_LOCK:
        if _ENGINE is None:
            _ENGINE = _build_engine(settings)
            _ENGINE_KEY = key
            return _ENGINE

        if _ENGINE_KEY != key:
            _ENGINE.dispose()
            _ENGINE = _build_engine(settings)
            _ENGINE_KEY = key
        return _ENGINE


def dispose_engine() -> None:
    global _ENGINE, _ENGINE_KEY

    with _ENGINE_LOCK:
        if _ENGINE is not None:
            _ENGINE.dispose()
        _ENGINE = None
        _ENGINE_KEY = None
