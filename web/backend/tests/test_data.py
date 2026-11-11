import io
from datetime import date, timedelta

from PIL import Image

from app.storage import get_storage

APP = {"company_name": "Cisco", "job_role": "AI Infrastructure Engineer", "job_location": "Bengaluru"}


def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (46, 82, 58)).save(buf, format="PNG")
    return buf.getvalue()


async def make_app(c, **kw) -> dict:
    r = await c.post("/api/applications", json={**APP, **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def make_round(c, app_id: str, **kw) -> dict:
    body = {"application_id": app_id, "round_name": "Technical Screening", "interview_types": ["Technical", "Coding"], **kw}
    r = await c.post("/api/rounds", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_application_crud_search_filter(client):
    a = await make_app(client, application_status="Applied")
    await make_app(client, company_name="Google", job_role="SWE", application_status="Rejected")
    assert a["applied_date"] == date.today().isoformat()

    r = await client.get("/api/applications", params={"q": "cisco"})
    assert [x["company_name"] for x in r.json()] == ["Cisco"]
    r = await client.get("/api/applications", params={"status": "Rejected"})
    assert [x["company_name"] for x in r.json()] == ["Google"]
    # LIKE wildcards are matched literally.
    assert (await client.get("/api/applications", params={"q": "%"})).json() == []

    upd = await client.put(f"/api/applications/{a['application_id']}", json={**APP, "application_status": "Offer Received"})
    assert upd.status_code == 200 and upd.json()["offer_date"] == date.today().isoformat()

    assert (await client.delete(f"/api/applications/{a['application_id']}")).status_code == 200
    assert (await client.get(f"/api/applications/{a['application_id']}")).status_code == 404


async def test_validation_blocks_bad_input(client):
    bad = [
        {**APP, "company_website": "javascript:alert(1)"},
        {**APP, "application_status": "Hacked"},
        {**APP, "user_id": "usr_someone_else"},
        {**APP, "recruiter_email": "not-an-email"},
        {**APP, "company_name": ""},
        {**APP, "company_name": "x" * 201},
    ]
    for body in bad:
        r = await client.post("/api/applications", json=body)
        assert r.status_code == 422, body
    ok = await make_app(client, company_website="cisco.com")
    assert ok["company_website"] == "https://cisco.com"


async def test_rounds_and_questions(client):
    a = await make_app(client)
    soon = (date.today() + timedelta(days=2)).isoformat()
    r1 = await make_round(client, a["application_id"], interview_date=soon, interview_time="10:30", duration="45 min")
    assert r1["company_name"] == "Cisco" and r1["interview_type"] == "Technical + Coding"
    await make_round(client, a["application_id"], round_number=2, round_name="HR", interview_status="Completed")

    up = await client.get("/api/rounds", params={"upcoming": "true", "today": date.today().isoformat()})
    assert [x["round_id"] for x in up.json()] == [r1["round_id"]]
    assert len((await client.get("/api/rounds", params={"application_id": a["application_id"]})).json()) == 2
    assert len((await client.get("/api/rounds", params={"q": "cisco"})).json()) == 2

    bad = await client.post("/api/rounds", json={"application_id": a["application_id"], "round_name": "X", "meeting_link": "javascript:x"})
    assert bad.status_code == 422

    q = await client.post("/api/questions", json={
        "round_id": r1["round_id"], "question": "Explain Kubernetes pod scheduling", "category": "Kubernetes",
        "difficulty": "Hard", "tags": ["k8s", "k8s", "scheduling"],
    })
    assert q.status_code == 201 and q.json()["application_id"] == a["application_id"]
    assert q.json()["tags"] == ["k8s", "scheduling"]
    qid = q.json()["question_id"]
    edit = await client.put(f"/api/questions/{qid}", json={"round_id": r1["round_id"], "question": "Edited", "answer": "Because"})
    assert edit.status_code == 200 and edit.json()["answer"] == "Because"
    assert len((await client.get("/api/questions", params={"category": "Other"})).json()) == 1
    assert len((await client.get("/api/questions", params={"q": "because"})).json()) == 1

    ics = await client.get(f"/api/rounds/{r1['round_id']}/calendar.ics")
    assert ics.status_code == 200 and ics.headers["content-type"].startswith("text/calendar")
    assert "DTSTART:" in ics.text and "SUMMARY:Cisco: R1 Technical Screening" in ics.text


async def test_attachments_upload_validate_download(client):
    a = await make_app(client)
    r = await make_round(client, a["application_id"])
    up = await client.post("/api/attachments", data={"round_id": r["round_id"]},
                           files={"file": ("../../etc/passwd.png", png_bytes(), "image/png")})
    assert up.status_code == 201, up.text
    att = up.json()
    assert att["file_type"] == "image/png" and att["file_name"] == "passwd.png"

    dl = await client.get(f"/api/attachments/{att['attachment_id']}/file")
    assert dl.status_code == 200 and dl.content.startswith(b"\x89PNG")
    assert dl.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in dl.headers["content-security-policy"]

    fake = await client.post("/api/attachments", data={"round_id": r["round_id"]},
                             files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")})
    assert fake.status_code == 415
    html = await client.post("/api/attachments", data={"round_id": r["round_id"]},
                             files={"file": ("x.html", b"<html><script>alert(1)</script>", "text/html")})
    assert html.status_code == 415
    big = await client.post("/api/attachments", data={"round_id": r["round_id"]},
                            files={"file": ("big.txt", b"a" * (1024 * 1024 + 10), "text/plain")})
    assert big.status_code == 413
    txt = await client.post("/api/attachments", data={"round_id": r["round_id"]},
                            files={"file": ("notes.txt", "hello ₹".encode(), "text/plain")})
    assert txt.status_code == 201
    txt_dl = await client.get(f"/api/attachments/{txt.json()['attachment_id']}/file")
    assert txt_dl.headers["content-disposition"].startswith("attachment;")

    assert len((await client.get("/api/attachments", params={"round_id": r["round_id"]})).json()) == 2


async def test_cascade_delete_removes_children_and_files(client):
    a = await make_app(client)
    r = await make_round(client, a["application_id"])
    await client.post("/api/questions", json={"round_id": r["round_id"], "question": "Q?"})
    att = (await client.post("/api/attachments", data={"round_id": r["round_id"]},
                             files={"file": ("a.png", png_bytes(), "image/png")})).json()
    me = (await client.get("/api/auth/me")).json()
    path = get_storage().path(f"{me['user_id']}/{att['attachment_id']}")
    assert path.is_file()

    await client.delete(f"/api/applications/{a['application_id']}")
    assert (await client.get(f"/api/rounds/{r['round_id']}")).status_code == 404
    assert (await client.get("/api/questions", params={"round_id": r["round_id"]})).json() == []
    assert (await client.get(f"/api/attachments/{att['attachment_id']}/file")).status_code == 404
    assert not path.exists()


async def test_users_cannot_touch_each_others_data(client, other):
    a = await make_app(client)
    r = await make_round(client, a["application_id"])
    q = (await client.post("/api/questions", json={"round_id": r["round_id"], "question": "Secret?"})).json()
    att = (await client.post("/api/attachments", data={"round_id": r["round_id"]},
                             files={"file": ("a.png", png_bytes(), "image/png")})).json()
    aid, rid = a["application_id"], r["round_id"]

    assert (await other.get(f"/api/applications/{aid}")).status_code == 404
    assert (await other.put(f"/api/applications/{aid}", json=APP)).status_code == 404
    assert (await other.delete(f"/api/applications/{aid}")).status_code == 404
    assert (await other.get(f"/api/rounds/{rid}")).status_code == 404
    assert (await other.post("/api/rounds", json={"application_id": aid, "round_name": "x"})).status_code == 404
    assert (await other.post("/api/questions", json={"round_id": rid, "question": "x"})).status_code == 404
    assert (await other.post("/api/questions", json={"application_id": aid, "question": "x"})).status_code == 404
    assert (await other.put(f"/api/questions/{q['question_id']}", json={"question": "x"})).status_code == 404
    assert (await other.get(f"/api/attachments/{att['attachment_id']}/file")).status_code == 404
    assert (await other.delete(f"/api/attachments/{att['attachment_id']}")).status_code == 404
    assert (await other.post("/api/attachments", data={"round_id": rid},
                             files={"file": ("a.png", png_bytes(), "image/png")})).status_code == 404
    assert (await other.get("/api/applications")).json() == []
    assert (await other.get("/api/questions")).json() == []
    assert (await other.get(f"/api/export/sheet", params={"application_id": aid})).status_code == 404
    assert (await other.get(f"/api/rounds/{rid}/calendar.ics")).status_code == 404

    # The owner still has everything.
    assert (await client.get(f"/api/applications/{aid}")).status_code == 200


async def test_anonymous_requests_rejected(anon):
    for path in ("/api/applications", "/api/rounds", "/api/questions", "/api/dashboard/stats", "/api/export/sheet"):
        assert (await anon.get(path)).status_code == 401


async def test_dashboard_and_exports(client):
    a = await make_app(client, application_status="Offer Received")
    await make_app(client, company_name="cisco", application_status="Rejected")
    r = await make_round(client, a["application_id"], interview_date=(date.today() + timedelta(days=1)).isoformat())
    await client.post("/api/attachments", data={"round_id": r["round_id"]},
                      files={"file": ("a.png", png_bytes(), "image/png")})
    await client.post("/api/questions", json={"round_id": r["round_id"], "question": "=1+1", "answer": "2"})

    s = (await client.get("/api/dashboard/stats")).json()
    assert s["total_applications"] == 2 and s["total_companies"] == 1
    assert s["offers"] == 1 and s["rejections"] == 1 and s["interviews_upcoming"] == 1
    assert s["rounds_by_company"] == [{"company": "Cisco", "count": 1}]
    assert s["upcoming_rounds"][0]["round_id"] == r["round_id"]

    sheet = await client.get("/api/export/sheet")
    assert sheet.status_code == 200 and sheet.content[:2] == b"PK"
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(sheet.content))
    cell = wb["Interview_Questions"]["D2"]
    assert cell.value == "=1+1" and cell.data_type == "s" and cell.quotePrefix  # stored as text, never evaluated

    pdf = await client.get("/api/export/pdf", params={"application_id": a["application_id"]})
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
