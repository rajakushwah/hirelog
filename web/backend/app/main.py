import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import BASE_DIR, get_settings
from .db import dispose_engine
from .middleware import BodySizeLimitMiddleware, OriginCheckMiddleware, SecurityHeadersMiddleware
from .routers import admin, applications, attachments, auth, contact, dashboard, downloads, exports, questions, rounds
from .storage import get_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("hirelog")


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "migrations"))
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    get_storage()
    if s.auto_migrate:
        await run_in_threadpool(run_migrations)
    if s.env == "production" and not s.secure_cookies:
        log.warning("Running in production without secure cookies. Serve over HTTPS and set HIRELOG_COOKIE_SECURE=true.")
    yield
    await dispose_engine()


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        return
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    root = dist.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="not_found")
        candidate = (root / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


def create_app() -> FastAPI:
    s = get_settings()
    dev = s.env != "production"
    app = FastAPI(
        title="HireLog API",
        lifespan=lifespan,
        docs_url="/api/docs" if dev else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if dev else None,
    )

    api = APIRouter(prefix="/api")

    @api.get("/health", include_in_schema=False)
    async def health() -> dict:
        return {"status": "ok"}

    for r in (auth, applications, rounds, questions, attachments, dashboard, exports, contact, downloads, admin):
        api.include_router(r.router)
    app.include_router(api)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]
        return JSONResponse({"detail": "validation_error", "errors": errors}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "internal_error"}, status_code=500)

    _mount_frontend(app, s.frontend_dist)

    hosts = set(s.allowed_hosts)
    public_host = urlsplit(s.public_origin).hostname
    if public_host:
        hosts.add(public_host)
    # Order matters: the last added runs first.
    # APKs are already zip-compressed; gzipping them wastes CPU and breaks resumable (Range) downloads.
    app.add_middleware(GZipMiddleware, minimum_size=1024, exclude_content_types=("text/event-stream", downloads.APK_MIME))
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(OriginCheckMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=sorted(hosts))
    return app


app = create_app()
