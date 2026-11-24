"""A small "how many requests per user" limiter.

Each user (identified by their IP address) may ask for recipes at most
``per_minute`` times per minute and ``per_day`` times per 24 hours. This
protects your Gemini quota. Counts live in memory, so they reset when the
server restarts, which is fine for a personal app.
"""

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

MINUTE = 60
DAY = 24 * 60 * 60


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0  # seconds until the next request is allowed


class RateLimiter:
    def __init__(self, per_minute: int, per_day: int, clock=time.monotonic):
        self.per_minute = per_minute
        self.per_day = per_day
        self._clock = clock
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_cleanup = clock()

    def hit(self, key: str) -> RateLimitResult:
        """Record one request for ``key`` if it is allowed."""
        now = self._clock()
        with self._lock:
            self._cleanup(now)
            hits = self._hits[key]
            while hits and now - hits[0] >= DAY:
                hits.popleft()

            if len(hits) >= self.per_day:
                return RateLimitResult(False, _seconds(hits[0] + DAY - now))

            recent = [t for t in hits if now - t < MINUTE]
            if len(recent) >= self.per_minute:
                return RateLimitResult(False, _seconds(recent[0] + MINUTE - now))

            hits.append(now)
            return RateLimitResult(True)

    def _cleanup(self, now: float) -> None:
        # Forget users who have been quiet for a day, at most once an hour.
        if now - self._last_cleanup < 3600:
            return
        self._last_cleanup = now
        for key in [k for k, h in self._hits.items() if not h or now - h[-1] >= DAY]:
            del self._hits[key]


def _seconds(value: float) -> int:
    return max(1, int(value + 0.999))
