"""Admin portal API. Exposes account metadata and aggregate counts only, never users' application/question content."""

import logging
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..deps import DB, CurrentAdmin
from ..models import (
    AdminAuditLog,
    AppAccess,
    Application,
    Attachment,
    ContactMessage,
    DownloadEvent,
    InterviewRound,
    Question,
    User,
    UserActivityDay,
    UserSession,
    utcnow,
)
from ..schemas import OFFER_STATUSES, In
from ..storage import get_storage
from .common import like_pattern

log = logging.getLogger("hirelog.admin")
router = APIRouter(prefix="/admin", tags=["admin"])


# ---------- Schemas ----------
class DayPoint(BaseModel):
    date: date
    signups: int = 0
    active: int = 0
    applications: int = 0
    rounds: int = 0
    questions: int = 0
    attachments: int = 0
    downloads: int = 0


class Count(BaseModel):
    label: str
    count: int


class OverviewOut(BaseModel):
    days: int
    users_total: int
    users_new: int
    admins: int
    disabled: int
    dau: int
    wau: int
    mau: int
    applications: int
    rounds: int
    questions: int
    attachments: int
    storage_bytes: int
    offers: int
    rejections: int
    status_distribution: list[Count]
    interview_results: list[Count]
    downloads_total: int
    downloads_window: int
    downloaders: int
    pending_access: int
    unread_messages: int
    series: list[DayPoint]


class AdminUserOut(BaseModel):
    user_id: str
    name: str
    email: str
    created_at: datetime
    last_login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    is_admin: bool
    disabled_at: Optional[datetime] = None
    has_password: bool
    google_linked: bool
    applications: int = 0
    rounds: int = 0
    questions: int = 0
    attachments: int = 0
    storage_bytes: int = 0
    apk_downloads: int = 0
    last_download_at: Optional[datetime] = None


class AccessRequestOut(BaseModel):
    user_id: str
    name: str
    email: str
    status: str
    note: str
    requested_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    decided_by: str = ""


class BadgesOut(BaseModel):
    unread_messages: int
    pending_access: int


class AdminUserDetailOut(AdminUserOut):
    app_access: str = "none"
    offers: int = 0
    active_sessions: int = 0
    active_days_30: int = 0


class UserPage(BaseModel):
    items: list[AdminUserOut]
    total: int


class MessageOut(BaseModel):
    message_id: str
    name: str
    email: str
    topic: str
    message: str
    created_at: datetime
    read_at: Optional[datetime] = None


class AuditOut(BaseModel):
    entry_id: str
    admin_email: str
    action: str
    target_user_id: Optional[str] = None
    target_email: str
    detail: str
    created_at: datetime


class DeleteUserIn(In):
    confirm_email: str


class ReadIn(In):
    read: bool = True


# ---------- Helpers ----------
def _day(col):
    """UTC calendar day of a timestamp column, on SQLite and Postgres."""
    return func.date(col) if get_settings().is_sqlite else func.date(func.timezone("UTC", col))


def _as_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


async def _per_day(db: AsyncSession, col, start: datetime, *where) -> dict[date, int]:
    d = _day(col)
    rows = await db.execute(select(d, func.count()).where(col >= start, *where).group_by(d))
    return {_as_date(k): n for k, n in rows.all() if k is not None}


async def _count(db: AsyncSession, model, *where) -> int:
    return int(await db.scalar(select(func.count()).select_from(model).where(*where)) or 0)


async def _audit(db: AsyncSession, admin: User, action: str, target: Optional[User] = None, detail: str = "") -> None:
    db.add(AdminAuditLog(
        admin_id=admin.user_id, admin_email=admin.email, action=action,
        target_user_id=target.user_id if target else None, target_email=target.email if target else "",
        detail=detail[:500],
    ))
    log.info("admin.%s admin=%s target=%s", action, admin.user_id, target.user_id if target else "-")


async def _target(db: AsyncSession, admin: User, user_id: str, *, allow_self: bool = False) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    if not allow_self and user.user_id == admin.user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "cannot_target_self")
    return user


def _counts_subqueries():
    apps = select(Application.user_id.label("uid"), func.count().label("n")).group_by(Application.user_id).subquery()
    rounds = select(InterviewRound.user_id.label("uid"), func.count().label("n")).group_by(InterviewRound.user_id).subquery()
    qs = select(Question.user_id.label("uid"), func.count().label("n")).group_by(Question.user_id).subquery()
    atts = (
        select(Attachment.user_id.label("uid"), func.count().label("n"), func.coalesce(func.sum(Attachment.size), 0).label("bytes"))
        .group_by(Attachment.user_id).subquery()
    )
    dls = (
        select(DownloadEvent.user_id.label("uid"), func.count().label("n"), func.max(DownloadEvent.created_at).label("last"))
        .where(DownloadEvent.user_id.is_not(None)).group_by(DownloadEvent.user_id).subquery()
    )
    return apps, rounds, qs, atts, dls


