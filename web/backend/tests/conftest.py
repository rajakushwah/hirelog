import os
import tempfile
import uuid
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="hirelog-test-"))
os.environ.update({
    "HIRELOG_ENV": "test",
    "HIRELOG_DATABASE_URL": f"sqlite+aiosqlite:///{_TMP / 'test.db'}",
    "HIRELOG_STORAGE_DIR": str(_TMP / "uploads"),
    "HIRELOG_MAX_UPLOAD_MB": "1",
    "HIRELOG_ALLOWED_HOSTS": '["testserver"]',
    "HIRELOG_PUBLIC_ORIGIN": "http://testserver",
    "HIRELOG_FRONTEND_DIST": str(_TMP / "no-dist"),
    "HIRELOG_ANDROID_APK_PATH": str(_TMP / "downloads" / "hirelog.apk"),
    "HIRELOG_ANDROID_VERSION": "1.0.0-beta",
})

import httpx  # noqa: E402

from app.main import app, run_migrations  # noqa: E402
from app.security import limiter  # noqa: E402
from app.storage import get_storage  # noqa: E402

run_migrations()
get_storage()


@pytest.fixture(autouse=True)
def _reset_limits():
    limiter.reset()
    yield


class Client(httpx.AsyncClient):
    """Test client that behaves like the SPA: echoes the CSRF cookie in the X-CSRF-Token header."""

    async def request(self, method, url, **kw):
        headers = dict(kw.pop("headers", None) or {})
        csrf = self.cookies.get("hl_csrf")
        if csrf and method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            headers.setdefault("X-CSRF-Token", csrf)
        return await super().request(method, url, headers=headers, **kw)


def make_client() -> Client:
    return Client(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


async def signup(client: Client, name: str = "Test User") -> dict:
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/auth/register", json={"name": name, "email": email, "password": "correct horse battery"})
    assert r.status_code == 201, r.text
    return {**r.json(), "password": "correct horse battery"}


@pytest.fixture
async def client():
    async with make_client() as c:
        await signup(c)
        yield c


@pytest.fixture
async def other():
    async with make_client() as c:
        await signup(c, "Other User")
        yield c


@pytest.fixture
async def anon():
    async with make_client() as c:
        yield c
