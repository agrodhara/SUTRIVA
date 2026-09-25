from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimitExceededError(Exception):
    """Raised when a source (identified by an opaque key, typically a client IP) has made more pilot-
    endpoint calls than allowed in the current window."""


class FixedWindowRateLimiter:
    """A minimal, process-local, in-memory rate limiter.

    This is a source-level abuse control layered on top of the per-registration and per-phone-number
    limits enforced in app/services/pilot.py — it exists to stop one source from working around those
    limits by rotating through many different phone numbers or registrations, not to replace them.

    It is intentionally simple and has a real limitation: state is per-process and in-memory, so it is not
    shared across multiple API instances. A deployment running more than one instance needs a shared store
    (e.g. Redis) or an edge/WAF-level limiter in front of it before this protection means anything at that
    scale — this is called out explicitly as a prerequisite in the PR description, not silently assumed
    away.
    """

    def __init__(self, *, window_seconds: float) -> None:
        self._window_seconds = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, *, max_events: int) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            cutoff = now - self._window_seconds
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= max_events:
                raise RateLimitExceededError()
            hits.append(now)

    def reset(self) -> None:
        """Test-only: clears all recorded hits so module-level limiter singletons don't leak state
        between test cases that happen to share a source key (e.g. every TestClient request uses the same
        client host)."""
        with self._lock:
            self._hits.clear()
