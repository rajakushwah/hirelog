# Interview Tracker API regression tests: auth, applications, rounds, questions, attachments, dashboard, isolation
import os
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = "test_session_token_123"
H = {"Authorization": f"Bearer {TOKEN}"}

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4"
    "0000000049454e44ae426082"
)


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(os.environ["MONGO_URL"])
    yield c[os.environ["DB_NAME"]]
    c.close()


@pytest.fixture(scope="module")
def second_user(mongo):
    uid = f"usr_TEST_{uuid.uuid4().hex[:8]}"
    tok = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    mongo.users.insert_one({"user_id": uid, "email": f"{uid}@example.com", "name": "TEST Other", "created_at": now})
    mongo.user_sessions.insert_one({"session_token": tok, "user_id": uid, "created_at": now, "expires_at": now + timedelta(days=1)})
    yield {"Authorization": f"Bearer {tok}"}
    mongo.users.delete_one({"user_id": uid})
    mongo.user_sessions.delete_one({"session_token": tok})


@pytest.fixture(scope="module")
def state():
    s = {}
    yield s
    if s.get("app_id"):
        requests.delete(f"{API}/applications/{s['app_id']}", headers=H)


# Auth
def test_auth_me():
    r = requests.get(f"{API}/auth/me", headers=H)
    assert r.status_code == 200
    d = r.json()
    assert d["user_id"] == "usr_testuser0001" and d["email"] == "test.user@example.com" and "_id" not in d


def test_auth_me_no_token():
    assert requests.get(f"{API}/auth/me").status_code == 401
    assert requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer bogus"}).status_code == 401


# Applications
def test_app_create_get(state):
    base = requests.get(f"{API}/dashboard/stats", headers=H).json()
    state["base"] = base
    r = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_Acme", "job_role": "TEST Engineer", "application_status": "Applied"})
    assert r.status_code == 200
    d = r.json()
    assert d["company_name"] == "TEST_Acme" and d["application_id"].startswith("app_") and d["applied_date"]
    state["app_id"] = d["application_id"]
    g = requests.get(f"{API}/applications/{d['application_id']}", headers=H)
    assert g.status_code == 200 and g.json()["job_role"] == "TEST Engineer"


def test_app_validation():
    r = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_x"})
    assert r.status_code == 422


def test_app_list_filters(state):
    lst = requests.get(f"{API}/applications", headers=H).json()
    assert any(a["application_id"] == state["app_id"] for a in lst)
    q = requests.get(f"{API}/applications", headers=H, params={"q": "test_acm"}).json()
    assert [a["application_id"] for a in q] == [state["app_id"]] or state["app_id"] in [a["application_id"] for a in q]
    st = requests.get(f"{API}/applications", headers=H, params={"status": "Rejected"}).json()
    assert all(a["application_status"] == "Rejected" for a in st)
    assert state["app_id"] not in [a["application_id"] for a in st]


def test_app_search_special_chars():
    r = requests.get(f"{API}/applications", headers=H, params={"q": "C++("})
    assert r.status_code == 200, f"regex not escaped: {r.status_code}"


def test_app_update(state):
    r = requests.put(f"{API}/applications/{state['app_id']}", headers=H, json={"company_name": "TEST_Acme", "job_role": "TEST Senior", "application_status": "Interview Scheduled"})
    assert r.status_code == 200 and r.json()["job_role"] == "TEST Senior"
    g = requests.get(f"{API}/applications/{state['app_id']}", headers=H).json()
    assert g["application_status"] == "Interview Scheduled"


# Rounds
def test_round_crud(state):
    future = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    r = requests.post(f"{API}/rounds", headers=H, json={"application_id": state["app_id"], "round_name": "TEST Tech 1", "interview_date": future})
    assert r.status_code == 200
    d = r.json()
    assert d["company_name"] == "TEST_Acme" and d["interview_status"] == "Scheduled"
    state["round_id"] = d["round_id"]
    assert requests.get(f"{API}/rounds/{d['round_id']}", headers=H).json()["round_name"] == "TEST Tech 1"
    byapp = requests.get(f"{API}/rounds", headers=H, params={"application_id": state["app_id"]}).json()
    assert [x["round_id"] for x in byapp] == [d["round_id"]]
    up = requests.get(f"{API}/rounds", headers=H, params={"upcoming": "true"}).json()
    assert d["round_id"] in [x["round_id"] for x in up]
    stc = requests.get(f"{API}/rounds", headers=H, params={"status": "Completed"}).json()
    assert d["round_id"] not in [x["round_id"] for x in stc]
    p = requests.put(f"{API}/rounds/{d['round_id']}", headers=H, json={"application_id": state["app_id"], "round_name": "TEST Tech 1b", "interview_date": future, "notes": "n"})
    assert p.status_code == 200 and p.json()["round_name"] == "TEST Tech 1b"


def test_round_bad_app():
    r = requests.post(f"{API}/rounds", headers=H, json={"application_id": "app_nope", "round_name": "x"})
    assert r.status_code == 404


