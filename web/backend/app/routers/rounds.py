import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import Response
from sqlalchemy import delete, nulls_last, or_, select

from ..deps import DB, CurrentUser
from ..models import Application, InterviewRound, utcnow
from ..schemas import Deleted, RoundIn, RoundOut
from ..storage import get_storage
from .common import attachment_keys, like_pattern, owned_application, owned_round

router = APIRouter(prefix="/rounds", tags=["rounds"])


@router.get("", response_model=list[RoundOut])
async def list_rounds(
    user: CurrentUser,
    db: DB,
    application_id: Optional[str] = Query(None, max_length=40),
    status: Optional[str] = Query(None, max_length=40),
    upcoming: bool = False,
    today: Optional[date] = Query(None, description="Client's local date, used for 'upcoming'"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = Query(None, max_length=200),
    limit: int = Query(1000, ge=1, le=2000),
) -> list[InterviewRound]:
    stmt = select(InterviewRound).join(InterviewRound.application).where(InterviewRound.user_id == user.user_id)
    if application_id:
        stmt = stmt.where(InterviewRound.application_id == application_id)
    if upcoming:
        stmt = stmt.where(
            InterviewRound.interview_status.in_(("Scheduled", "Rescheduled")),
            InterviewRound.interview_date >= (today or date.today()),
        )
    elif status and status != "All":
        stmt = stmt.where(InterviewRound.interview_status == status)
    if date_from:
        stmt = stmt.where(InterviewRound.interview_date >= date_from)
    if date_to:
        stmt = stmt.where(InterviewRound.interview_date <= date_to)
    if q and q.strip():
        pat = like_pattern(q)
        stmt = stmt.where(or_(
            InterviewRound.round_name.ilike(pat, escape="\\"),
            InterviewRound.interviewer_name.ilike(pat, escape="\\"),
            Application.company_name.ilike(pat, escape="\\"),
            Application.job_role.ilike(pat, escape="\\"),
        ))
    if application_id:
        stmt = stmt.order_by(InterviewRound.round_number, InterviewRound.created_at)
    else:
        stmt = stmt.order_by(nulls_last(InterviewRound.interview_date.asc()), InterviewRound.interview_time)
    return list((await db.scalars(stmt.limit(limit))).unique().all())


@router.post("", response_model=RoundOut, status_code=201)
async def create_round(payload: RoundIn, user: CurrentUser, db: DB) -> InterviewRound:
    app = await owned_application(db, user.user_id, payload.application_id)
    data = payload.model_dump()
    data["interview_types"] = list(dict.fromkeys(data["interview_types"]))
    rnd = InterviewRound(**data, user_id=user.user_id)
    rnd.application = app
    db.add(rnd)
    await db.commit()
    return rnd


@router.get("/{round_id}", response_model=RoundOut)
async def get_round(round_id: str, user: CurrentUser, db: DB) -> InterviewRound:
    return await owned_round(db, user.user_id, round_id)


@router.put("/{round_id}", response_model=RoundOut)
async def update_round(round_id: str, payload: RoundIn, user: CurrentUser, db: DB) -> InterviewRound:
    rnd = await owned_round(db, user.user_id, round_id)
    app = await owned_application(db, user.user_id, payload.application_id)
    data = payload.model_dump()
    data["interview_types"] = list(dict.fromkeys(data["interview_types"]))
    for k, v in data.items():
        setattr(rnd, k, v)
    rnd.application = app
    rnd.updated_at = utcnow()
    await db.commit()
    return rnd


@router.delete("/{round_id}", response_model=Deleted)
async def delete_round(round_id: str, user: CurrentUser, db: DB) -> Deleted:
    await owned_round(db, user.user_id, round_id)
    keys = await attachment_keys(db, user.user_id, round_id=round_id)
    await db.execute(delete(InterviewRound).where(
        InterviewRound.round_id == round_id, InterviewRound.user_id == user.user_id
    ))
    await db.commit()
    storage = get_storage()
    for k in keys:
        storage.delete(k)
    return Deleted(deleted=1)


# ---------- Calendar (.ics) ----------
def _ics_escape(s: str) -> str:
    s = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", s or "")
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _parse_time(t: str) -> Optional[tuple[int, int]]:
    t = (t or "").strip().upper()
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$", t)
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap == "PM" and h < 12:
        h += 12
    if ap == "AM" and h == 12:
        h = 0
    return (h, mi) if 0 <= h < 24 and 0 <= mi < 60 else None


def _parse_minutes(d: str) -> int:
    d = (d or "").lower()
    hours = re.search(r"(\d+(?:\.\d+)?)\s*h", d)
    mins = re.search(r"(\d+)\s*m", d)
    total = (float(hours.group(1)) * 60 if hours else 0) + (int(mins.group(1)) if mins else 0)
    if not total and d.strip().isdigit():
        total = int(d.strip())
    return int(total) if 0 < total <= 24 * 60 else 60


@router.get("/{round_id}/calendar.ics", include_in_schema=False)
async def round_ics(round_id: str, user: CurrentUser, db: DB) -> Response:
    rnd = await owned_round(db, user.user_id, round_id)
    if not rnd.interview_date:
        return Response(status_code=409, content="Interview date is not set")
    hm = _parse_time(rnd.interview_time)
    if hm:
        start = datetime.combine(rnd.interview_date, datetime.min.time()).replace(hour=hm[0], minute=hm[1])
        end = start + timedelta(minutes=_parse_minutes(rnd.duration))
        # Floating local time: calendar apps place it in the user's own time zone.
        when = f"DTSTART:{start:%Y%m%dT%H%M%S}\r\nDTEND:{end:%Y%m%dT%H%M%S}"
    else:
        nxt = rnd.interview_date + timedelta(days=1)
        when = f"DTSTART;VALUE=DATE:{rnd.interview_date:%Y%m%d}\r\nDTEND;VALUE=DATE:{nxt:%Y%m%d}"
    desc = "\n".join(x for x in [
        f"{rnd.company_name} - {rnd.job_role}",
        f"Type: {rnd.interview_type}",
        f"Platform: {rnd.interview_platform}" if rnd.interview_platform else "",
        f"Interviewer: {rnd.interviewer_name}" if rnd.interviewer_name else "",
        f"Link: {rnd.meeting_link}" if rnd.meeting_link else "",
    ] if x)
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HireLog//HireLog Web//EN", "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{rnd.round_id}@hirelog.local",
        f"DTSTAMP:{utcnow():%Y%m%dT%H%M%SZ}",
        when,
        f"SUMMARY:{_ics_escape(f'{rnd.company_name}: R{rnd.round_number} {rnd.round_name}')}",
        f"DESCRIPTION:{_ics_escape(desc)}",
        *([f"URL:{_ics_escape(rnd.meeting_link)}"] if rnd.meeting_link else []),
        "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Interview in 1 hour", "END:VALARM",
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Interview tomorrow", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return Response(
        content="\r\n".join(lines) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="interview_{rnd.round_id}.ics"', "Cache-Control": "no-store"},
    )
