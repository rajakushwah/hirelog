"""Seed a demo account on a local HireLog server through the public API, then download both exports.

    .venv/bin/python scripts/seed_demo.py            # server must be running on 127.0.0.1:8000
    HIRELOG_DEMO_PASSWORD=... .venv/bin/python scripts/seed_demo.py --export-only   # re-download exports

Creates demo.candidate@example.com with a random password (printed once) and five fully filled applications.
For local testing only; never run it against production.
"""

import io
import os
import secrets
import sys
from datetime import date, timedelta
from pathlib import Path

import httpx
from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:8000"
EMAIL = "demo.candidate@example.com"
OUT = str(Path(__file__).resolve().parent.parent / "data" / "demo-exports")
today = date.today()
d = lambda days: (today + timedelta(days=days)).isoformat()

APPS = [
    {
        "app": dict(
            company_name="Amazon", company_website="https://www.amazon.jobs", job_role="Software Development Engineer II",
            job_description="Build and operate high-scale services for Amazon Payments. Own design, coding, testing and on-call for "
                            "distributed systems handling millions of transactions per day. Java/Python, AWS, DynamoDB.",
            job_location="Bengaluru, India", job_type="Hybrid", employment_type="Permanent", applied_date=d(-45),
            job_source="LinkedIn", recruiter_name="Ananya Iyer", recruiter_email="ananya.iyer@amazon.example",
            recruiter_phone="+91 98450 12345", expected_ctc="45 LPA", offered_ctc="48 LPA + RSUs", notice_period="60 days",
            application_status="Offer Received",
        ),
        "rounds": [
            dict(round_name="Online Assessment", interview_types=["Coding"], interview_date=d(-38), interview_time="10:00",
                 duration="90 min", interviewer_name="HackerRank (automated)", interviewer_designation="Assessment",
                 interview_platform="Phone", interview_status="Completed", interview_result="Passed", difficulty="Medium",
                 feedback="Cleared both problems with all test cases.", notes="Graph BFS + sliding window."),
            dict(round_name="Technical Round 1", interview_types=["Technical", "Coding"], interview_date=d(-30), interview_time="14:30",
                 duration="60 min", interviewer_name="Rahul Menon", interviewer_designation="Senior SDE",
                 interviewer_email="rahul.menon@amazon.example", interview_platform="Teams",
                 meeting_link="https://teams.microsoft.com/l/meetup-join/demo-amazon-1", interview_status="Completed",
                 interview_result="Passed", difficulty="Medium", feedback="Strong problem solving, clean code.",
                 notes="LRU cache design + follow-ups on thread safety."),
            dict(round_name="System Design", interview_types=["System Design"], interview_date=d(-24), interview_time="11:00",
                 duration="60 min", interviewer_name="Kavita Rao", interviewer_designation="Principal Engineer",
                 interviewer_email="kavita.rao@amazon.example", interview_platform="Teams",
                 meeting_link="https://teams.microsoft.com/l/meetup-join/demo-amazon-2", interview_status="Completed",
                 interview_result="Passed", difficulty="Hard", feedback="Good trade-off discussion on consistency.",
                 notes="Designed a payment ledger with idempotency keys and outbox pattern."),
            dict(round_name="Bar Raiser", interview_types=["Behavioral", "Managerial"], interview_date=d(-18), interview_time="16:00",
                 duration="60 min", interviewer_name="Vikram Shah", interviewer_designation="Bar Raiser, Sr. Manager",
                 interviewer_email="vikram.shah@amazon.example", interview_platform="Zoom",
                 meeting_link="https://zoom.us/j/1234567890", interview_status="Completed", interview_result="Passed",
                 difficulty="Hard", feedback="Clear STAR answers on ownership and dive deep.",
                 notes="Leadership principles: Ownership, Dive Deep, Disagree and Commit."),
        ],
        "questions": [
            dict(question="Design an LRU cache with O(1) get and put.", answer="HashMap + doubly linked list; move node to head on access, evict tail.",
                 category="Data Structures and Algorithms", difficulty="Medium", tags=["cache", "linked-list"], notes="Asked about concurrency follow-up."),
            dict(question="How would you make payment processing idempotent?", answer="Client-supplied idempotency key stored with result; dedupe on retry; outbox for events.",
                 category="System Design", difficulty="Hard", tags=["payments", "idempotency"], notes=""),
            dict(question="Tell me about a time you disagreed with your manager.", answer="STAR: migration timeline risk, data-backed proposal, phased rollout.",
                 category="Behavioral", difficulty="Medium", tags=["leadership-principles"], notes="Bar raiser liked the metrics."),
        ],
    },
    {
        "app": dict(
            company_name="Microsoft", company_website="https://careers.microsoft.com", job_role="Senior Software Engineer - Azure",
            job_description="Azure Kubernetes Service control plane team. Go, Kubernetes operators, large-scale reliability.",
            job_location="Hyderabad, India", job_type="Full-time", employment_type="Permanent", applied_date=d(-25),
            job_source="Referral", recruiter_name="Sneha Kapoor", recruiter_email="sneha.kapoor@microsoft.example",
            recruiter_phone="+91 99080 55555", expected_ctc="55 LPA", offered_ctc="", notice_period="90 days (negotiable)",
            application_status="Interview In Progress",
        ),
        "rounds": [
            dict(round_name="Recruiter Screen", interview_types=["HR"], interview_date=d(-20), interview_time="12:00",
                 duration="30 min", interviewer_name="Sneha Kapoor", interviewer_designation="Technical Recruiter",
                 interviewer_email="sneha.kapoor@microsoft.example", interview_platform="Phone", interview_status="Completed",
                 interview_result="Passed", difficulty="Easy", feedback="Good fit for AKS team.", notes="Discussed notice period and location."),
            dict(round_name="Coding Round", interview_types=["Coding", "Technical"], interview_date=d(-12), interview_time="15:00",
                 duration="60 min", interviewer_name="Arjun Nair", interviewer_designation="Software Engineer II",
                 interviewer_email="arjun.nair@microsoft.example", interview_platform="Teams",
                 meeting_link="https://teams.microsoft.com/l/meetup-join/demo-msft-1", interview_status="Completed",
                 interview_result="Passed", difficulty="Medium", feedback="Solved both; good testing mindset.", notes="Merge intervals + top-K with heap."),
            dict(round_name="Design + Kubernetes Deep Dive", interview_types=["System Design", "Technical"], interview_date=d(3), interview_time="11:30",
                 duration="75 min", interviewer_name="Meera Pillai", interviewer_designation="Principal Software Engineer",
                 interviewer_email="meera.pillai@microsoft.example", interview_platform="Teams",
                 meeting_link="https://teams.microsoft.com/l/meetup-join/demo-msft-2", interview_status="Scheduled",
                 interview_result="Pending", difficulty="Hard", feedback="", notes="Revise controllers, etcd, leader election."),
        ],
        "questions": [
            dict(question="Merge overlapping intervals.", answer="Sort by start, then sweep and merge when start <= current end.",
                 category="Data Structures and Algorithms", difficulty="Medium", tags=["arrays", "sorting"], notes=""),
            dict(question="How does a Kubernetes controller reconcile state?", answer="Watch via informers, enqueue keys, compare desired vs actual, act idempotently, requeue on error.",
                 category="Kubernetes", difficulty="Hard", tags=["k8s", "controllers"], notes="Expect follow-ups on leader election."),
        ],
    },
    {
        "app": dict(
            company_name="Cisco", company_website="https://jobs.cisco.com", job_role="Network Software Engineer",
            job_description="Develop control-plane software for Catalyst switches. C/Go, BGP/OSPF, Linux networking.",
            job_location="Bengaluru, India", job_type="Hybrid", employment_type="Permanent", applied_date=d(-60),
            job_source="Company Website", recruiter_name="Deepak Reddy", recruiter_email="deepak.reddy@cisco.example",
            recruiter_phone="+91 80 4426 0000", expected_ctc="38 LPA", offered_ctc="40 LPA", notice_period="30 days",
            application_status="Offer Accepted",
        ),
        "rounds": [
            dict(round_name="Technical Round 1", interview_types=["Technical"], interview_date=d(-50), interview_time="10:30",
                 duration="60 min", interviewer_name="Suresh Kumar", interviewer_designation="Technical Leader",
                 interviewer_email="suresh.kumar@cisco.example", interview_platform="Google Meet",
                 meeting_link="https://meet.google.com/abc-defg-hij", interview_status="Completed", interview_result="Passed",
                 difficulty="Medium", feedback="Solid networking fundamentals.", notes="TCP handshake, BGP path selection."),
            dict(round_name="Technical Round 2", interview_types=["Coding", "Technical"], interview_date=d(-44), interview_time="14:00",
                 duration="60 min", interviewer_name="Lakshmi Narayan", interviewer_designation="Principal Engineer",
                 interviewer_email="lakshmi.n@cisco.example", interview_platform="In-person", interview_status="Completed",
                 interview_result="Passed", difficulty="Hard", feedback="Strong C and Linux internals.", notes="Onsite at Cessna Business Park."),
            dict(round_name="Managerial + HR", interview_types=["Managerial", "HR"], interview_date=d(-40), interview_time="17:00",
                 duration="45 min", interviewer_name="Priya Desai", interviewer_designation="Engineering Manager",
                 interviewer_email="priya.desai@cisco.example", interview_platform="Teams",
                 meeting_link="https://teams.microsoft.com/l/meetup-join/demo-cisco", interview_status="Completed",
                 interview_result="Passed", difficulty="Easy", feedback="Offer approved.", notes="Joining date agreed."),
        ],
        "questions": [
            dict(question="Explain BGP best path selection.", answer="Weight, local pref, locally originated, AS path length, origin, MED, eBGP over iBGP, IGP metric...",
                 category="Networking", difficulty="Hard", tags=["bgp", "routing"], notes=""),
            dict(question="What happens when you type a URL in the browser?", answer="DNS, TCP/TLS handshake, HTTP request, routing, response, render.",
                 category="Networking", difficulty="Easy", tags=["dns", "tcp"], notes="Classic warm-up."),
            dict(question="How does epoll differ from select?", answer="epoll is O(1) per ready fd with kernel-maintained interest list; select scans all fds each call.",
                 category="Linux", difficulty="Medium", tags=["linux", "io"], notes=""),
        ],
    },
    {
        "app": dict(
            company_name="NVIDIA", company_website="https://www.nvidia.com/en-us/about-nvidia/careers/", job_role="GPU Software Engineer",
            job_description="CUDA runtime and driver team. C++, performance profiling, parallel programming.",
            job_location="Pune, India", job_type="Full-time", employment_type="Permanent", applied_date=d(-35),
            job_source="Naukri", recruiter_name="Rohit Verma", recruiter_email="rohit.verma@nvidia.example",
            recruiter_phone="+91 20 6600 1234", expected_ctc="50 LPA", offered_ctc="", notice_period="60 days",
            application_status="Rejected",
        ),
        "rounds": [
            dict(round_name="Technical Screen", interview_types=["Technical", "Coding"], interview_date=d(-28), interview_time="09:30",
                 duration="60 min", interviewer_name="Neha Gupta", interviewer_designation="Senior System Software Engineer",
                 interviewer_email="neha.gupta@nvidia.example", interview_platform="Zoom", meeting_link="https://zoom.us/j/9876543210",
                 interview_status="Completed", interview_result="Passed", difficulty="Medium", feedback="Good C++ knowledge.",
                 notes="Move semantics, memory model."),
            dict(round_name="CUDA Deep Dive", interview_types=["Technical", "AI"], interview_date=d(-21), interview_time="13:00",
                 duration="90 min", interviewer_name="Aditya Joshi", interviewer_designation="Principal Architect",
                 interviewer_email="aditya.joshi@nvidia.example", interview_platform="Zoom", meeting_link="https://zoom.us/j/1122334455",
                 interview_status="Completed", interview_result="Failed", difficulty="Hard",
                 feedback="Needs deeper experience with warp-level optimisation.", notes="Practise shared memory tiling and occupancy."),
        ],
        "questions": [
            dict(question="What is warp divergence and how do you reduce it?", answer="Threads in a warp take different branches and serialise; restructure branches or data layout.",
                 category="Other", difficulty="Hard", tags=["cuda", "gpu"], notes="Got stuck on occupancy maths."),
            dict(question="Explain std::move vs std::forward.", answer="move casts to rvalue unconditionally; forward preserves value category in templates.",
                 category="Other", difficulty="Medium", tags=["c++"], notes=""),
        ],
    },
    {
        "app": dict(
            company_name="AMD", company_website="https://careers.amd.com", job_role="Silicon Design Engineer",
            job_description="RTL design and verification for next-gen CPU cores. Verilog/SystemVerilog, UVM, Python scripting.",
            job_location="Hyderabad, India", job_type="Remote", employment_type="Contract", applied_date=d(-10),
            job_source="Recruiter", recruiter_name="Farah Khan", recruiter_email="farah.khan@amd.example",
            recruiter_phone="+91 40 6789 0000", expected_ctc="35 LPA", offered_ctc="", notice_period="Immediate",
            application_status="Interview Scheduled",
        ),
        "rounds": [
            dict(round_name="Phone Screen", interview_types=["Technical", "HR"], interview_date=d(1), interview_time="18:00",
                 duration="45 min", interviewer_name="Karthik S", interviewer_designation="Design Engineering Manager",
                 interviewer_email="karthik.s@amd.example", interview_platform="Phone", interview_status="Scheduled",
                 interview_result="Pending", difficulty="Medium", feedback="", notes="Revise pipelining hazards and cache coherence."),
            dict(round_name="Technical Round", interview_types=["Technical", "Other"], interview_date=d(6), interview_time="11:00",
                 duration="60 min", interviewer_name="Ravi Teja", interviewer_designation="Senior Member of Technical Staff",
                 interviewer_email="ravi.teja@amd.example", interview_platform="Teams",
                 meeting_link="https://teams.microsoft.com/l/meetup-join/demo-amd", interview_status="Rescheduled",
                 interview_result="Pending", difficulty="Hard", feedback="", notes="Moved from Monday at interviewer's request."),
        ],
        "questions": [
            dict(question="Explain the MESI cache coherence protocol.", answer="Modified, Exclusive, Shared, Invalid states; bus snooping transitions.",
                 category="Other", difficulty="Medium", tags=["cpu", "cache"], notes="Prep question."),
            dict(question="Write a Python script to parse a timing report and list failing paths.", answer="Regex over report, filter slack < 0, sort by slack.",
                 category="Python", difficulty="Easy", tags=["python", "scripting"], notes=""),
        ],
    },
]