def _user_query():
    apps, rounds, qs, atts, dls = _counts_subqueries()
    stmt = (
        select(
            User,
            func.coalesce(apps.c.n, 0), func.coalesce(rounds.c.n, 0), func.coalesce(qs.c.n, 0),
            func.coalesce(atts.c.n, 0), func.coalesce(atts.c.bytes, 0), func.coalesce(dls.c.n, 0), dls.c.last,
        )
        .outerjoin(apps, apps.c.uid == User.user_id)
        .outerjoin(rounds, rounds.c.uid == User.user_id)
        .outerjoin(qs, qs.c.uid == User.user_id)
        .outerjoin(atts, atts.c.uid == User.user_id)
        .outerjoin(dls, dls.c.uid == User.user_id)
    )
    return stmt, dls


def _user_out(row, cls=AdminUserOut, **extra):
    u, a, r, q, at, b, dn, dl = row
    return cls(
        user_id=u.user_id, name=u.name, email=u.email, created_at=u.created_at, last_login_at=u.last_login_at,
        last_active_at=u.last_active_at, is_admin=u.is_admin, disabled_at=u.disabled_at, has_password=u.has_password,
        google_linked=u.google_sub is not None, applications=a, rounds=r, questions=q, attachments=at,
        storage_bytes=int(b or 0), apk_downloads=dn, last_download_at=dl, **extra,
    )


# ---------- Analytics ----------
@router.get("/overview", response_model=OverviewOut)
async def overview(admin: CurrentAdmin, db: DB, days: int = Query(30, ge=7, le=365)) -> OverviewOut:
    now = utcnow()
    today = now.date()
    first_day = today - timedelta(days=days - 1)
    start = datetime.combine(first_day, datetime.min.time(), tzinfo=now.tzinfo)

    async def distinct_active(since: date) -> int:
        return int(await db.scalar(select(func.count(distinct(UserActivityDay.user_id))).where(UserActivityDay.day >= since)) or 0)

    status_rows = (await db.execute(
        select(Application.application_status, func.count()).group_by(Application.application_status).order_by(func.count().desc())
    )).all()
    result_rows = (await db.execute(
        select(InterviewRound.interview_result, func.count()).group_by(InterviewRound.interview_result).order_by(func.count().desc())
    )).all()
    active_rows = (await db.execute(
        select(UserActivityDay.day, func.count()).where(UserActivityDay.day >= first_day).group_by(UserActivityDay.day)
    )).all()

    signups = await _per_day(db, User.created_at, start)
    app_days = await _per_day(db, Application.created_at, start)
    round_days = await _per_day(db, InterviewRound.created_at, start)
    q_days = await _per_day(db, Question.created_at, start)
    att_days = await _per_day(db, Attachment.uploaded_at, start)
    dl_days = await _per_day(db, DownloadEvent.created_at, start)
    active = {_as_date(d): n for d, n in active_rows}

    series = []
    for i in range(days):
        d = first_day + timedelta(days=i)
        series.append(DayPoint(
            date=d, signups=signups.get(d, 0), active=active.get(d, 0), applications=app_days.get(d, 0),
            rounds=round_days.get(d, 0), questions=q_days.get(d, 0), attachments=att_days.get(d, 0), downloads=dl_days.get(d, 0),
        ))

    status_dist = [Count(label=s or "Unknown", count=n) for s, n in status_rows]
    return OverviewOut(
        days=days,
        users_total=await _count(db, User),
        users_new=sum(signups.values()),
        admins=await _count(db, User, User.is_admin.is_(True)),
        disabled=await _count(db, User, User.disabled_at.is_not(None)),
        dau=await distinct_active(today),
        wau=await distinct_active(today - timedelta(days=6)),
        mau=await distinct_active(today - timedelta(days=29)),
        applications=await _count(db, Application),
        rounds=await _count(db, InterviewRound),
        questions=await _count(db, Question),
        attachments=await _count(db, Attachment),
        storage_bytes=int(await db.scalar(select(func.coalesce(func.sum(Attachment.size), 0))) or 0),
        offers=sum(c.count for c in status_dist if c.label in OFFER_STATUSES),
        rejections=sum(c.count for c in status_dist if c.label == "Rejected"),
        status_distribution=status_dist,
        interview_results=[Count(label=s or "Unknown", count=n) for s, n in result_rows],
        downloads_total=await _count(db, DownloadEvent),
        downloads_window=sum(dl_days.values()),
        downloaders=int(await db.scalar(select(func.count(distinct(DownloadEvent.user_id)))) or 0),
        pending_access=await _count(db, AppAccess, AppAccess.status == "pending"),
        unread_messages=await _count(db, ContactMessage, ContactMessage.read_at.is_(None)),
        series=series,
    )


