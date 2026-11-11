# Iteration 4: Spreadsheet (.xlsx) + PDF export endpoints, isolation, attachments handling, removed sheets routes
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

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
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4"
    "0000000049454e44ae426082"
)
XLSX_TABS = ["Applications", "Interview_Rounds", "Interview_Questions", "Attachments"]


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
    hdr = {"Authorization": f"Bearer {tok}"}
    r = requests.post(f"{API}/applications", headers=hdr, json={"company_name": "TEST_OtherCo", "job_role": "TEST_Role"})
    app_id = r.json()["application_id"]
    yield {"h": hdr, "app_id": app_id, "tok": tok}
    requests.delete(f"{API}/applications/{app_id}", headers=hdr)
    mongo.users.delete_one({"user_id": uid})
    mongo.user_sessions.delete_one({"session_token": tok})


@pytest.fixture(scope="module")
def special_app():
    """TEST_ app with special chars, a round, a question, and image/pdf/video/corrupt attachments."""
    r = requests.post(f"{API}/applications", headers=H, json={
        "company_name": "TEST_<b>Acme</b> & Co ₹", "job_role": "TEST_Dev <i>x</i> & ₹50L",
        "job_description": "Line1\nLine2 <script>alert(1)</script> & ₹", "application_status": "Offer Received",
        "applied_date": "2026-01-01",
    })
    assert r.status_code in (200, 201), r.text
    app_id = r.json()["application_id"]
    rr = requests.post(f"{API}/rounds", headers=H, json={"application_id": app_id, "round_name": "TEST_R1 <b>&</b>", "notes": "₹ & <tag>"})
    rid = rr.json()["round_id"]
    requests.post(f"{API}/questions", headers=H, json={"round_id": rid, "application_id": app_id, "question": "TEST_Q <b>bold</b> & ₹?", "answer": "A & <x>"})
    src_pdf = requests.get(f"{API}/export/pdf?application_id={OFFER_APP}", headers=H).content
    for name, data, ct in [("pic.png", PNG, "image/png"), ("doc.pdf", src_pdf, "application/pdf"),
                           ("clip.mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 100, "video/mp4"),
                           ("broken.png", b"notanimage", "image/png"), ("broken.pdf", b"notapdf", "application/pdf")]:
        up = requests.post(f"{API}/attachments/upload", headers=H, data={"round_id": rid}, files={"file": (name, data, ct)})
        assert up.status_code == 200, up.text
    yield {"app_id": app_id, "round_id": rid, "src_pages": len(PdfReader(io.BytesIO(src_pdf)).pages)}
    requests.delete(f"{API}/applications/{app_id}", headers=H)


# ---- Spreadsheet export ----
class TestSheetExport:
    def test_unauth(self):
        assert requests.get(f"{API}/export/sheet").status_code == 401
        assert requests.get(f"{API}/export/sheet?token=bogus").status_code == 401

    @pytest.mark.parametrize("mode", ["bearer", "query"])
    def test_xlsx_tabs_and_user_data(self, mode):
        r = requests.get(f"{API}/export/sheet", headers=H) if mode == "bearer" else requests.get(f"{API}/export/sheet?token={TOKEN}")
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers["content-type"]
        assert ".xlsx" in r.headers.get("content-disposition", "")
        wb = load_workbook(io.BytesIO(r.content))
        assert wb.sheetnames == XLSX_TABS
        app_ids = {row[0] for row in wb["Applications"].iter_rows(min_row=2, values_only=True)}
        mine = {a["application_id"] for a in requests.get(f"{API}/applications", headers=H).json()}
        assert app_ids == mine and OFFER_APP in app_ids
        assert wb["Applications"].cell(1, 1).value == "Application_ID"
        att_rows = list(wb["Attachments"].iter_rows(min_row=2, values_only=True))
        assert any(row[2] == "rnd_bb2451712426" for row in att_rows)

    def test_isolation(self, second_user):
        r = requests.get(f"{API}/export/sheet", headers=second_user["h"])
        assert r.status_code == 200
        wb = load_workbook(io.BytesIO(r.content))
        ids = [row[0] for row in wb["Applications"].iter_rows(min_row=2, values_only=True)]
        assert ids == [second_user["app_id"]]
        assert wb["Interview_Rounds"].max_row == 1

    def test_formula_like_text_stays_text(self):
        r = requests.post(f"{API}/applications", headers=H, json={"company_name": "=HYPERLINK(\"http://x\",\"TEST\")", "job_role": "TEST_formula"})
        aid = r.json()["application_id"]
        try:
            wb = load_workbook(io.BytesIO(requests.get(f"{API}/export/sheet", headers=H).content))
            for row in wb["Applications"].iter_rows(min_row=2):
                if row[0].value == aid:
                    assert row[1].data_type != "f", "company name exported as live formula (CSV/formula injection)"
        finally:
            requests.delete(f"{API}/applications/{aid}", headers=H)

    def test_control_chars_do_not_500(self):
        r = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_ctrl\x07\x0bco", "job_role": "TEST_ctrl"})
        aid = r.json()["application_id"]
        try:
            assert requests.get(f"{API}/export/sheet", headers=H).status_code == 200
        finally:
            requests.delete(f"{API}/applications/{aid}", headers=H)


# ---- PDF export ----
class TestPdfExport:
    def test_unauth(self):
        assert requests.get(f"{API}/export/pdf").status_code == 401
        assert requests.get(f"{API}/export/pdf?token=bogus").status_code == 401

    def test_full_report(self):
        r = requests.get(f"{API}/export/pdf?token={TOKEN}", timeout=90)
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"
        rd = PdfReader(io.BytesIO(r.content))
        assert len(rd.pages) >= 2
        assert "Interview Tracker" in rd.pages[0].extract_text()

    def test_single_app_with_attachments(self):
        r = requests.get(f"{API}/export/pdf?application_id={OFFER_APP}", headers=H, timeout=60)
        assert r.status_code == 200
        assert "Cisco" in r.headers.get("content-disposition", "")
        rd = PdfReader(io.BytesIO(r.content))
        text = "".join(p.extract_text() or "" for p in rd.pages)
        assert "Cisco" in text
        imgs = sum(len(p.images) for p in rd.pages)
        assert imgs >= 1, "expected embedded image attachment"
        assert "Attached PDF" in text

    def test_unknown_and_other_users_app_404(self, second_user):
        assert requests.get(f"{API}/export/pdf?application_id=app_doesnotexist", headers=H).status_code == 404
        assert requests.get(f"{API}/export/pdf?application_id={second_user['app_id']}", headers=H).status_code == 404
        assert requests.get(f"{API}/export/pdf?application_id={OFFER_APP}", headers=second_user["h"]).status_code == 404

    def test_special_chars_and_mixed_attachments(self, special_app):
        r = requests.get(f"{API}/export/pdf?application_id={special_app['app_id']}", headers=H, timeout=60)
        assert r.status_code == 200, r.text[:300]
        rd = PdfReader(io.BytesIO(r.content))
        text = "".join(p.extract_text() or "" for p in rd.pages)
        assert "<b>Acme</b>" in text and "& Co" in text  # markup escaped, not interpreted
        assert "clip.mp4" not in text  # video skipped
        assert "could not be read: broken.pdf" in text
        assert "could not be shown: broken.png" in text
        assert len(rd.pages) >= 1 + special_app["src_pages"]  # attached pdf appended
        assert sum(len(p.images) for p in rd.pages) >= 1

    def test_rupee_symbol_renders(self, special_app):
        # Vera font lacks U+20B9 -> rendered as missing glyph
        r = requests.get(f"{API}/export/pdf?application_id={special_app['app_id']}", headers=H, timeout=60)
        text = PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
        assert "₹" in text


# ---- Regression: Google Sheets routes removed ----
class TestSheetsRemoved:
    @pytest.mark.parametrize("method,path", [("get", "/sheets/status"), ("post", "/sheets/connect"), ("post", "/sheets/sync"),
                                             ("post", "/sheets/disconnect"), ("get", "/oauth/sheets/callback")])
    def test_routes_gone(self, method, path):
        r = getattr(requests, method)(f"{API}{path}", headers=H)
        assert r.status_code in (404, 405)
