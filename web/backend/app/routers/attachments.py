import hashlib
import logging
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..config import get_settings
from ..deps import DB, CurrentUser
from ..filetypes import detect, safe_filename, sanitize_image
from ..models import Attachment, new_id
from ..schemas import AttachmentOut, Deleted
from ..security import limiter
from ..storage import get_storage
from .common import owned_attachment, owned_round

log = logging.getLogger(__name__)
router = APIRouter(prefix="/attachments", tags=["attachments"])

_CHUNK = 1024 * 1024
MAX_PER_ROUND = 100


async def _read_capped(file: UploadFile, cap: int) -> bytes:
    buf = bytearray()
    while chunk := await file.read(_CHUNK):
        buf += chunk
        if len(buf) > cap:
            raise HTTPException(status_code=413, detail="file_too_large")
    return bytes(buf)


@router.post("", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    user: CurrentUser,
    db: DB,
    file: UploadFile = File(...),
    round_id: str = Form(..., max_length=40),
) -> Attachment:
    if not limiter.allow(f"upload:{user.user_id}", 60, 300):
        raise HTTPException(status_code=429, detail="too_many_requests")
    rnd = await owned_round(db, user.user_id, round_id)
    count = len((await db.scalars(select(Attachment.attachment_id).where(Attachment.round_id == rnd.round_id))).all())
    if count >= MAX_PER_ROUND:
        raise HTTPException(status_code=409, detail="too_many_attachments")

    data = await _read_capped(file, get_settings().max_upload_bytes)
    if not data:
        raise HTTPException(status_code=422, detail="empty_file")
    det = detect(data, file.filename or "")
    if det is None:
        raise HTTPException(status_code=415, detail="unsupported_file_type")
    try:
        data = await run_in_threadpool(sanitize_image, data, det)
    except Exception:
        raise HTTPException(status_code=422, detail="invalid_image")

    att_id = new_id("att")
    key = f"{user.user_id}/{att_id}"
    await run_in_threadpool(get_storage().put, key, data)
    att = Attachment(
        attachment_id=att_id,
        user_id=user.user_id,
        application_id=rnd.application_id,
        round_id=rnd.round_id,
        file_name=safe_filename(file.filename or "", det.ext),
        file_type=det.mime,
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        storage_key=key,
    )
    db.add(att)
    try:
        await db.commit()
    except Exception:
        get_storage().delete(key)
        raise
    log.info("attachment.upload user=%s att=%s type=%s size=%d", user.user_id, att_id, det.mime, len(data))
    return att


@router.get("", response_model=list[AttachmentOut])
async def list_attachments(round_id: str, user: CurrentUser, db: DB) -> list[Attachment]:
    stmt = (
        select(Attachment)
        .where(Attachment.user_id == user.user_id, Attachment.round_id == round_id)
        .order_by(Attachment.uploaded_at.desc())
        .limit(MAX_PER_ROUND)
    )
    return list((await db.scalars(stmt)).all())


_INLINE = ("image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/quicktime", "video/webm", "application/pdf")


@router.get("/{attachment_id}/file", include_in_schema=False)
async def download_attachment(attachment_id: str, user: CurrentUser, db: DB, download: bool = False) -> FileResponse:
    att = await owned_attachment(db, user.user_id, attachment_id)
    path = get_storage().path(att.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="not_found")
    inline = att.file_type in _INLINE and not download
    disposition = "inline" if inline else "attachment"
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(att.file_name)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
        "Cross-Origin-Resource-Policy": "same-origin",
    }
    if att.file_type != "application/pdf":
        # Even if a crafted file is opened directly, it can't run script in our origin.
        headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
    return FileResponse(path, media_type=att.file_type, headers=headers)


@router.delete("/{attachment_id}", response_model=Deleted)
async def delete_attachment(attachment_id: str, user: CurrentUser, db: DB) -> Deleted:
    att = await owned_attachment(db, user.user_id, attachment_id)
    key = att.storage_key
    await db.delete(att)
    await db.commit()
    get_storage().delete(key)
    return Deleted(deleted=1)
