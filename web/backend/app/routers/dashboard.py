from datetime import date
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from ..deps import DB, CurrentUser
from ..models import Application, InterviewRound, Question
from ..schemas import IN_PROGRESS_STATUSES, OFFER_STATUSES, RoundOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class StatusCount(BaseModel):
    status: str
    count: int


class MonthCount(BaseModel):
    month: str
    count: int


class CompanyCount(BaseModel):
    company: str
    count: int


class DashboardOut(BaseModel):
    total_companies: int
    total_applications: int
    total_interviews_scheduled: int
    interviews_completed: int
    interviews_upcoming: int
    offers: int
    rejections: int
    in_progress: int
    total_questions: int
    status_distribution: list[StatusCount]
    applications_by_month: list[MonthCount]
    rounds_by_company: list[CompanyCount]
    upcoming_rounds: list[RoundOut]


@router.get("/stats", response_model=DashboardOut)
async def dashboard_stats(user: CurrentUser, db: DB, today: Optional[date] = None) -> DashboardOut:
    uid = user.user_id
    today = today or date.today()

    status_rows = (await db.execute(
        select(Application.application_status, func.count())
        .where(Application.user_id == uid)
        .group_by(Application.application_status)
    )).all()
    status_counts = {s: n for s, n in status_rows}

    total_companies = await db.scalar(
        select(func.count(func.distinct(func.lower(Application.company_name)))).where(Application.user_id == uid)
    ) or 0

    round_rows = (await db.execute(
        select(InterviewRound.interview_status, func.count())
        .where(InterviewRound.user_id == uid)
        .group_by(InterviewRound.interview_status)
    )).all()
    round_counts = {s: n for s, n in round_rows}

    upcoming_filter = (
        InterviewRound.user_id == uid,
        InterviewRound.interview_status.in_(("Scheduled", "Rescheduled")),
        InterviewRound.interview_date >= today,
    )
    upcoming_count = await db.scalar(select(func.count()).select_from(InterviewRound).where(*upcoming_filter)) or 0
    upcoming = (await db.scalars(
        select(InterviewRound).where(*upcoming_filter)
        .order_by(InterviewRound.interview_date, InterviewRound.interview_time).limit(5)
    )).unique().all()

    # Month bucketing in Python keeps the query portable across SQLite and Postgres; it only reads one date column.
    by_month: dict[str, int] = {}
    for (d,) in (await db.execute(select(Application.applied_date).where(Application.user_id == uid))).all():
        if d:
            key = d.strftime("%Y-%m")
            by_month[key] = by_month.get(key, 0) + 1

    company_rows = (await db.execute(
        select(Application.company_name, func.count(InterviewRound.round_id))
        .join(InterviewRound, InterviewRound.application_id == Application.application_id)
        .where(Application.user_id == uid)
        .group_by(Application.company_name)
        .order_by(func.count(InterviewRound.round_id).desc())
        .limit(6)
    )).all()

    total_questions = await db.scalar(select(func.count()).select_from(Question).where(Question.user_id == uid)) or 0

    return DashboardOut(
        total_companies=total_companies,
        total_applications=sum(status_counts.values()),
        total_interviews_scheduled=round_counts.get("Scheduled", 0) + round_counts.get("Rescheduled", 0),
        interviews_completed=round_counts.get("Completed", 0),
        interviews_upcoming=upcoming_count,
        offers=sum(status_counts.get(s, 0) for s in OFFER_STATUSES),
        rejections=status_counts.get("Rejected", 0),
        in_progress=sum(status_counts.get(s, 0) for s in IN_PROGRESS_STATUSES),
        total_questions=total_questions,
        status_distribution=[StatusCount(status=s, count=n) for s, n in sorted(status_counts.items(), key=lambda x: -x[1])],
        applications_by_month=[MonthCount(month=k, count=v) for k, v in sorted(by_month.items())][-6:],
        rounds_by_company=[CompanyCount(company=c, count=n) for c, n in company_rows],
        upcoming_rounds=[RoundOut.model_validate(r) for r in upcoming],
    )