@router.get("/badges", response_model=BadgesOut)
async def badges(admin: CurrentAdmin, db: DB) -> BadgesOut:
    return BadgesOut(
        unread_messages=await _count(db, ContactMessage, ContactMessage.read_at.is_(None)),
        pending_access=await _count(db, AppAccess, AppAccess.status == "pending"),
    )


# ---------- Users ----------
@router.get("/users", response_model=UserPage)
async def list_users(
    admin: CurrentAdmin,
    db: DB,
    q: str = Query("", max_length=200),
    filter: Literal["all", "active", "inactive", "disabled", "admins", "downloaded"] = "all",
    sort: Literal["created_desc", "created_asc", "active_desc", "download_desc", "name"] = "created_desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> UserPage:
    where = []
    if q.strip():
        pat = like_pattern(q.strip())
        where.append(or_(User.email.ilike(pat, escape="\\"), User.name.ilike(pat, escape="\\")))
    month_ago = utcnow() - timedelta(days=30)
    if filter == "active":
        where.append(User.last_active_at >= month_ago)
    elif filter == "inactive":
        where.append(or_(User.last_active_at.is_(None), User.last_active_at < month_ago))
    elif filter == "disabled":
        where.append(User.disabled_at.is_not(None))
    elif filter == "admins":
        where.append(User.is_admin.is_(True))
    elif filter == "downloaded":
        where.append(User.user_id.in_(select(DownloadEvent.user_id).where(DownloadEvent.user_id.is_not(None))))

    order = {
        "created_desc": [User.created_at.desc()],
        "created_asc": [User.created_at.asc()],
        "active_desc": [User.last_active_at.desc().nulls_last(), User.created_at.desc()],
        "name": [func.lower(User.name), User.email],
    }
    stmt, dls = _user_query()
    order["download_desc"] = [dls.c.last.desc().nulls_last(), User.created_at.desc()]
    total = await _count(db, User, *where)
    rows = (await db.execute(stmt.where(*where).order_by(*order[sort]).limit(limit).offset(offset))).all()
    return UserPage(items=[_user_out(r) for r in rows], total=total)


@router.get("/users/{user_id}", response_model=AdminUserDetailOut)
async def user_detail(user_id: str, admin: CurrentAdmin, db: DB) -> AdminUserDetailOut:
    stmt, _ = _user_query()
    row = (await db.execute(stmt.where(User.user_id == user_id))).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    now = utcnow()
    return _user_out(
        row, AdminUserDetailOut,
        offers=await _count(db, Application, Application.user_id == user_id, Application.application_status.in_(OFFER_STATUSES)),
        active_sessions=await _count(db, UserSession, UserSession.user_id == user_id, UserSession.expires_at > now),
        active_days_30=await _count(db, UserActivityDay, UserActivityDay.user_id == user_id,
                                    UserActivityDay.day >= now.date() - timedelta(days=29)),
        app_access="approved" if row[0].is_admin else (await db.scalar(select(AppAccess.status).where(AppAccess.user_id == user_id)) or "none"),
    )


@router.post("/users/{user_id}/disable", status_code=204)
async def disable_user(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    user = await _target(db, admin, user_id)
    if user.is_admin:
        raise HTTPException(status.HTTP_409_CONFLICT, "remove_admin_first")
    if not user.is_disabled:
        user.disabled_at = utcnow()
        await db.execute(delete(UserSession).where(UserSession.user_id == user.user_id))
        await _audit(db, admin, "disable_user", user)
        await db.commit()
    return Response(status_code=204)


@router.post("/users/{user_id}/enable", status_code=204)
async def enable_user(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    user = await _target(db, admin, user_id)
    if user.is_disabled:
        user.disabled_at = None
        await _audit(db, admin, "enable_user", user)
        await db.commit()
    return Response(status_code=204)


@router.post("/users/{user_id}/signout", status_code=204)
async def sign_out_user(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    user = await _target(db, admin, user_id)
    res = await db.execute(delete(UserSession).where(UserSession.user_id == user.user_id))
    await _audit(db, admin, "sign_out_user", user, f"{res.rowcount or 0} sessions")
    await db.commit()
    return Response(status_code=204)


@router.post("/users/{user_id}/admin", status_code=204)
async def grant_admin(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    user = await _target(db, admin, user_id)
    if user.is_disabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "user_disabled")
    if not user.is_admin:
        user.is_admin = True
        await _audit(db, admin, "grant_admin", user)
        await db.commit()
    return Response(status_code=204)


@router.delete("/users/{user_id}/admin", status_code=204)
async def revoke_admin(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    # Self-revocation is refused, so at least one admin (the caller) always remains.
    user = await _target(db, admin, user_id)
    if user.is_admin:
        user.is_admin = False
        await _audit(db, admin, "revoke_admin", user)
        await db.commit()
    return Response(status_code=204)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, body: DeleteUserIn, admin: CurrentAdmin, db: DB) -> Response:
    user = await _target(db, admin, user_id)
    if user.is_admin:
        raise HTTPException(status.HTTP_409_CONFLICT, "remove_admin_first")
    if body.confirm_email.strip().lower() != user.email:
        raise HTTPException(422, "confirmation_mismatch")
    uid = user.user_id
    await _audit(db, admin, "delete_user", user)
    await db.delete(user)
    await db.commit()
    get_storage().delete_prefix(uid)
    return Response(status_code=204)


# ---------- Contact inbox ----------
@router.get("/messages", response_model=list[MessageOut])
async def list_messages(
    admin: CurrentAdmin, db: DB, filter: Literal["all", "unread"] = "all", limit: int = Query(100, ge=1, le=500),
) -> list[ContactMessage]:
    stmt = select(ContactMessage)
    if filter == "unread":
        stmt = stmt.where(ContactMessage.read_at.is_(None))
    return list(await db.scalars(stmt.order_by(ContactMessage.created_at.desc()).limit(limit)))


@router.post("/messages/{message_id}/read", status_code=204)
async def mark_message(message_id: str, body: ReadIn, admin: CurrentAdmin, db: DB) -> Response:
    msg = await db.get(ContactMessage, message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    msg.read_at = (msg.read_at or utcnow()) if body.read else None
    await db.commit()
    return Response(status_code=204)


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(message_id: str, admin: CurrentAdmin, db: DB) -> Response:
    msg = await db.get(ContactMessage, message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    await db.delete(msg)
    await _audit(db, admin, "delete_message", detail=f"{msg.topic} from {msg.email}")
    await db.commit()
    return Response(status_code=204)


# ---------- Audit ----------
@router.get("/audit", response_model=list[AuditOut])
async def audit_log(admin: CurrentAdmin, db: DB, limit: int = Query(100, ge=1, le=500)) -> list[AdminAuditLog]:
    return list(await db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)))


# ---------- Mobile app access ----------
@router.get("/app-access", response_model=list[AccessRequestOut])
async def list_app_access(
    admin: CurrentAdmin, db: DB, filter: Literal["pending", "approved", "rejected", "all"] = "pending",
) -> list[AccessRequestOut]:
    stmt = select(AppAccess, User).join(User, User.user_id == AppAccess.user_id)
    if filter != "all":
        stmt = stmt.where(AppAccess.status == filter)
    order = AppAccess.requested_at.asc() if filter == "pending" else AppAccess.requested_at.desc()
    rows = (await db.execute(stmt.order_by(order).limit(500))).all()
    return [
        AccessRequestOut(user_id=u.user_id, name=u.name, email=u.email, status=a.status, note=a.note,
                         requested_at=a.requested_at, decided_at=a.decided_at, decided_by=a.decided_by)
        for a, u in rows
    ]


async def _decide(db: AsyncSession, admin: User, user_id: str, decision: str) -> None:
    user = await _target(db, admin, user_id, allow_self=True)
    row = await db.get(AppAccess, user.user_id)
    previous = row.status if row else "none"
    if row is None:
        row = AppAccess(user_id=user.user_id, requested_at=None)
        db.add(row)
    row.status, row.decided_at, row.decided_by = decision, utcnow(), admin.email
    action = "approve_app_access" if decision == "approved" else ("revoke_app_access" if previous == "approved" else "reject_app_access")
    await _audit(db, admin, action, user)
    await db.commit()


@router.post("/app-access/{user_id}/approve", status_code=204)
async def approve_app_access(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    await _decide(db, admin, user_id, "approved")
    return Response(status_code=204)


@router.post("/app-access/{user_id}/reject", status_code=204)
async def reject_app_access(user_id: str, admin: CurrentAdmin, db: DB) -> Response:
    await _decide(db, admin, user_id, "rejected")
    return Response(status_code=204)
