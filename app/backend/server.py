import asyncio
import logging
import os
import re
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import httpx
import requests
from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------- Object Storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "interview-tracker"
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as exc:
        logging.getLogger(__name__).error("init_storage failed: %s", exc)
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="storage_not_initialized")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        # stale key, reset and retry once
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="storage_not_initialized")
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Indexes ----------
INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id_unique", unique=True),
    ],
    "user_sessions": [
        IndexModel([("session_token", ASCENDING)], name="session_token_unique", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id_idx"),
        IndexModel([("expires_at", ASCENDING)], name="expires_at_ttl", expireAfterSeconds=0),
    ],
    "applications": [
        IndexModel([("application_id", ASCENDING)], name="application_id_unique", unique=True),
        IndexModel([("user_id", ASCENDING), ("applied_date", DESCENDING)], name="user_applied"),
    ],
    "interview_rounds": [
        IndexModel([("round_id", ASCENDING)], name="round_id_unique", unique=True),
        IndexModel([("application_id", ASCENDING), ("round_number", ASCENDING)], name="app_round"),
        IndexModel([("user_id", ASCENDING), ("interview_date", ASCENDING)], name="user_date"),
    ],
    "interview_questions": [
        IndexModel([("question_id", ASCENDING)], name="question_id_unique", unique=True),
        IndexModel([("user_id", ASCENDING), ("round_id", ASCENDING)], name="user_round"),
        IndexModel([("user_id", ASCENDING), ("category", ASCENDING)], name="user_category"),
    ],
    "attachments": [
        IndexModel([("attachment_id", ASCENDING)], name="attachment_id_unique", unique=True),
        IndexModel([("user_id", ASCENDING), ("round_id", ASCENDING)], name="user_round_att"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")


# ---------- Models ----------
def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SessionRequest(BaseModel):
    session_id: str


class User(BaseModel):
    user_id: str
    name: str
    email: str
    profile_image: Optional[str] = None
    created_at: datetime


class ApplicationIn(BaseModel):
    company_name: str
    company_website: Optional[str] = ""
    job_role: str
    job_description: Optional[str] = ""
    job_location: Optional[str] = ""
    job_type: Optional[str] = "Full-time"
    employment_type: Optional[str] = ""
    applied_date: Optional[str] = None  # ISO date string
    job_source: Optional[str] = "Other"
    recruiter_name: Optional[str] = ""
    recruiter_email: Optional[str] = ""
    recruiter_phone: Optional[str] = ""
    expected_ctc: Optional[str] = ""
    offered_ctc: Optional[str] = ""
    notice_period: Optional[str] = ""
    application_status: str = "Applied"


class RoundIn(BaseModel):
    application_id: str
    round_number: int = 1
    round_name: str
    interview_type: str = "Technical"
    interview_types: List[str] = []
    interview_date: Optional[str] = None
    interview_time: Optional[str] = ""
    duration: Optional[str] = ""
    interviewer_name: Optional[str] = ""
    interviewer_designation: Optional[str] = ""
    interviewer_email: Optional[str] = ""
    interview_platform: Optional[str] = "Google Meet"
    meeting_link: Optional[str] = ""
    interview_status: str = "Scheduled"
    interview_result: str = "Pending"
    feedback: Optional[str] = ""
    difficulty: Optional[str] = "Medium"
    notes: Optional[str] = ""


class QuestionIn(BaseModel):
    round_id: Optional[str] = None
    application_id: Optional[str] = None
    question: str
    answer: Optional[str] = ""
    category: str = "Other"
    difficulty: str = "Medium"
    tags: Optional[List[str]] = []
    notes: Optional[str] = ""


# ---------- Auth ----------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="invalid_token")
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < utcnow():
        raise HTTPException(status_code=401, detail="expired_token")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="user_not_found")
    return user


@api_router.post("/auth/session")
async def auth_session(payload: SessionRequest):
    session_id = payload.session_id
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="invalid_session")
    data = resp.json()
    email = data.get("email")
    name = data.get("name") or email
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="bad_session_data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "profile_image": picture}},
        )
        user = {**existing, "name": name, "profile_image": picture}
    else:
        user_id = new_id("usr")
        user = {
            "user_id": user_id,
            "name": name,
            "email": email,
            "profile_image": picture,
            "created_at": utcnow(),
        }
        await db.users.insert_one({**user})
        user.pop("_id", None)

    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(days=7),
        }
    )
    return {"session_token": session_token, "user": {k: v for k, v in user.items() if k != "_id"}}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "_id"}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Applications ----------
