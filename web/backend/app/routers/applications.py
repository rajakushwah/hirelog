from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Query
from sqlalchemy import delete, or_, select

from ..deps import DB, CurrentUser
from ..models import Application, utcnow
from ..schemas import OFFER_STATUSES, ApplicationIn, ApplicationOut, Deleted
from ..storage import get_storage
from .common import attachment_keys, like_pattern, owned_application

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    user: CurrentUser,
    db: DB,
    status: Optional[str] = Query(None, max_length=40),
    q: Optional[str] = Query(None, max_length=200),
    sort: Literal["applied_desc", "applied_asc", "updated_desc"] = "applied_desc",
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[Application]:
    stmt = select(Application).where(Application.user_id == user.user_id)
    if status and status != "All":
        stmt = stmt.where(Application.application_status == status)
    if q and q.strip():
        pat = like_pattern(q)
        stmt = stmt.where(or_(
            Application.company_name.ilike(pat, escape="\\"),
            Application.job_role.ilike(pat, escape="\\"),
            Application.job_location.ilike(pat, escape="\\"),
            Application.recruiter_name.ilike(pat, escape="\\"),
        ))
    order = {
        "applied_desc": (Application.applied_date.desc(), Application.created_at.desc()),
        "applied_asc": (Application.applied_date.asc(), Application.created_at.asc()),
        "updated_desc": (Application.updated_at.desc(),),
    }[sort]
    stmt = stmt.order_by(*order).limit(limit).offset(offset)
    return list((await db.scalars(stmt)).all())


@router.post("", response_model=ApplicationOut, status_code=201)
async def create_application(payload: ApplicationIn, user: CurrentUser, db: DB) -> Application:
    data = payload.model_dump()
    data["applied_date"] = data["applied_date"] or date.today()
    app = Application(**data, user_id=user.user_id)
    if app.application_status in OFFER_STATUSES:
        app.offer_date = date.today()
    db.add(app)
    await db.commit()
    return app


@router.get("/{application_id}", response_model=ApplicationOut)
async def get_application(application_id: str, user: CurrentUser, db: DB) -> Application:
    return await owned_application(db, user.user_id, application_id)


@router.put("/{application_id}", response_model=ApplicationOut)
async def update_application(application_id: str, payload: ApplicationIn, user: CurrentUser, db: DB) -> Application:
    app = await owned_application(db, user.user_id, application_id)
    data = payload.model_dump()
    data["applied_date"] = data["applied_date"] or app.applied_date
    for k, v in data.items():
        setattr(app, k, v)
    if app.application_status in OFFER_STATUSES and not app.offer_date:
        app.offer_date = date.today()
    app.updated_at = utcnow()
    await db.commit()
    return app


@router.delete("/{application_id}", response_model=Deleted)
async def delete_application(application_id: str, user: CurrentUser, db: DB) -> Deleted:
    await owned_application(db, user.user_id, application_id)
    keys = await attachment_keys(db, user.user_id, application_id=application_id)
    # Rounds, questions and attachment rows go with it through ON DELETE CASCADE.
    await db.execute(delete(Application).where(
        Application.application_id == application_id, Application.user_id == user.user_id
    ))
    await db.commit()
    storage = get_storage()
    for k in keys:
        storage.delete(k)
    return Deleted(deleted=1)
