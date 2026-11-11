import io
import zipfile

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.db import get_sessionmaker
from app.models import AdminAuditLog, User

from .conftest import make_client, signup


async def _make_admin(email: str) -> None:
    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        user.is_admin = True
        await db.commit()


@pytest.fixture
async def admin():
    async with make_client() as c:
        me = await signup(c, "Admin")
        await _make_admin(me["email"])
        c.me = me
        yield c


@pytest.fixture
async def member():
    async with make_client() as c:
        c.me = await signup(c, "Member")
        yield c


async def test_non_admins_cannot_see_admin_api(member, anon):
    for path in ("/api/admin/overview", "/api/admin/users", "/api/admin/messages", "/api/admin/audit"):
        assert (await member.get(path)).status_code == 404
        assert (await anon.get(path)).status_code == 401
    me = (await member.get("/api/auth/me")).json()
    assert me["is_admin"] is False


async def test_user_list_shows_counts_not_content(admin, member):
    app = (await member.post("/api/applications", json={"company_name": "Secret Co", "job_role": "SRE"})).json()
    await member.post("/api/questions", json={"application_id": app["application_id"], "question": "Private question?"})

    page = (await admin.get("/api/admin/users", params={"q": member.me["email"]})).json()
    assert page["total"] == 1
    row = page["items"][0]
    assert row["applications"] == 1 and row["questions"] == 1 and row["is_admin"] is False
    assert "Secret Co" not in str(page) and "Private question" not in str(page)

    detail = (await admin.get(f"/api/admin/users/{member.me['user_id']}")).json()
    assert detail["active_sessions"] == 1 and detail["active_days_30"] == 1 and detail["last_login_at"]


async def test_disable_blocks_login_and_ends_sessions(admin, member):
    uid = member.me["user_id"]
    assert (await admin.post(f"/api/admin/users/{uid}/disable")).status_code == 204
    assert (await member.get("/api/auth/me")).status_code == 401

    async with make_client() as again:
        r = await again.post("/api/auth/login", json={"email": member.me["email"], "password": member.me["password"]})
        assert r.status_code == 403 and r.json()["detail"] == "account_disabled"
        wrong = await again.post("/api/auth/login", json={"email": member.me["email"], "password": "not-the-password"})
        assert wrong.status_code == 401

        assert (await admin.post(f"/api/admin/users/{uid}/enable")).status_code == 204
        r = await again.post("/api/auth/login", json={"email": member.me["email"], "password": member.me["password"]})
        assert r.status_code == 200


async def test_sign_out_user(admin, member):
    assert (await admin.post(f"/api/admin/users/{member.me['user_id']}/signout")).status_code == 204
    assert (await member.get("/api/auth/me")).status_code == 401


async def test_admin_guardrails(admin, member):
    me = admin.me["user_id"]
    for method, path in (("post", "disable"), ("post", "signout"), ("delete", "admin")):
        r = await getattr(admin, method)(f"/api/admin/users/{me}/{path}")
        assert r.status_code == 409 and r.json()["detail"] == "cannot_target_self"
    r = await admin.request("DELETE", f"/api/admin/users/{me}", json={"confirm_email": admin.me["email"]})
    assert r.status_code == 409

    uid = member.me["user_id"]
    assert (await admin.post(f"/api/admin/users/{uid}/admin")).status_code == 204
    assert (await member.get("/api/auth/me")).json()["is_admin"] is True
    assert (await admin.post(f"/api/admin/users/{uid}/disable")).json()["detail"] == "remove_admin_first"
    assert (await admin.delete(f"/api/admin/users/{uid}/admin")).status_code == 204
    assert (await member.get("/api/admin/overview")).status_code == 404


async def test_admin_actions_need_csrf(admin, member):
    r = await admin.post(f"/api/admin/users/{member.me['user_id']}/disable", headers={"X-CSRF-Token": "nope"})
    assert r.status_code == 403


async def test_delete_user_requires_matching_email(admin, member):
    uid = member.me["user_id"]
    app = (await member.post("/api/applications", json={"company_name": "A", "job_role": "B"})).json()
    rnd = (await member.post("/api/rounds", json={"application_id": app["application_id"], "round_name": "R1"})).json()
    up = await member.post("/api/attachments", data={"round_id": rnd["round_id"]}, files={"file": ("n.txt", b"notes", "text/plain")})
    assert up.status_code == 201
    user_dir = get_settings().storage_dir / uid
    assert user_dir.exists()

    bad = await admin.request("DELETE", f"/api/admin/users/{uid}", json={"confirm_email": "wrong@example.com"})
    assert bad.status_code == 422
    ok = await admin.request("DELETE", f"/api/admin/users/{uid}", json={"confirm_email": member.me["email"].upper()})
    assert ok.status_code == 204
    assert (await admin.get(f"/api/admin/users/{uid}")).status_code == 404
    assert not user_dir.exists()

    async with get_sessionmaker()() as db:
        actions = [a.action for a in await db.scalars(select(AdminAuditLog).where(AdminAuditLog.target_user_id == uid))]
    assert "delete_user" in actions
    audit = (await admin.get("/api/admin/audit")).json()
    assert any(e["action"] == "delete_user" and e["target_email"] == member.me["email"] for e in audit)