def whiteboard_png(title: str) -> bytes:
    img = Image.new("RGB", (960, 540), "#f8fafc")
    g = ImageDraw.Draw(img)
    g.rectangle([20, 20, 940, 520], outline="#2E523A", width=6)
    g.text((50, 45), f"{title} - whiteboard", fill="#1f3a28")
    for i, (x, y) in enumerate([(120, 200), (420, 200), (720, 200), (420, 400)]):
        g.rounded_rectangle([x - 80, y - 40, x + 80, y + 40], 12, outline="#2E523A", width=4, fill="#e8f1ec")
        g.text((x - 45, y - 6), ["Client", "API", "Ledger DB", "Queue"][i], fill="#1f3a28")
    g.line([200, 200, 340, 200], fill="#e27357", width=4)
    g.line([500, 200, 640, 200], fill="#e27357", width=4)
    g.line([420, 240, 420, 360], fill="#e27357", width=4)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def export(c: httpx.Client) -> None:
    for kind, ext in (("sheet", "xlsx"), ("pdf", "pdf")):
        r = c.get(f"/api/export/{kind}"); r.raise_for_status()
        open(f"{OUT}/HireLog_demo.{ext}", "wb").write(r.content)
        print(f"export {kind}: {len(r.content):,} bytes -> {OUT}/HireLog_demo.{ext}")
    for a in c.get("/api/applications").json():
        r = c.get("/api/export/pdf", params={"application_id": a["application_id"]}); r.raise_for_status()
        open(f"{OUT}/HireLog_demo_{a['company_name']}.pdf", "wb").write(r.content)
    print(f"per-application PDFs -> {OUT}/HireLog_demo_<Company>.pdf")


