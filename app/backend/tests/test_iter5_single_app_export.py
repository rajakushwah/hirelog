# Iteration 5: per-application Excel + PDF export isolation, auth, filenames, offer_date, xlsx sanitisation, PDF zero counts
import io
import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv
from openpyxl import load_workbook
from pymongo import MongoClient
from pypdf import PdfReader

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = "test_session_token_123"
H = {"Authorization": f"Bearer {TOKEN}"}
OFFER_APP = "app_bcb08632c3dc"
from PIL import Image as _Img
_b = io.BytesIO(); _Img.new("RGB", (40, 30), (200, 50, 50)).save(_b, format="PNG"); PNG = _b.getvalue()


def pdf_text(content):
    return "".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(content)).pages)


def make_app(company, role, status="Applied", n_q=1):
    r = requests.post(f"{API}/applications", headers=H, json={"company_name": company, "job_role": role, "application_status": status})
    assert r.status_code in (200, 201), r.text
    aid = r.json()["application_id"]
    rid = requests.post(f"{API}/rounds", headers=H, json={"application_id": aid, "round_name": f"{company}_Round"}).json()["round_id"]
    for i in range(n_q):
        requests.post(f"{API}/questions", headers=H, json={"round_id": rid, "application_id": aid, "question": f"{company}_Q{i}"})
    up = requests.post(f"{API}/attachments/upload", headers=H, data={"round_id": rid}, files={"file": (f"{company}_pic.png", PNG, "image/png")})
    assert up.status_code == 200, up.text
    return aid, rid


@pytest.fixture(scope="module")
def two_apps():
    a1 = make_app("TEST_Amazonx", "TEST_SDE", n_q=2)
    a2 = make_app("TEST_Googlex", "TEST_SWE", n_q=1)
    yield {"a1": a1, "a2": a2}
    for aid, _ in (a1, a2):
        requests.delete(f"{API}/applications/{aid}", headers=H)


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(os.environ["MONGO_URL"])
    yield c[os.environ["DB_NAME"]]
    c.close()


@pytest.fixture(scope="module")
def other_user(mongo):
    uid = f"usr_TEST_{uuid.uuid4().hex[:8]}"
    tok = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    mongo.users.insert_one({"user_id": uid, "email": f"{uid}@example.com", "name": "TEST Other", "created_at": now})
    mongo.user_sessions.insert_one({"session_token": tok, "user_id": uid, "created_at": now, "expires_at": now + timedelta(days=1)})
    hdr = {"Authorization": f"Bearer {tok}"}
    aid = requests.post(f"{API}/applications", headers=hdr, json={"company_name": "TEST_OtherCo", "job_role": "x"}).json()["application_id"]
    yield {"h": hdr, "app_id": aid}
    requests.delete(f"{API}/applications/{aid}", headers=hdr)
    mongo.users.delete_one({"user_id": uid})
    mongo.user_sessions.delete_one({"session_token": tok})


# ---- Single-app xlsx ----
class TestSingleSheet:
    @pytest.mark.parametrize("mode", ["bearer", "query"])
    def test_only_that_app_in_all_tabs(self, two_apps, mode):
        aid, rid = two_apps["a1"]
        other_aid, other_rid = two_apps["a2"]
        url = f"{API}/export/sheet?application_id={aid}"
        r = requests.get(url, headers=H) if mode == "bearer" else requests.get(f"{url}&token={TOKEN}")
        assert r.status_code == 200, r.text
        assert "TEST_Amazonx" in r.headers["content-disposition"] and ".xlsx" in r.headers["content-disposition"]
        wb = load_workbook(io.BytesIO(r.content))
        apps = [row for row in wb["Applications"].iter_rows(min_row=2, values_only=True)]
        assert [a[0] for a in apps] == [aid]
        rounds = list(wb["Interview_Rounds"].iter_rows(min_row=2, values_only=True))
        assert [x[0] for x in rounds] == [rid]
        qs = list(wb["Interview_Questions"].iter_rows(min_row=2, values_only=True))
        assert len(qs) == 2 and all(q[2] == aid for q in qs)
        atts = list(wb["Attachments"].iter_rows(min_row=2, values_only=True))
        assert len(atts) == 1 and atts[0][1] == aid
        blob = " ".join(str(c) for ws in wb for row in ws.iter_rows(values_only=True) for c in row if c)
        assert "Googlex" not in blob and other_aid not in blob and "Cisco" not in blob

    def test_offer_app_has_attachments(self):
        r = requests.get(f"{API}/export/sheet?application_id={OFFER_APP}", headers=H)
        assert r.status_code == 200
        wb = load_workbook(io.BytesIO(r.content))
        assert [row[0] for row in wb["Applications"].iter_rows(min_row=2, values_only=True)] == [OFFER_APP]
        assert any(row[2] == "rnd_bb2451712426" for row in wb["Attachments"].iter_rows(min_row=2, values_only=True))

    def test_404_and_401(self, other_user):
        assert requests.get(f"{API}/export/sheet?application_id=app_nope", headers=H).status_code == 404
        assert requests.get(f"{API}/export/sheet?application_id={other_user['app_id']}", headers=H).status_code == 404
        assert requests.get(f"{API}/export/sheet?application_id={OFFER_APP}", headers=other_user["h"]).status_code == 404
        assert requests.get(f"{API}/export/sheet?application_id={OFFER_APP}").status_code == 401

    def test_formula_prefix_and_ctrl_chars(self):
        r = requests.post(f"{API}/applications", headers=H, json={"company_name": "=SUM(1,2)\x07", "job_role": "+TEST_r", "job_description": "@x -y"})
        aid = r.json()["application_id"]
        try:
            resp = requests.get(f"{API}/export/sheet?application_id={aid}", headers=H)
            assert resp.status_code == 200
            row = next(wb_row for wb_row in load_workbook(io.BytesIO(resp.content))["Applications"].iter_rows(min_row=2))
            assert row[1].value == "'=SUM(1,2)" and row[1].data_type != "f"
            assert row[3].value == "'+TEST_r" and row[4].value == "'@x -y"
        finally:
            requests.delete(f"{API}/applications/{aid}", headers=H)


