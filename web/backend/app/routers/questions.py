from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select

from ..deps import DB, CurrentUser
from ..models import Question, utcnow
from ..schemas import Deleted, QuestionIn, QuestionOut
from .common import like_pattern, owned_application, owned_question, owned_round

router = APIRouter(prefix="/questions", tags=["questions"])


async def _resolve_links(db, user_id: str, payload: QuestionIn) -> tuple[Optional[str], Optional[str]]:
    """Both links must belong to the caller, and a round's application wins over a mismatched one."""
    round_id, application_id = payload.round_id or None, payload.application_id or None
    if round_id:
        rnd = await owned_round(db, user_id, round_id)
        if application_id and application_id != rnd.application_id:
            raise HTTPException(status_code=422, detail="round_application_mismatch")
        application_id = rnd.application_id
    elif application_id:
        await owned_application(db, user_id, application_id)
    return round_id, application_id


@router.get("", response_model=list[QuestionOut])
async def list_questions(
    user: CurrentUser,
    db: DB,
    round_id: Optional[str] = Query(None, max_length=40),
    application_id: Optional[str] = Query(None, max_length=40),
    category: Optional[str] = Query(None, max_length=60),
    difficulty: Optional[str] = Query(None, max_length=20),
    q: Optional[str] = Query(None, max_length=200),
    limit: int = Query(1000, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[Question]:
    stmt = select(Question).where(Question.user_id == user.user_id)
    if round_id:
        stmt = stmt.where(Question.round_id == round_id)
    if application_id:
        stmt = stmt.where(Question.application_id == application_id)
    if category and category != "All":
        stmt = stmt.where(Question.category == category)
    if difficulty and difficulty != "All":
        stmt = stmt.where(Question.difficulty == difficulty)
    if q and q.strip():
        pat = like_pattern(q)
        stmt = stmt.where(or_(
            Question.question.ilike(pat, escape="\\"),
            Question.answer.ilike(pat, escape="\\"),
            Question.notes.ilike(pat, escape="\\"),
        ))
    stmt = stmt.order_by(Question.created_at.desc()).limit(limit).offset(offset)
    return list((await db.scalars(stmt)).all())


@router.post("", response_model=QuestionOut, status_code=201)
async def create_question(payload: QuestionIn, user: CurrentUser, db: DB) -> Question:
    round_id, application_id = await _resolve_links(db, user.user_id, payload)
    data = payload.model_dump(exclude={"round_id", "application_id"})
    data["tags"] = list(dict.fromkeys(data["tags"]))
    q = Question(**data, user_id=user.user_id, round_id=round_id, application_id=application_id)
    db.add(q)
    await db.commit()
    return q


@router.get("/{question_id}", response_model=QuestionOut)
async def get_question(question_id: str, user: CurrentUser, db: DB) -> Question:
    return await owned_question(db, user.user_id, question_id)


@router.put("/{question_id}", response_model=QuestionOut)
async def update_question(question_id: str, payload: QuestionIn, user: CurrentUser, db: DB) -> Question:
    q = await owned_question(db, user.user_id, question_id)
    round_id, application_id = await _resolve_links(db, user.user_id, payload)
    data = payload.model_dump(exclude={"round_id", "application_id"})
    data["tags"] = list(dict.fromkeys(data["tags"]))
    for k, v in data.items():
        setattr(q, k, v)
    q.round_id, q.application_id = round_id, application_id
    q.updated_at = utcnow()
    await db.commit()
    return q


@router.delete("/{question_id}", response_model=Deleted)
async def delete_question(question_id: str, user: CurrentUser, db: DB) -> Deleted:
    q = await owned_question(db, user.user_id, question_id)
    await db.delete(q)
    await db.commit()
    return Deleted(deleted=1)