async def test_overview_and_downloads(admin, member, anon):
    await member.post("/api/applications", json={"company_name": "X", "job_role": "Y", "application_status": "Offer Received"})

    apk = get_settings().android_apk_path
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("AndroidManifest.xml", b"m")
    apk.parent.mkdir(parents=True, exist_ok=True)
    apk.write_bytes(buf.getvalue())
    assert (await member.get("/api/downloads/android")).status_code == 403
    assert (await admin.post(f"/api/admin/app-access/{member.me['user_id']}/approve")).status_code == 204
    url = (await member.get("/api/downloads/android")).json()["url"]
    before = (await admin.get("/api/admin/overview")).json()
    await member.get(url)
    await member.get(url)
    await member.get(url, headers={"Range": "bytes=10-"})
    apk.unlink()

    o = (await admin.get("/api/admin/overview", params={"days": 7})).json()
    assert o["downloads_total"] == before["downloads_total"] + 2
    assert o["downloaders"] == before["downloaders"] + 1

    page = (await admin.get("/api/admin/users", params={"filter": "downloaded", "sort": "download_desc"})).json()
    row = next(u for u in page["items"] if u["user_id"] == member.me["user_id"])
    assert row["apk_downloads"] == 2 and row["last_download_at"]
    assert all(u["apk_downloads"] > 0 for u in page["items"])
    assert len(o["series"]) == 7 and o["series"][-1]["signups"] >= 2 and o["series"][-1]["active"] >= 2
    assert o["users_total"] >= 2 and o["admins"] >= 1 and o["dau"] >= 2
    assert o["offers"] >= 1 and any(c["label"] == "Offer Received" for c in o["status_distribution"])


async def test_contact_inbox(admin, anon):
    await anon.post("/api/contact", json={"name": "Asha", "email": "asha@example.com", "topic": "Feedback", "message": "Love the app, thanks!"})
    unread = (await admin.get("/api/admin/messages", params={"filter": "unread"})).json()
    msg = next(m for m in unread if m["email"] == "asha@example.com")
    assert (await admin.post(f"/api/admin/messages/{msg['message_id']}/read", json={"read": True})).status_code == 204
    unread = (await admin.get("/api/admin/messages", params={"filter": "unread"})).json()
    assert all(m["message_id"] != msg["message_id"] for m in unread)
    assert (await admin.delete(f"/api/admin/messages/{msg['message_id']}")).status_code == 204


async def test_app_access_approval(admin, member):
    uid = member.me["user_id"]
    for path in ("/api/admin/app-access", f"/api/admin/app-access/{uid}/approve"):
        r = await (member.get(path) if path.endswith("access") else member.post(path))
        assert r.status_code == 404

    await member.post("/api/downloads/access", json={"note": "Pixel 8"})
    assert (await admin.get("/api/admin/badges")).json()["pending_access"] >= 1
    pending = (await admin.get("/api/admin/app-access")).json()
    req = next(p for p in pending if p["user_id"] == uid)
    assert req["note"] == "Pixel 8" and req["email"] == member.me["email"]
    assert (await admin.get(f"/api/admin/users/{uid}")).json()["app_access"] == "pending"

    assert (await admin.post(f"/api/admin/app-access/{uid}/approve")).status_code == 204
    assert (await member.get("/api/downloads/access")).json()["status"] == "approved"
    assert (await member.get("/api/downloads/android")).status_code == 200
    approved = (await admin.get("/api/admin/app-access", params={"filter": "approved"})).json()
    assert any(a["user_id"] == uid and a["decided_by"] == admin.me["email"] for a in approved)

    assert (await admin.post(f"/api/admin/app-access/{uid}/reject")).status_code == 204
    assert (await member.get("/api/downloads/android")).status_code == 403
    assert (await member.get("/api/downloads/access")).json()["status"] == "rejected"
    assert (await member.post("/api/downloads/access", json={})).json()["status"] == "pending"

    actions = [e["action"] for e in (await admin.get("/api/admin/audit")).json() if e["target_email"] == member.me["email"]]
    assert "approve_app_access" in actions and "revoke_app_access" in actions


async def test_admins_always_have_app_access(admin):
    assert (await admin.get("/api/downloads/access")).json()["status"] == "approved"
