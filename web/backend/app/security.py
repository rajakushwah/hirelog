import hashlib
import secrets
import time
from collections import deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Argon2id with the library's RFC 9106 low-memory profile defaults.
_hasher = PasswordHasher()
# Verified against when the email is unknown so both paths cost the same time (no account enumeration by timing).
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_token() -> str:
    """256-bit CSPRNG token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode(), b.encode())


class RateLimiter:
    """Sliding-window limiter kept in process memory.

    Fine for a single API process. When running several workers or hosts, back this with Redis so limits are shared.
    """

    def __init__(self, max_keys: int = 50_000) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._max_keys = max_keys

    def allow(self, key: str, limit: int, window_s: float) -> bool:
        now = time.monotonic()
        q = self._hits.get(key)
        if q is None:
            if len(self._hits) >= self._max_keys:
                self._prune(now, window_s)
            q = self._hits[key] = deque()
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

    def _prune(self, now: float, window_s: float) -> None:
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] > window_s]:
            del self._hits[k]
        if len(self._hits) >= self._max_keys:
            self._hits.clear()

    def reset(self) -> None:
        self._hits.clear()


limiter = RateLimiter()
