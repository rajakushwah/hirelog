from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..models import Application, Attachment, InterviewRound, Question
from ..schemas import ApplicationOut, AttachmentOut, QuestionOut, RoundOut, UserOut
from ..security import limiter
from ..services.exports import build_pdf, build_xlsx, safe_name
from ..storage import get_storage

router = APIRouter(prefix="/export", tags=["export"])


async def _load(db, uid: str, application_id: Optional[str]):
    def scoped(model):
        stmt = select(model).where(model.user_id == uid)
        return stmt.where(model.application_id == application_id) if application_id else stmt

    apps = (await db.scalars(scoped(Application).order_by(Application.applied_date.desc()))).all()
    if application_id and not apps:
        raise HTTPException(status_code=404, detail="not_found")
    rounds = (await db.scalars(
        scoped(InterviewRound).order_by(InterviewRound.application_id, InterviewRound.round_number)
    )).unique().all()
    questions = (await db.scalars(scoped(Question).order_by(Question.created_at))).all()
    atts = (await db.scalars(scoped(Attachment).order_by(Attachment.uploaded_at))).all()
    return (
        [ApplicationOut.model_validate(a).model_dump(mode="json") for a in apps],
        [RoundOut.model_validate(r).model_dump(mode="json") for r in rounds],
        [QuestionOut.model_validate(q).model_dump(mode="json") for q in questions],
        [{**AttachmentOut.model_validate(a).model_dump(mode="json"), "storage_key": a.storage_key} for a in atts],
    )


def _throttle(uid: str) -> None:
    # PDF rendering is CPU heavy; cap it per user.
    if not limiter.allow(f"export:{uid}", 10, 60):
        raise HTTPException(status_code=429, detail="too_many_requests")


def _fname(apps: list, application_id: Optional[str], default: str, ext: str) -> str:
    label = safe_name(apps[0]["company_name"]) if application_id else default
    return f"HireLog_{label}_{datetime.now(timezone.utc):%Y-%m-%d}.{ext}"


@router.get("/sheet")
async def export_sheet(user: CurrentUser, db: DB, application_id: Optional[str] = Query(None, max_length=40)) -> Response:
    _throttle(user.user_id)
    apps, rounds, questions, atts = await _load(db, user.user_id, application_id)
    data = {"Applications": apps, "Interview_Rounds": rounds, "Interview_Questions": questions, "Attachments": atts}
    content = await run_in_threadpool(build_xlsx, data)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{_fname(apps, application_id, "All", "xlsx")}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/pdf")
async def export_pdf(user: CurrentUser, db: DB, application_id: Optional[str] = Query(None, max_length=40)) -> Response:
    _throttle(user.user_id)
    apps, rounds, questions, atts = await _load(db, user.user_id, application_id)
    storage = get_storage()
    content = await run_in_threadpool(
        build_pdf, UserOut.model_validate(user).model_dump(mode="json"), apps, rounds, questions, atts, storage.get, bool(application_id)
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{_fname(apps, application_id, "Report", "pdf")}"',
            "Cache-Control": "no-store",
        },
    )