def main() -> int:
    Path(OUT).mkdir(parents=True, exist_ok=True)
    c = httpx.Client(base_url=BASE, headers={"Origin": BASE}, timeout=60)
    c.get("/api/auth/me")
    csrf = lambda: c.cookies.get("__Host-hl_csrf") or c.cookies.get("hl_csrf") or ""
    if "--export-only" in sys.argv:
        r = c.post("/api/auth/login", json={"email": EMAIL, "password": os.environ.get("HIRELOG_DEMO_PASSWORD", "")},
                   headers={"X-CSRF-Token": csrf()})
        if r.status_code != 200:
            print("login failed:", r.status_code)
            return 1
        export(c)
        return 0
    password = secrets.token_urlsafe(12)
    r = c.post("/api/auth/register", json={"name": "Demo Candidate", "email": EMAIL, "password": password}, headers={"X-CSRF-Token": csrf()})
    if r.status_code != 201:
        print("register failed:", r.status_code, r.text)
        return 1
    post = lambda path, **kw: c.post(path, headers={"X-CSRF-Token": csrf()}, **kw)

    counts = {"applications": 0, "rounds": 0, "questions": 0, "attachments": 0}
    for spec in APPS:
        r = post("/api/applications", json=spec["app"]); r.raise_for_status()
        app_id = r.json()["application_id"]; counts["applications"] += 1
        round_ids = []
        for n, rnd in enumerate(spec["rounds"], 1):
            r = post("/api/rounds", json={**rnd, "application_id": app_id, "round_number": n}); r.raise_for_status()
            round_ids.append(r.json()["round_id"]); counts["rounds"] += 1
        for i, q in enumerate(spec["questions"]):
            r = post("/api/questions", json={**q, "application_id": app_id, "round_id": round_ids[min(i, len(round_ids) - 1)]}); r.raise_for_status()
            counts["questions"] += 1
        company = spec["app"]["company_name"]
        files = [
            ("file", (f"{company}_whiteboard.png", whiteboard_png(company), "image/png")),
        ]
        r = post("/api/attachments", data={"round_id": round_ids[-1]}, files=files); r.raise_for_status()
        notes = f"{company} prep notes\n\n- Revise fundamentals\n- Prepare STAR stories\n- Questions to ask the panel\n".encode()
        r = post("/api/attachments", data={"round_id": round_ids[0]}, files=[("file", (f"{company}_prep_notes.txt", notes, "text/plain"))]); r.raise_for_status()
        counts["attachments"] += 2

    export(c)
    print("seeded:", counts)
    print("EMAIL", EMAIL)
    print("PASSWORD", password)
    return 0


if __name__ == "__main__":
    sys.exit(main())
