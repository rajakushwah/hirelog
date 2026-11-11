# Iteration 2: multi-select round types, attachments upload/download/delete, special-char search regression
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = "test_session_token_123"
H = {"Authorization": f"Bearer {TOKEN}"}
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4"
    "0000000049454e44ae426082"
)
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture(scope="module")
def st():
    s = {}
    r = requests.post(f"{API}/applications", headers=H, json={"company_name": "TEST_Iter2Co", "job_role": "SDE"})
    assert r.status_code == 200, r.text
    s["app_id"] = r.json()["application_id"]
    yield s
    requests.delete(f"{API}/applications/{s['app_id']}", headers=H)


# Rounds: multi-type create
def test_create_round_multi_types(st):
    r = requests.post(f"{API}/rounds", headers=H, json={
        "application_id": st["app_id"], "round_name": "TEST_R1", "round_number": 1,
        "interview_types": ["Technical", "Behavioral", "AI"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["interview_types"] == ["Technical", "Behavioral", "AI"]
    assert d["interview_type"] == "Technical + Behavioral + AI"
    assert "_id" not in d
    st["round_id"] = d["round_id"]
    g = requests.get(f"{API}/rounds/{d['round_id']}", headers=H).json()
    assert g["interview_type"] == "Technical + Behavioral + AI"


# Rounds: PUT updates types
def test_update_round_types(st):
    r = requests.put(f"{API}/rounds/{st['round_id']}", headers=H, json={
        "application_id": st["app_id"], "round_name": "TEST_R1", "interview_types": ["AI"]})
    assert r.status_code == 200, r.text
    assert r.json()["interview_type"] == "AI" and r.json()["interview_types"] == ["AI"]
    lst = requests.get(f"{API}/rounds", headers=H, params={"application_id": st["app_id"]}).json()
    assert lst[0]["interview_type"] == "AI"


# Rounds: legacy single interview_type string still works
def test_legacy_single_type(st):
    r = requests.post(f"{API}/rounds", headers=H, json={
        "application_id": st["app_id"], "round_name": "TEST_R2", "interview_type": "HR"})
    assert r.status_code == 200
    assert r.json()["interview_types"] == ["HR"] and r.json()["interview_type"] == "HR"


# Attachments: upload png + pdf, list, download with token, delete
def test_attachment_lifecycle(st):
    r = requests.post(f"{API}/attachments/upload", headers=H, data={"round_id": st["round_id"]},
                      files={"file": ("TEST_pic.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    att = r.json()
    assert att["file_type"] == "image/png" and att["size"] == len(PNG)
    r2 = requests.post(f"{API}/attachments/upload", headers=H, data={"round_id": st["round_id"]},
                       files={"file": ("TEST_doc.pdf", PDF, "application/pdf")})
    assert r2.status_code == 200, r2.text
    lst = requests.get(f"{API}/attachments", headers=H, params={"round_id": st["round_id"]}).json()
    assert {a["attachment_id"] for a in lst} >= {att["attachment_id"], r2.json()["attachment_id"]}
    dl = requests.get(f"{API}/attachments/{att['attachment_id']}/file", params={"token": TOKEN})
    assert dl.status_code == 200 and dl.content == PNG
    assert "image/png" in dl.headers.get("content-type", "")
    assert requests.get(f"{API}/attachments/{att['attachment_id']}/file").status_code == 401
    assert requests.get(f"{API}/attachments/{att['attachment_id']}/file", params={"token": "bad"}).status_code == 401
    d = requests.delete(f"{API}/attachments/{att['attachment_id']}", headers=H)
    assert d.json()["deleted"] == 1
    assert requests.get(f"{API}/attachments/{att['attachment_id']}/file", params={"token": TOKEN}).status_code == 404


def test_upload_unknown_round():
    r = requests.post(f"{API}/attachments/upload", headers=H, data={"round_id": "rnd_nope"},
                      files={"file": ("x.png", PNG, "image/png")})
    assert r.status_code == 404


# Regression: special char search
@pytest.mark.parametrize("path", ["applications", "questions"])
def test_search_special_chars(path):
    for q in ["C++(", "[a", "*", "a.b?"]:
        r = requests.get(f"{API}/{path}", headers=H, params={"q": q})
        assert r.status_code == 200, f"{path} q={q} -> {r.status_code}"
        assert isinstance(r.json(), list)