# Questions
def test_question_crud(state):
    r = requests.post(f"{API}/questions", headers=H, json={"round_id": state["round_id"], "question": "TEST What is REST?", "category": "Technical"})
    assert r.status_code == 200
    d = r.json()
    assert d["application_id"] == state["app_id"]
    state["q_id"] = d["question_id"]
    assert state["q_id"] in [x["question_id"] for x in requests.get(f"{API}/questions", headers=H, params={"round_id": state["round_id"]}).json()]
    assert state["q_id"] in [x["question_id"] for x in requests.get(f"{API}/questions", headers=H, params={"category": "Technical"}).json()]
    assert state["q_id"] not in [x["question_id"] for x in requests.get(f"{API}/questions", headers=H, params={"category": "HR"}).json()]
    assert state["q_id"] in [x["question_id"] for x in requests.get(f"{API}/questions", headers=H, params={"q": "what is rest"}).json()]
    p = requests.put(f"{API}/questions/{state['q_id']}", headers=H, json={"round_id": state["round_id"], "application_id": state["app_id"], "question": "TEST Q2", "answer": "A", "category": "HR"})
    assert p.status_code == 200 and p.json()["category"] == "HR"
    q2 = requests.post(f"{API}/questions", headers=H, json={"round_id": state["round_id"], "question": "TEST del"}).json()
    assert requests.delete(f"{API}/questions/{q2['question_id']}", headers=H).json()["deleted"] == 1
    assert q2["question_id"] not in [x["question_id"] for x in requests.get(f"{API}/questions", headers=H).json()]


# Attachments
def test_attachment_flow(state):
    r = requests.post(f"{API}/attachments/upload", headers=H, files={"file": ("TEST_a.png", io.BytesIO(PNG), "image/png")}, data={"round_id": state["round_id"]}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    state["att_id"] = d["attachment_id"]
    assert d["file_type"] == "image/png" and d["application_id"] == state["app_id"]
    lst = requests.get(f"{API}/attachments", headers=H, params={"round_id": state["round_id"]}).json()
    assert [x["attachment_id"] for x in lst] == [d["attachment_id"]]
    f1 = requests.get(f"{API}/attachments/{d['attachment_id']}/file", headers=H, timeout=60)
    assert f1.status_code == 200 and f1.content == PNG
    f2 = requests.get(f"{API}/attachments/{d['attachment_id']}/file", params={"token": TOKEN}, timeout=60)
    assert f2.status_code == 200 and f2.content[:4] == PNG[:4]
    assert requests.get(f"{API}/attachments/{d['attachment_id']}/file").status_code == 401


def test_attachment_bad_round():
    r = requests.post(f"{API}/attachments/upload", headers=H, files={"file": ("x.png", io.BytesIO(PNG), "image/png")}, data={"round_id": "rnd_nope"})
    assert r.status_code == 404


# Dashboard
def test_dashboard_updates(state):
    s = requests.get(f"{API}/dashboard/stats", headers=H).json()
    b = state["base"]
    assert s["total_applications"] == b["total_applications"] + 1
    assert s["total_interviews_scheduled"] == b["total_interviews_scheduled"] + 1
    assert s["interviews_upcoming"] == b["interviews_upcoming"] + 1
    assert any(x["company"] == "TEST_Acme" for x in s["rounds_by_company"])
    for k in ("status_distribution", "applications_by_month", "upcoming_rounds", "offers", "rejections", "in_progress"):
        assert k in s


# Data isolation
def test_isolation(state, second_user):
    o = second_user
    assert requests.get(f"{API}/applications/{state['app_id']}", headers=o).status_code == 404
    assert state["app_id"] not in [a["application_id"] for a in requests.get(f"{API}/applications", headers=o).json()]
    assert requests.put(f"{API}/applications/{state['app_id']}", headers=o, json={"company_name": "HACK", "job_role": "x"}).status_code == 404
    assert requests.delete(f"{API}/applications/{state['app_id']}", headers=o).json()["deleted"] == 0
    assert requests.get(f"{API}/rounds/{state['round_id']}", headers=o).status_code == 404
    assert requests.post(f"{API}/rounds", headers=o, json={"application_id": state["app_id"], "round_name": "x"}).status_code == 404
    assert requests.delete(f"{API}/rounds/{state['round_id']}", headers=o).json()["deleted"] == 0
    assert requests.put(f"{API}/questions/{state['q_id']}", headers=o, json={"question": "HACK"}).status_code == 404
    assert requests.delete(f"{API}/questions/{state['q_id']}", headers=o).json()["deleted"] == 0
    assert requests.get(f"{API}/attachments", headers=o, params={"round_id": state["round_id"]}).json() == []
    if state.get("att_id"):
        assert requests.get(f"{API}/attachments/{state['att_id']}/file", headers=o).status_code == 404
    assert requests.post(f"{API}/attachments/upload", headers=o, files={"file": ("x.png", io.BytesIO(PNG), "image/png")}, data={"round_id": state["round_id"]}).status_code == 404
    assert requests.get(f"{API}/dashboard/stats", headers=o).json()["total_applications"] == 0
    # still intact for owner
    assert requests.get(f"{API}/applications/{state['app_id']}", headers=H).json()["company_name"] == "TEST_Acme"


# Deletes + cascade
def test_delete_cascade(state):
    if state.get("att_id"):
        assert requests.delete(f"{API}/attachments/{state['att_id']}", headers=H).json()["deleted"] == 1
        requests.post(f"{API}/attachments/upload", headers=H, files={"file": ("TEST_b.png", io.BytesIO(PNG), "image/png")}, data={"round_id": state["round_id"]}, timeout=120)
    assert requests.delete(f"{API}/applications/{state['app_id']}", headers=H).json()["deleted"] == 1
    assert requests.get(f"{API}/applications/{state['app_id']}", headers=H).status_code == 404
    assert requests.get(f"{API}/rounds/{state['round_id']}", headers=H).status_code == 404
    assert requests.get(f"{API}/questions", headers=H, params={"round_id": state["round_id"]}).json() == []
    assert requests.get(f"{API}/attachments", headers=H, params={"round_id": state["round_id"]}).json() == []
    s = requests.get(f"{API}/dashboard/stats", headers=H).json()
    assert s["total_applications"] == state["base"]["total_applications"]
    state["app_id"] = None
