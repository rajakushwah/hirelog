from sqlalchemy import func, select

from app.db import get_sessionmaker
from app.models import ContactMessage

MSG = {"name": "Asha", "email": "asha@example.com", "topic": "Careers", "message": "I'd love to join the team!"}


async def _count() -> int:
    async with get_sessionmaker()() as db:
        return await db.scalar(select(func.count()).select_from(ContactMessage))


async def test_contact_saves_message_without_login(anon):
    before = await _count()
    r = await anon.post("/api/contact", json=MSG)
    assert r.status_code == 202 and r.content == b""
    assert await _count() == before + 1


async def test_contact_honeypot_is_silently_dropped(anon):
    before = await _count()
    r = await anon.post("/api/contact", json={**MSG, "website": "http://spam.example"})
    assert r.status_code == 202
    assert await _count() == before


async def test_contact_validation(anon):
    for bad in ({**MSG, "email": "nope"}, {**MSG, "topic": "Hack"}, {**MSG, "message": "hi"}, {**MSG, "extra": 1}):
        assert (await anon.post("/api/contact", json=bad)).status_code == 422


async def test_contact_rate_limited_and_origin_checked(anon):
    codes = [(await anon.post("/api/contact", json={**MSG, "email": f"u{i}@example.com"})).status_code for i in range(6)]
    assert codes[:5] == [202] * 5 and codes[5] == 429
    r = await anon.post("/api/contact", json=MSG, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
