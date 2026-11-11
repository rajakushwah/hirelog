from .conftest import make_client, signup


async def test_register_login_me_logout(anon):
    user = await signup(anon)
    assert "password_hash" not in user
    me = await anon.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == user["email"]
    assert me.json()["has_password"] is True

    assert (await anon.post("/api/auth/logout")).status_code == 204
    assert (await anon.get("/api/auth/me")).status_code == 401

    r = await anon.post("/api/auth/login", json={"email": user["email"].upper(), "password": user["password"]})
    assert r.status_code == 200
    assert (await anon.get("/api/auth/me")).status_code == 200


async def test_session_cookie_flags(anon):
    email = "flags@example.com"
    r = await anon.post("/api/auth/register", json={"name": "F", "email": email, "password": "abcdefgh1"})
    cookies = r.headers.get_list("set-cookie")
    session = next(c for c in cookies if c.startswith("hl_session="))
    assert "HttpOnly" in session and "SameSite=lax" in session
    csrf = next(c for c in cookies if c.startswith("hl_csrf="))
    assert "HttpOnly" not in csrf and "SameSite=strict" in csrf


async def test_login_errors_are_generic(anon):
    user = await signup(anon)
    wrong = await anon.post("/api/auth/login", json={"email": user["email"], "password": "nope-nope"})
    missing = await anon.post("/api/auth/login", json={"email": "nobody@example.com", "password": "nope-nope"})
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json() == {"detail": "invalid_credentials"}


async def test_duplicate_registration_and_short_password(anon):
    user = await signup(anon)
    async with make_client() as c:
        dup = await c.post("/api/auth/register", json={"name": "X", "email": user["email"], "password": "abcdefgh"})
        assert dup.status_code == 409
        short = await c.post("/api/auth/register", json={"name": "X", "email": "s@example.com", "password": "short"})
        assert short.status_code == 422


async def test_login_rate_limited(anon):
    user = await signup(anon)
    codes = [
        (await anon.post("/api/auth/login", json={"email": user["email"], "password": "wrong-pass"})).status_code
        for _ in range(12)
    ]
    assert codes[-1] == 429


async def test_csrf_required_for_mutations(client):
    r = await client.post(
        "/api/applications", json={"company_name": "A", "job_role": "B"}, headers={"X-CSRF-Token": "forged"}
    )
    assert r.status_code == 403 and r.json()["detail"] == "csrf_failed"
    client.cookies.delete("hl_csrf")
    r = await client.post("/api/applications", json={"company_name": "A", "job_role": "B"})
    assert r.status_code == 403


async def test_cross_origin_post_rejected(client):
    r = await client.post(
        "/api/applications", json={"company_name": "A", "job_role": "B"}, headers={"Origin": "https://evil.example"}
    )
    assert r.status_code == 403 and r.json()["detail"] == "bad_origin"
    r = await client.post(
        "/api/applications", json={"company_name": "A", "job_role": "B"}, headers={"Origin": "http://testserver"}
    )
    assert r.status_code == 201


async def test_logout_all_and_delete_account(client):
    assert (await client.post("/api/auth/logout-all")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401

    async with make_client() as c:
        await signup(c)
        await c.post("/api/applications", json={"company_name": "A", "job_role": "B"})
        assert (await c.request("DELETE", "/api/auth/me", json={"confirm": "nope"})).status_code == 422
        assert (await c.request("DELETE", "/api/auth/me", json={"confirm": "DELETE"})).status_code == 204
        assert (await c.get("/api/auth/me")).status_code == 401


async def test_security_headers(client):
    r = await client.get("/api/auth/me")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"


async def test_untrusted_host_rejected(anon):
    r = await anon.get("/api/health", headers={"Host": "evil.example"})
    assert r.status_code == 400


async def test_auth_config(anon):
    r = await anon.get("/api/auth/config")
    assert r.json() == {"google_enabled": False, "registration_enabled": True}
