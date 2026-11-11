from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_db
from .models import User, UserActivityDay, UserSession, utcnow
from .security import hash_token, new_token, tokens_equal

CSRF_HEADER = "X-CSRF-Token"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_TOUCH_EVERY = timedelta(minutes=5)

DB = Annotated[AsyncSession, Depends(get_db)]


def session_cookie_name() -> str:
    # The __Host- prefix makes browsers refuse the cookie unless it is Secure, host-only and Path=/.
    return "__Host-hl_session" if get_settings().secure_cookies else "hl_session"


def csrf_cookie_name() -> str:
    return "__Host-hl_csrf" if get_settings().secure_cookies else "hl_csrf"


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def record_activity(db: AsyncSession, user: User, now: datetime) -> None:
    """Mark the user active now and today (one activity row per user per UTC day)."""
    today = now.date()
    last = user.last_active_at
    if last is None or last.date() != today:
        if await db.get(UserActivityDay, (user.user_id, today)) is None:
            db.add(UserActivityDay(user_id=user.user_id, day=today))
    user.last_active_at = now


async def start_session(db: AsyncSession, response: Response, request: Request, user: User) -> None:
    """Issue a brand-new session (never reuse a pre-login id) and set the cookies."""
    s = get_settings()
    old = request.cookies.get(session_cookie_name())
    if old:
        await db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(old)))
    token, csrf = new_token(), new_token()
    now = utcnow()
    user.last_login_at = now
    await record_activity(db, user, now)
    db.add(
        UserSession(
            token_hash=hash_token(token),
            csrf_token=csrf,
            user_id=user.user_id,
            user_agent=(request.headers.get("user-agent") or "")[:300],
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=s.session_absolute_days),
        )
    )
    await db.commit()
    max_age = s.session_absolute_days * 86400
    response.set_cookie(
        session_cookie_name(), token, max_age=max_age, httponly=True, secure=s.secure_cookies, samesite="lax", path="/"
    )
    # Readable by the SPA on purpose: it echoes this value in the X-CSRF-Token header (synchronizer token).
    response.set_cookie(
        csrf_cookie_name(), csrf, max_age=max_age, httponly=False, secure=s.secure_cookies, samesite="strict", path="/"
    )


def clear_session_cookies(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(session_cookie_name(), path="/", secure=s.secure_cookies, httponly=True, samesite="lax")
    response.delete_cookie(csrf_cookie_name(), path="/", secure=s.secure_cookies, samesite="strict")


async def _load_session(request: Request, db: AsyncSession) -> Optional[UserSession]:
    token = request.cookies.get(session_cookie_name())
    if not token or len(token) > 200:
        return None
    sess = await db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if sess is None:
        return None
    now = utcnow()
    idle = timedelta(hours=get_settings().session_idle_hours)
    if sess.expires_at <= now or now - sess.last_seen_at > idle or sess.user.is_disabled:
        await db.delete(sess)
        await db.commit()
        return None
    if now - sess.last_seen_at > _TOUCH_EVERY:
        sess.last_seen_at = now
        await record_activity(db, sess.user, now)
        await db.commit()
    return sess


async def get_current_session(request: Request, db: DB) -> UserSession:
    sess = await _load_session(request, db)
    if sess is None:
        raise HTTPException(status_code=401, detail="not_authenticated")
    if request.method in UNSAFE_METHODS:
        header = request.headers.get(CSRF_HEADER, "")
        if not header or not tokens_equal(header, sess.csrf_token):
            raise HTTPException(status_code=403, detail="csrf_failed")
    return sess


async def get_current_user(sess: Annotated[UserSession, Depends(get_current_session)]) -> User:
    return sess.user


async def get_current_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    # 404, not 403: the admin API doesn't reveal that it exists to non-admins.
    if not user.is_admin:
        raise HTTPException(status_code=404, detail="not_found")
    return user


CurrentSession = Annotated[UserSession, Depends(get_current_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin)]