# ---- Single-app PDF ----
class TestSinglePdf:
    @pytest.mark.parametrize("mode", ["bearer", "query"])
    def test_only_that_app(self, two_apps, mode):
        aid, _ = two_apps["a1"]
        url = f"{API}/export/pdf?application_id={aid}"
        r = requests.get(url, headers=H, timeout=60) if mode == "bearer" else requests.get(f"{url}&token={TOKEN}", timeout=60)
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert "TEST_Amazonx" in r.headers["content-disposition"]
        text = pdf_text(r.content)
        assert "TEST_Amazonx" in text and "TEST_Amazonx_Q1" in text
        assert "Googlex" not in text and "Cisco" not in text
        assert sum(len(p.images) for p in PdfReader(io.BytesIO(r.content)).pages) >= 1

    def test_cisco_only(self):
        r = requests.get(f"{API}/export/pdf?application_id={OFFER_APP}", headers=H, timeout=60)
        assert r.status_code == 200
        text = pdf_text(r.content)
        assert "Cisco" in text and "TEST_Amazonx" not in text

    def test_404_and_401(self, other_user):
        assert requests.get(f"{API}/export/pdf?application_id=app_nope", headers=H).status_code == 404
        assert requests.get(f"{API}/export/pdf?application_id={OFFER_APP}", headers=other_user["h"]).status_code == 404
        assert requests.get(f"{API}/export/pdf?application_id={OFFER_APP}").status_code == 401
        assert requests.get(f"{API}/export/pdf?application_id={OFFER_APP}&token=bogus").status_code == 401

    def test_zero_counts_and_rupee(self):
        r = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_Zero ₹", "job_role": "TEST_r", "offered_ctc": "₹30L"})
        aid = r.json()["application_id"]
        try:
            resp = requests.get(f"{API}/export/pdf?application_id={aid}", headers=H)
            assert resp.status_code == 200
            cover = PdfReader(io.BytesIO(resp.content)).pages[0].extract_text()
            flat = cover.replace(" ", "").replace("\n", "")
            assert "Interviewrounds0" in flat and "Questionslogged0" in flat and "Attachments0" in flat
            assert "₹" in pdf_text(resp.content)
        finally:
            requests.delete(f"{API}/applications/{aid}", headers=H)

    def test_non_latin1_company_name_no_500(self):
        # Content-Disposition header must be latin-1 encodable
        r = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_टाटा 公司", "job_role": "TEST_r"})
        aid = r.json()["application_id"]
        try:
            assert requests.get(f"{API}/export/pdf?application_id={aid}", headers=H).status_code == 200
            assert requests.get(f"{API}/export/sheet?application_id={aid}", headers=H).status_code == 200
        finally:
            requests.delete(f"{API}/applications/{aid}", headers=H)


# ---- Full export still everything ----
def test_full_sheet_contains_both(two_apps):
    wb = load_workbook(io.BytesIO(requests.get(f"{API}/export/sheet", headers=H).content))
    ids = {row[0] for row in wb["Applications"].iter_rows(min_row=2, values_only=True)}
    assert {two_apps["a1"][0], two_apps["a2"][0], OFFER_APP} <= ids


# ---- offer_date ----
def test_offer_date_set_once():
    aid = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_Offer", "job_role": "r"}).json()["application_id"]
    try:
        g = requests.get(f"{API}/applications/{aid}", headers=H).json()
        assert not g.get("offer_date")
        body = {"company_name": "TEST_Offer", "job_role": "r", "application_status": "Offer Received"}
        assert requests.put(f"{API}/applications/{aid}", headers=H, json=body).status_code == 200
        g = requests.get(f"{API}/applications/{aid}", headers=H).json()
        assert g.get("offer_date") == date.today().isoformat() or g.get("offer_date")
        first = g["offer_date"]
        body["application_status"] = "Offer Accepted"
        requests.put(f"{API}/applications/{aid}", headers=H, json=body)
        assert requests.get(f"{API}/applications/{aid}", headers=H).json()["offer_date"] == first
    finally:
        requests.delete(f"{API}/applications/{aid}", headers=H)
