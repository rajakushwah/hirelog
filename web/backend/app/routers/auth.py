import base64
import hashlib
import logging
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select

from ..config import get_settings
from ..deps import DB, CurrentSession, CurrentUser, clear_session_cookies, client_ip, start_session
from ..models import User, UserSession
from ..schemas import AuthConfigOut, DeleteAccountIn, LoginIn, RegisterIn, UserOut
from ..security import hash_password, limiter, needs_rehash, tokens_equal, verify_password
from ..storage import get_storage

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")
_jwks = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True, lifespan=3600)
_OAUTH_COOKIE = "hl_oauth"


def _throttle(key: str, limit: int, window_s: float) -> None:
    if not limiter.allow(key, limit, window_s):
        raise HTTPException(status_code=429, detail="too_many_requests")


@router.get("/config", response_model=AuthConfigOut)
async def auth_config() -> AuthConfigOut:
    s = get_settings()
    return AuthConfigOut(google_enabled=s.google_enabled, registration_enabled=s.allow_registration)


@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: RegisterIn, request: Request, response: Response, db: DB) -> User:
    if not get_settings().allow_registration:
        raise HTTPException(status_code=403, detail="registration_disabled")
    _throttle(f"register:{client_ip(request)}", 5, 3600)
    email = payload.email.lower()
    if not email:
        raise HTTPException(status_code=422, detail="email_required")
    if await db.scalar(select(func.count()).select_from(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="registration_failed")
    user = User(email=email, name=payload.name, password_hash=await run_in_threadpool(hash_password, payload.password))
    db.add(user)
    await db.flush()
    await start_session(db, response, request, user)
    log.info("auth.register user=%s", user.user_id)
    return user


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, request: Request, response: Response, db: DB) -> User:
    email = payload.email.lower()
    _throttle(f"login-ip:{client_ip(request)}", 20, 300)
    _throttle(f"login-email:{email}", 10, 900)
    user = await db.scalar(select(User).where(User.email == email))
    ok = await run_in_threadpool(verify_password, user.password_hash if user else None, payload.password)
    if not user or not ok:
        log.info("auth.login_failed ip=%s", client_ip(request))
        raise HTTPException(status_code=401, detail="invalid_credentials")
    if needs_rehash(user.password_hash or ""):
        user.password_hash = await run_in_threadpool(hash_password, payload.password)
    await start_session(db, response, request, user)
    log.info("auth.login user=%s", user.user_id)
    return user


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user


@router.post("/logout", status_code=204)
async def logout(sess: CurrentSession, response: Response, db: DB) -> Response:
    await db.delete(sess)
    await db.commit()
    clear_session_cookies(response)
    response.status_code = 204
    return response


@router.post("/logout-all", status_code=204)
async def logout_all(sess: CurrentSession, response: Response, db: DB) -> Response:
    await db.execute(delete(UserSession).where(UserSession.user_id == sess.user_id))
    await db.commit()
    clear_session_cookies(response)
    response.status_code = 204
    return response


@router.delete("/me", status_code=204)
async def delete_account(payload: DeleteAccountIn, user: CurrentUser, response: Response, db: DB) -> Response:
    uid = user.user_id
    await db.delete(user)
    await db.commit()
    get_storage().delete_prefix(uid)
    clear_session_cookies(response)
    log.info("auth.account_deleted user=%s", uid)
    response.status_code = 204
    return response


# ---------- Google sign-in (optional) ----------
def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _redirect_uri() -> str:
    return f"{get_settings().public_origin}/api/auth/google/callback"


@router.get("/google/start", include_in_schema=False)
async def google_start(request: Request) -> RedirectResponse:
    s = get_settings()
    if not s.google_enabled:
        raise HTTPException(status_code=404, detail="not_found")
    _throttle(f"google:{client_ip(request)}", 20, 300)
    state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    resp = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)
    resp.set_cookie(
        _OAUTH_COOKIE, f"{state}.{nonce}.{verifier}", max_age=600, httponly=True,
        secure=s.secure_cookies, samesite="lax", path="/api/auth/google",
    )
    return resp


def _login_error(reason: str) -> RedirectResponse:
    resp = RedirectResponse(f"{get_settings().public_origin}/login?error={reason}", status_code=302)
    resp.delete_cookie(_OAUTH_COOKIE, path="/api/auth/google")
    return resp


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    request: Request, db: DB, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None
) -> RedirectResponse:
    s = get_settings()
    if not s.google_enabled:
        raise HTTPException(status_code=404, detail="not_found")
    raw = request.cookies.get(_OAUTH_COOKIE, "")
    parts = raw.split(".")
    if error or not code or not state or len(parts) != 3 or not tokens_equal(parts[0], state):
        return _login_error("google_failed")
    _, nonce, verifier = parts

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as http:
            tok = await http.post(GOOGLE_TOKEN_URL, data={
                "code": code, "client_id": s.google_client_id, "client_secret": s.google_client_secret,
                "redirect_uri": _redirect_uri(), "grant_type": "authorization_code", "code_verifier": verifier,
            })
        tok.raise_for_status()
        id_token = tok.json()["id_token"]
        key = await run_in_threadpool(_jwks.get_signing_key_from_jwt, id_token)
        claims = jwt.decode(
            id_token, key.key, algorithms=["RS256"], audience=s.google_client_id,
            options={"require": ["iss", "aud", "exp", "iat", "sub"]},
        )
    except Exception as exc:
        log.warning("auth.google_exchange_failed: %s", type(exc).__name__)
        return _login_error("google_failed")

    if claims.get("iss") not in GOOGLE_ISSUERS or not tokens_equal(str(claims.get("nonce", "")), nonce):
        return _login_error("google_failed")
    if not claims.get("email_verified") or not claims.get("email"):
        return _login_error("email_not_verified")

    sub, email = str(claims["sub"]), str(claims["email"]).lower()
    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            if not s.allow_registration:
                return _login_error("registration_disabled")
            user = User(email=email, name=str(claims.get("name") or email)[:200])
            db.add(user)
        user.google_sub = sub
    user.name = str(claims.get("name") or user.name)[:200]
    picture = str(claims.get("picture") or "")
    user.profile_image = picture[:1000] if picture.startswith("https://") else None
    await db.flush()

    resp = RedirectResponse(f"{s.public_origin}/", status_code=302)
    resp.delete_cookie(_OAUTH_COOKIE, path="/api/auth/google")
    await start_session(db, resp, request, user)
    log.info("auth.google_login user=%s", user.user_id)
    return resp
