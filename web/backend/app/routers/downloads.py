import hashlib
import logging
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from ..config import get_settings
from ..deps import DB, client_ip
from ..models import DownloadEvent
from ..security import limiter

APK_MIME = "application/vnd.android.package-archive"
log = logging.getLogger("hirelog.downloads")
router = APIRouter(prefix="/downloads", tags=["downloads"])


class AndroidOut(BaseModel):
    available: bool
    version: str = ""
    min_android: str = ""
    size: Optional[int] = None
    sha256: str = ""
    updated_at: Optional[datetime] = None
    url: str = ""
    shared_account: bool = False


@dataclass(frozen=True)
class _ApkInfo:
    key: tuple[int, int]
    size: int
    sha256: str
    updated_at: datetime


_cache: Optional[_ApkInfo] = None


def _inspect(path) -> Optional[_ApkInfo]:
    """Hash the APK, re-using the cached digest while the file is unchanged. Rejects anything that isn't an APK."""
    global _cache
    try:
        st = path.stat()
    except FileNotFoundError:
        return None
    key = (st.st_mtime_ns, st.st_size)
    if _cache and _cache.key == key:
        return _cache
    try:
        with zipfile.ZipFile(path) as z:
            if "AndroidManifest.xml" not in z.namelist():
                raise zipfile.BadZipFile("no AndroidManifest.xml")
    except (zipfile.BadZipFile, OSError) as exc:
        log.warning("Ignoring %s: not a valid APK (%s)", path, exc)
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    _cache = _ApkInfo(key, st.st_size, h.hexdigest(), datetime.fromtimestamp(st.st_mtime, timezone.utc))
    return _cache


def _file_name(version: str) -> str:
    v = re.sub(r"[^0-9A-Za-z._-]", "", version)[:32]
    return f"HireLog-{v}.apk" if v else "HireLog.apk"


async def _count_download(db, version: str) -> None:
    db.add(DownloadEvent(platform="android", version=version[:40]))
    await db.commit()


@router.get("/android", response_model=AndroidOut)
async def android_info() -> AndroidOut:
    s = get_settings()
    base = {"version": s.android_version, "min_android": s.android_min_version, "shared_account": s.android_shared_account}
    if s.android_apk_url:
        # Routed through our own endpoint so downloads are counted before redirecting to the external host.
        return AndroidOut(available=True, url="/api/downloads/android/external", sha256=s.android_apk_sha256, **base)
    info = await run_in_threadpool(_inspect, s.android_apk_path)
    if not info:
        return AndroidOut(available=False, **base)
    return AndroidOut(
        available=True, size=info.size, sha256=info.sha256, updated_at=info.updated_at,
        url=f"/api/downloads/android/{_file_name(s.android_version)}", **base,
    )


@router.get("/android/{name}", include_in_schema=False)
async def android_apk(name: str, request: Request, db: DB):
    s = get_settings()
    if not limiter.allow(f"apk:{client_ip(request)}", 20, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_requests")
    if s.android_apk_url:
        if name != "external":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        await _count_download(db, s.android_version)
        return RedirectResponse(s.android_apk_url, status_code=302)
    info = await run_in_threadpool(_inspect, s.android_apk_path)
    if not info or name != _file_name(s.android_version):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    # Resumed downloads send Range: bytes=N- ; only count requests that start at the beginning.
    rng = request.headers.get("range", "")
    if not rng or rng.replace(" ", "").startswith("bytes=0-"):
        await _count_download(db, s.android_version)
    return FileResponse(
        s.android_apk_path,
        media_type=APK_MIME,
        filename=_file_name(s.android_version),
        headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "X-Checksum-SHA256": info.sha256},
    )
