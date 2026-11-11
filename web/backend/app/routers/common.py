from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Application, Attachment, InterviewRound, Question


def like_pattern(q: str) -> str:
    """Escape LIKE wildcards so user search text is matched literally (value is still a bound parameter)."""
    q = q.strip()[:200].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{q}%"


def not_found(what: str = "not_found") -> HTTPException:
    # 404 for both "missing" and "belongs to someone else", so ids can't be probed.
    return HTTPException(status_code=404, detail=what)


async def owned_application(db: AsyncSession, user_id: str, application_id: str) -> Application:
    app = await db.scalar(
        select(Application).where(Application.application_id == application_id, Application.user_id == user_id)
    )
    if app is None:
        raise not_found("application_not_found")
    return app


async def owned_round(db: AsyncSession, user_id: str, round_id: str) -> InterviewRound:
    rnd = await db.scalar(
        select(InterviewRound).where(InterviewRound.round_id == round_id, InterviewRound.user_id == user_id)
    )
    if rnd is None:
        raise not_found("round_not_found")
    return rnd


async def owned_question(db: AsyncSession, user_id: str, question_id: str) -> Question:
    q = await db.scalar(select(Question).where(Question.question_id == question_id, Question.user_id == user_id))
    if q is None:
        raise not_found()
    return q


async def owned_attachment(db: AsyncSession, user_id: str, attachment_id: str) -> Attachment:
    a = await db.scalar(
        select(Attachment).where(Attachment.attachment_id == attachment_id, Attachment.user_id == user_id)
    )
    if a is None:
        raise not_found()
    return a


async def attachment_keys(db: AsyncSession, user_id: str, **where: str) -> list[str]:
    stmt = select(Attachment.storage_key).where(Attachment.user_id == user_id)
    for col, val in where.items():
        stmt = stmt.where(getattr(Attachment, col) == val)
    return list((await db.scalars(stmt)).all())
