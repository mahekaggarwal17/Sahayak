from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status
from fastapi.security import HTTPBearer

from .config import Settings


class RateLimiter:
    def __init__(self, requests_per_minute: int) -> None:
        self._limit = requests_per_minute
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and now - events[0] >= 60:
                events.popleft()
            if len(events) >= self._limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Request rate limit exceeded.",
                )
            events.append(now)


def build_authorizer(settings: Settings):
    bearer = HTTPBearer(auto_error=False)
    limiter = RateLimiter(settings.requests_per_minute)

    async def authorize(
        request: Request,
    ) -> None:
        credentials = await bearer(request)
        if (
            credentials is None
            or credentials.scheme.lower() != "bearer"
            or not hmac.compare_digest(credentials.credentials, settings.quickstart_app_token)
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        client_host = request.client.host if request.client else "unknown"
        limiter.check(client_host)

    return authorize