@api_router.post("/applications")
async def create_application(payload: ApplicationIn, user: dict = Depends(get_current_user)):
    doc = payload.dict()
    doc["application_id"] = new_id("app")
    doc["user_id"] = user["user_id"]
    doc["created_at"] = utcnow()
    doc["updated_at"] = utcnow()
    if not doc.get("applied_date"):
        doc["applied_date"] = utcnow().date().isoformat()
    if doc.get("application_status") in ("Offer Received", "Offer Accepted"):
        doc["offer_date"] = utcnow().date().isoformat()
    await db.applications.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api_router.get("/applications")
async def list_applications(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query: dict = {"user_id": user["user_id"]}
    if status and status != "All":
        query["application_status"] = status
    if q:
        rq = re.escape(q)
        query["$or"] = [
            {"company_name": {"$regex": rq, "$options": "i"}},
            {"job_role": {"$regex": rq, "$options": "i"}},
        ]
    cursor = db.applications.find(query, {"_id": 0}).sort("applied_date", -1)
    return await cursor.to_list(length=500)


@api_router.get("/applications/{application_id}")
async def get_application(application_id: str, user: dict = Depends(get_current_user)):
    doc = await db.applications.find_one(
        {"application_id": application_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="not_found")
    return doc


@api_router.put("/applications/{application_id}")
async def update_application(application_id: str, payload: ApplicationIn, user: dict = Depends(get_current_user)):
    update = payload.dict()
    update["updated_at"] = utcnow()
    if payload.application_status in ("Offer Received", "Offer Accepted"):
        prev = await db.applications.find_one(
            {"application_id": application_id, "user_id": user["user_id"]}, {"_id": 0, "offer_date": 1}
        )
        if prev is not None and not prev.get("offer_date"):
            update["offer_date"] = utcnow().date().isoformat()
    result = await db.applications.update_one(
        {"application_id": application_id, "user_id": user["user_id"]}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="not_found")
    await db.interview_rounds.update_many(
        {"application_id": application_id, "user_id": user["user_id"]},
        {"$set": {"company_name": payload.company_name}},
    )
    doc = await db.applications.find_one(
        {"application_id": application_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    return doc


@api_router.delete("/applications/{application_id}")
async def delete_application(application_id: str, user: dict = Depends(get_current_user)):
    result = await db.applications.delete_one(
        {"application_id": application_id, "user_id": user["user_id"]}
    )
    # Cascade
    await db.interview_rounds.delete_many(
        {"application_id": application_id, "user_id": user["user_id"]}
    )
    await db.interview_questions.delete_many(
        {"application_id": application_id, "user_id": user["user_id"]}
    )
    await db.attachments.delete_many(
        {"application_id": application_id, "user_id": user["user_id"]}
    )
    return {"deleted": result.deleted_count}


# ---------- Interview Rounds ----------
def normalize_round(doc: dict) -> dict:
    """Keep interview_types (multi) and interview_type (display string) in sync."""
    types = [t for t in (doc.get("interview_types") or []) if t]
    if not types and doc.get("interview_type"):
        types = [t.strip() for t in doc["interview_type"].split("+") if t.strip()]
    doc["interview_types"] = types
    doc["interview_type"] = " + ".join(types) if types else "Other"
    return doc


@api_router.post("/rounds")
async def create_round(payload: RoundIn, user: dict = Depends(get_current_user)):
    app_doc = await db.applications.find_one(
        {"application_id": payload.application_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not app_doc:
        raise HTTPException(status_code=404, detail="application_not_found")
    doc = normalize_round(payload.dict())
    doc["round_id"] = new_id("rnd")
    doc["user_id"] = user["user_id"]
    doc["company_name"] = app_doc["company_name"]
    doc["created_at"] = utcnow()
    await db.interview_rounds.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api_router.get("/rounds")
async def list_rounds(
    user: dict = Depends(get_current_user),
    application_id: Optional[str] = None,
    status: Optional[str] = None,
    upcoming: Optional[bool] = None,
):
    query: dict = {"user_id": user["user_id"]}
    if application_id:
        query["application_id"] = application_id
    if status:
        query["interview_status"] = status
    cursor = db.interview_rounds.find(query, {"_id": 0}).sort("interview_date", 1)
    rounds = await cursor.to_list(length=1000)
    if upcoming:
        today = utcnow().date().isoformat()
        rounds = [r for r in rounds if (r.get("interview_date") or "") >= today and r.get("interview_status") == "Scheduled"]
    return rounds


@api_router.get("/rounds/{round_id}")
async def get_round(round_id: str, user: dict = Depends(get_current_user)):
    doc = await db.interview_rounds.find_one(
        {"round_id": round_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="not_found")
    return doc


@api_router.put("/rounds/{round_id}")
async def update_round(round_id: str, payload: RoundIn, user: dict = Depends(get_current_user)):
    update = normalize_round(payload.dict())
    update["updated_at"] = utcnow()
    app_doc = await db.applications.find_one(
        {"application_id": payload.application_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not app_doc:
        raise HTTPException(status_code=404, detail="application_not_found")
    update["company_name"] = app_doc["company_name"]
    result = await db.interview_rounds.update_one(
        {"round_id": round_id, "user_id": user["user_id"]}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="not_found")
    doc = await db.interview_rounds.find_one(
        {"round_id": round_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    return doc


@api_router.delete("/rounds/{round_id}")
async def delete_round(round_id: str, user: dict = Depends(get_current_user)):
    result = await db.interview_rounds.delete_one(
        {"round_id": round_id, "user_id": user["user_id"]}
    )
    await db.interview_questions.delete_many(
        {"round_id": round_id, "user_id": user["user_id"]}
    )
    await db.attachments.delete_many(
        {"round_id": round_id, "user_id": user["user_id"]}
    )
    return {"deleted": result.deleted_count}


# ---------- Questions ----------
@api_router.post("/questions")
async def create_question(payload: QuestionIn, user: dict = Depends(get_current_user)):
    doc = payload.dict()
    doc["question_id"] = new_id("qst")
    doc["user_id"] = user["user_id"]
    doc["created_at"] = utcnow()
    # If round provided and no application, derive it
    if doc.get("round_id") and not doc.get("application_id"):
        rnd = await db.interview_rounds.find_one({"round_id": doc["round_id"], "user_id": user["user_id"]}, {"_id": 0})
        if rnd:
            doc["application_id"] = rnd.get("application_id")
    await db.interview_questions.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api_router.get("/questions")
async def list_questions(
    user: dict = Depends(get_current_user),
    round_id: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    query: dict = {"user_id": user["user_id"]}
    if round_id:
        query["round_id"] = round_id
    if category and category != "All":
        query["category"] = category
    if q:
        rq = re.escape(q)
        query["$or"] = [
            {"question": {"$regex": rq, "$options": "i"}},
            {"answer": {"$regex": rq, "$options": "i"}},
        ]
    cursor = db.interview_questions.find(query, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=1000)


@api_router.put("/questions/{question_id}")
async def update_question(question_id: str, payload: QuestionIn, user: dict = Depends(get_current_user)):
    update = payload.dict()
    result = await db.interview_questions.update_one(
        {"question_id": question_id, "user_id": user["user_id"]}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="not_found")
    doc = await db.interview_questions.find_one(
        {"question_id": question_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    return doc


@api_router.delete("/questions/{question_id}")
async def delete_question(question_id: str, user: dict = Depends(get_current_user)):
    result = await db.interview_questions.delete_one(
        {"question_id": question_id, "user_id": user["user_id"]}
    )
    return {"deleted": result.deleted_count}


# ---------- Attachments ----------
@api_router.post("/attachments/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    round_id: str = Form(...),
    user: dict = Depends(get_current_user),
):
    rnd = await db.interview_rounds.find_one(
        {"round_id": round_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not rnd:
        raise HTTPException(status_code=404, detail="round_not_found")

    data = await file.read()
    ext = (file.filename or "file").split(".")[-1] if "." in (file.filename or "") else "bin"
    att_id = new_id("att")
    storage_path = f"{APP_NAME}/uploads/{user['user_id']}/{att_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"

    try:
        result = await run_in_threadpool(put_object, storage_path, data, content_type)
    except Exception as exc:
        logging.getLogger(__name__).exception("upload failed")
        raise HTTPException(status_code=500, detail=f"upload_failed: {exc}")

    doc = {
        "attachment_id": att_id,
        "user_id": user["user_id"],
        "application_id": rnd["application_id"],
        "round_id": round_id,
        "file_name": file.filename or f"{att_id}.{ext}",
        "file_type": content_type,
        "storage_path": result["path"],
        "size": result.get("size", len(data)),
        "uploaded_at": utcnow(),
    }
    await db.attachments.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api_router.get("/attachments")
async def list_attachments(round_id: str, user: dict = Depends(get_current_user)):
    cursor = db.attachments.find(
        {"user_id": user["user_id"], "round_id": round_id}, {"_id": 0}
    ).sort("uploaded_at", -1)
    return await cursor.to_list(length=200)


@api_router.get("/attachments/{attachment_id}/file")
async def download_attachment(
    attachment_id: str,
    token: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    # Allow token via query (for web <img> tags) or Authorization header
    bearer = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization.split(" ", 1)[1].strip()
    bearer = bearer or token
    if not bearer:
        raise HTTPException(status_code=401, detail="missing_token")
    session = await db.user_sessions.find_one({"session_token": bearer}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="invalid_token")
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < utcnow():
        raise HTTPException(status_code=401, detail="expired_token")

    doc = await db.attachments.find_one(
        {"attachment_id": attachment_id, "user_id": session["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="not_found")
    content, content_type = await run_in_threadpool(get_object, doc["storage_path"])
    return Response(content=content, media_type=content_type)


@api_router.delete("/attachments/{attachment_id}")
async def delete_attachment(attachment_id: str, user: dict = Depends(get_current_user)):
    result = await db.attachments.delete_one(
        {"attachment_id": attachment_id, "user_id": user["user_id"]}
    )
    return {"deleted": result.deleted_count}


# ---------- Dashboard ----------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    apps = await db.applications.find({"user_id": uid}, {"_id": 0}).to_list(length=2000)
    rounds = await db.interview_rounds.find({"user_id": uid}, {"_id": 0}).to_list(length=5000)

    status_counts: dict[str, int] = {}
    for a in apps:
        s = a.get("application_status", "Applied")
        status_counts[s] = status_counts.get(s, 0) + 1

    today_iso = utcnow().date().isoformat()
    scheduled = [r for r in rounds if r.get("interview_status") == "Scheduled"]
    completed = [r for r in rounds if r.get("interview_status") == "Completed"]
    upcoming = [r for r in scheduled if (r.get("interview_date") or "") >= today_iso]

    # Applications by month (last 6 months)
    by_month: dict[str, int] = {}
    for a in apps:
        d = a.get("applied_date") or ""
        if len(d) >= 7:
            key = d[:7]
            by_month[key] = by_month.get(key, 0) + 1
    monthly = [{"month": k, "count": v} for k, v in sorted(by_month.items())][-6:]

    # Rounds by company (top 6)
    by_company: dict[str, int] = {}
    for r in rounds:
        c = r.get("company_name", "Unknown")
        by_company[c] = by_company.get(c, 0) + 1
    rounds_by_company = sorted(
        [{"company": k, "count": v} for k, v in by_company.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:6]

    offers = status_counts.get("Offer Received", 0) + status_counts.get("Offer Accepted", 0)
    rejections = status_counts.get("Rejected", 0)
    in_progress = sum(
        status_counts.get(s, 0)
        for s in ("Applied", "Recruiter Screening", "Interview Scheduled", "Interview In Progress", "On Hold", "Interested")
    )

    return {
        "total_companies": len({a.get("company_name") for a in apps if a.get("company_name")}),
        "total_applications": len(apps),
        "total_interviews_scheduled": len(scheduled),
        "interviews_completed": len(completed),
        "interviews_upcoming": len(upcoming),
        "offers": offers,
        "rejections": rejections,
        "in_progress": in_progress,
        "status_distribution": [{"status": k, "count": v} for k, v in status_counts.items()],
        "applications_by_month": monthly,
        "rounds_by_company": rounds_by_company,
        "upcoming_rounds": upcoming[:5],
    }


app.include_router(api_router)

from exports import build_exports_router  # noqa: E402

app.include_router(build_exports_router(db, get_object))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def _startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    try:
        await run_in_threadpool(init_storage)
    except Exception as exc:
        logger.error("storage init on startup: %s", exc)


@app.on_event("shutdown")
async def _shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
