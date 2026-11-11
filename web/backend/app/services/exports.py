"""Spreadsheet (.xlsx, opens in Excel / Google Sheets) and PDF interview report builders. Pure functions, no I/O."""
import io
import logging
import os
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Image as RLImage
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

logger = logging.getLogger(__name__)

_FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")
# Noto Sans covers ₹ and most Latin/Greek/Cyrillic text users type.
pdfmetrics.registerFont(TTFont("Vera", os.path.join(_FONT_DIR, "NotoSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("VeraBd", os.path.join(_FONT_DIR, "NotoSans-Bold.ttf")))

BRAND = colors.HexColor("#2E523A")
CORAL = colors.HexColor("#E27357")
MUTED = colors.HexColor("#64748B")
TINT = colors.HexColor("#E7F0EB")

SHEETS = {
    "Applications": [
        ("Application_ID", "application_id"), ("Company_Name", "company_name"), ("Company_Website", "company_website"),
        ("Job_Role", "job_role"), ("Job_Description", "job_description"), ("Job_Location", "job_location"),
        ("Job_Type", "job_type"), ("Employment_Type", "employment_type"), ("Applied_Date", "applied_date"), ("Job_Source", "job_source"),
        ("Recruiter_Name", "recruiter_name"), ("Recruiter_Email", "recruiter_email"), ("Recruiter_Phone", "recruiter_phone"),
        ("Expected_CTC", "expected_ctc"), ("Offered_CTC", "offered_ctc"), ("Notice_Period", "notice_period"),
        ("Application_Status", "application_status"), ("Created_At", "created_at"), ("Updated_At", "updated_at"),
    ],
    "Interview_Rounds": [
        ("Round_ID", "round_id"), ("Application_ID", "application_id"), ("Company_Name", "company_name"),
        ("Round_Number", "round_number"), ("Round_Name", "round_name"), ("Interview_Type", "interview_type"),
        ("Interview_Date", "interview_date"), ("Interview_Time", "interview_time"), ("Duration", "duration"),
        ("Interviewer_Name", "interviewer_name"), ("Interviewer_Designation", "interviewer_designation"),
        ("Interviewer_Email", "interviewer_email"), ("Interview_Platform", "interview_platform"),
        ("Meeting_Link", "meeting_link"), ("Interview_Status", "interview_status"),
        ("Interview_Result", "interview_result"), ("Feedback", "feedback"), ("Difficulty", "difficulty"), ("Notes", "notes"),
    ],
    "Interview_Questions": [
        ("Question_ID", "question_id"), ("Round_ID", "round_id"), ("Application_ID", "application_id"),
        ("Question", "question"), ("Answer", "answer"), ("Category", "category"), ("Difficulty", "difficulty"),
        ("Tags", "tags"), ("Notes", "notes"), ("Created_At", "created_at"),
    ],
    "Attachments": [
        ("Attachment_ID", "attachment_id"), ("Application_ID", "application_id"), ("Round_ID", "round_id"),
        ("File_Name", "file_name"), ("File_Type", "file_type"), ("Uploaded_At", "uploaded_at"),
    ],
}


_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v)
    if isinstance(v, str):
        v = _CTRL.sub("", v)
    return v


_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _xl(v):
    """Spreadsheet value without control chars. Formula-looking text is handled by _as_text in build_xlsx."""
    return _cell(v)


def _as_text(cell) -> None:
    """Store formula-looking text (e.g. "+91 ...", "=cmd") as literal text: shown verbatim, never evaluated."""
    if isinstance(cell.value, str) and cell.value[:1] in _FORMULA_START:
        cell.data_type = "s"
        cell.quotePrefix = True


def safe_name(s: str) -> str:
    # Header filenames must be Latin-1; keep ASCII only.
    out = "".join(ch if (ch.isascii() and ch.isalnum()) or ch in "-_" else "_" for ch in (s or ""))
    return out.strip("_")[:40] or "export"


def build_xlsx(data: dict) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="2E523A")
    for title, cols in SHEETS.items():
        ws = wb.create_sheet(title)
        ws.append([c[0] for c in cols])
        for cell in ws[1]:
            cell.font = head_font
            cell.fill = head_fill
            cell.alignment = Alignment(vertical="center")
        for d in data[title]:
            ws.append([_xl(d.get(k)) for _, k in cols])
            for cell in ws[ws.max_row]:
                _as_text(cell)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for i, (h, k) in enumerate(cols, start=1):
            longest = max([len(h)] + [len(str(_cell(d.get(k)))) for d in data[title][:200]])
            ws.column_dimensions[ws.cell(1, i).column_letter].width = min(60, max(12, longest + 2))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------- PDF ----------
ST = {
    "title": ParagraphStyle("title", fontName="VeraBd", fontSize=24, leading=30, textColor=BRAND),
    "h1": ParagraphStyle("h1", fontName="VeraBd", fontSize=18, leading=23, textColor=BRAND, spaceAfter=2),
    "h2": ParagraphStyle("h2", fontName="VeraBd", fontSize=13, leading=17, textColor=colors.black, spaceBefore=8),
    "sub": ParagraphStyle("sub", fontName="Vera", fontSize=11, leading=15, textColor=MUTED),
    "body": ParagraphStyle("body", fontName="Vera", fontSize=10, leading=14),
    "label": ParagraphStyle("label", fontName="VeraBd", fontSize=9, leading=12, textColor=MUTED),
    "q": ParagraphStyle("q", fontName="VeraBd", fontSize=10, leading=14),
    "small": ParagraphStyle("small", fontName="Vera", fontSize=8.5, leading=11, textColor=MUTED),
}


def P(text, style="body"):
    s = "" if text is None else _cell(text)
    return Paragraph(escape(str(s)).replace("\n", "<br/>"), ST[style])


def _kv_table(rows: list, width: float) -> Table:
    rows = [(k, v) for k, v in rows if v not in (None, "", [])]
    if not rows:
        return Spacer(1, 1)
    t = Table([[P(k, "label"), P(_cell(v))] for k, v in rows], colWidths=[38 * mm, width - 38 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _image_flowable(content: bytes, max_w: float, max_h: float):
    img = PILImage.open(io.BytesIO(content))
    img = img.convert("RGB")
    img.thumbnail((1600, 1600))
    w, h = img.size
    scale = min(max_w / w, max_h / h, 1.0)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    buf.seek(0)
    return RLImage(buf, width=w * scale, height=h * scale)


def _embeddable(att: dict) -> bool:
    ft = (att.get("file_type") or "").lower()
    return ft.startswith("image/") or ft == "application/pdf" or (att.get("file_name") or "").lower().endswith(".pdf")


def _size(n) -> str:
    n = int(n or 0)
    return f"{n / 1048576:.1f} MB" if n >= 1048576 else f"{max(1, round(n / 1024))} KB"


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Vera", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "HireLog report")
    canvas.restoreState()


def _stat_strip(items: list, width: float, small: bool = False) -> Table:
    """Compact row of figure tiles (value over label), wrapping to a new row after five."""
    per_row = 5
    value_style = ParagraphStyle("statv", parent=ST["h1"], fontSize=12 if small else 16, leading=15 if small else 20, spaceAfter=0)
    cells = [[Paragraph(escape(str(v)), value_style), P(k, "small")] for k, v in items] or [[P("—"), P("")]]
    rows = [cells[i:i + per_row] for i in range(0, len(cells), per_row)]
    rows[-1] += [""] * (per_row - len(rows[-1]))
    t = Table(rows, colWidths=[width / per_row] * per_row)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
             ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]
    for ri, row in enumerate(rows):
        for ci, cell in enumerate(row):
            if cell != "":
                style += [("BACKGROUND", (ci, ri), (ci, ri), TINT), ("LINEAFTER", (ci, ri), (ci, ri), 3, colors.white),
                          ("LINEBELOW", (ci, ri), (ci, ri), 3, colors.white)]
    t.setStyle(TableStyle(style))
    return t


def _number_pages(writer: PdfWriter) -> None:
    """Stamp "Page X of Y" on every page; the report is stitched from several renders, so this runs at the end."""
    total = len(writer.pages)
    for i, page in enumerate(writer.pages, 1):
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=(w, h))
        c.setFont("Helvetica", 8)  # built-in font: nothing embedded per page
        c.setFillColor(MUTED)
        c.drawRightString(w - 18 * mm, 10 * mm, f"Page {i} of {total}")
        c.save()
        page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])


def _render(story: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                            title="HireLog report")
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def build_pdf(user: dict, apps: list, rounds: list, questions: list, attachments: list, fetch, single: bool = False) -> bytes:
    """fetch(storage_key) -> bytes. Images are embedded inline; attached PDFs are appended right after their application."""
    width = A4[0] - 36 * mm
    max_img_h = A4[1] - 80 * mm
    writer = PdfWriter()

    def add(pdf_bytes: bytes):
        for page in PdfReader(io.BytesIO(pdf_bytes)).pages:
            writer.add_page(page)

    generated = P(f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}", "small")
    passed = sum(1 for r in rounds if r.get("interview_result") == "Passed")
    stats = [("Interview rounds", len(rounds)), ("Rounds passed", passed), ("Questions", len(questions)), ("Attachments", len(attachments))]
    if not single:
        stats.insert(0, ("Applications", len(apps)))

    if single:
        # One application: brand line + stats, then straight into the details on the same page.
        header = [P("HireLog · interview experience", "label"), generated, Spacer(1, 3 * mm), _stat_strip(stats, width), Spacer(1, 6 * mm)]
    else:
        status_counts: dict = {}
        for a in apps:
            status_counts[a.get("application_status", "")] = status_counts.get(a.get("application_status", ""), 0) + 1
        cover = [
            P("HireLog", "title"),
            P(f"Job-search report for {user.get('name') or user.get('email')}", "sub"),
            generated,
            Spacer(1, 8 * mm),
            _stat_strip(stats, width),
            Spacer(1, 6 * mm),
            P("By status", "h2"),
            _stat_strip([(st, n) for st, n in sorted(status_counts.items(), key=lambda x: -x[1]) if st], width, small=True),
            Spacer(1, 6 * mm),
            P("Applications", "h2"),
        ]
        idx_rows = [[P("Company", "label"), P("Role", "label"), P("Status", "label"), P("Applied", "label")]]
        for a in apps:
            idx_rows.append([P(a.get("company_name")), P(a.get("job_role")), P(a.get("application_status")), P(a.get("applied_date"))])
        t = Table(idx_rows, colWidths=[width * 0.28, width * 0.36, width * 0.2, width * 0.16], repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), TINT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0"))]))
        cover += [t, Spacer(1, 10 * mm)]
        header = cover  # the first application continues on the cover page instead of leaving it half empty

    for a in apps:
        aid = a["application_id"]
        story = header + [
            P(a.get("company_name"), "h1"),
            P(f"{a.get('job_role', '')}  ·  {a.get('application_status', '')}", "sub"),
            Spacer(1, 4 * mm),
            _kv_table([
                ("Location", a.get("job_location")), ("Job type", a.get("job_type")),
                ("Employment", a.get("employment_type")), ("Source", a.get("job_source")),
                ("Applied on", a.get("applied_date")), ("Website", a.get("company_website")),
                ("Recruiter", a.get("recruiter_name")), ("Recruiter email", a.get("recruiter_email")),
                ("Recruiter phone", a.get("recruiter_phone")), ("Expected CTC", a.get("expected_ctc")),
                ("Offered CTC", a.get("offered_ctc")), ("Notice period", a.get("notice_period")),
                ("Description", a.get("job_description")),
            ], width),
        ]
        header = []
        appended_pdfs: list = []
        app_rounds = sorted([r for r in rounds if r.get("application_id") == aid], key=lambda r: r.get("round_number") or 0)
        if not app_rounds:
            story += [Spacer(1, 4 * mm), P("No interview rounds logged yet.", "sub")]
        for r in app_rounds:
            rid = r["round_id"]
            story += [
                Spacer(1, 5 * mm),
                P(f"Round {r.get('round_number')}: {r.get('round_name', '')}", "h2"),
                P(f"{r.get('interview_type', '')}  ·  {r.get('interview_status', '')}  ·  Result: {r.get('interview_result', '')}", "small"),
                Spacer(1, 2 * mm),
                _kv_table([
                    ("Date", " ".join(x for x in [r.get("interview_date"), r.get("interview_time")] if x)),
                    ("Duration", r.get("duration")),
                    ("Interviewer", ", ".join(x for x in [r.get("interviewer_name"), r.get("interviewer_designation")] if x)),
                    ("Interviewer email", r.get("interviewer_email")), ("Platform", r.get("interview_platform")),
                    ("Meeting link", r.get("meeting_link")), ("Difficulty", r.get("difficulty")),
                    ("Feedback", r.get("feedback")), ("Notes", r.get("notes")),
                ], width),
            ]
            rq = [q for q in questions if q.get("round_id") == rid]
            if rq:
                story.append(P(f"Questions ({len(rq)})", "label"))
                for i, q in enumerate(rq, 1):
                    block = [P(f"Q{i}. {q.get('question', '')}", "q"),
                             P(" · ".join(x for x in [q.get("category"), q.get("difficulty"), ", ".join(q.get("tags") or [])] if x), "small")]
                    if q.get("answer"):
                        block.append(P(q["answer"]))
                    if q.get("notes"):
                        block.append(P(f"Notes: {q['notes']}", "small"))
                    block.append(Spacer(1, 2 * mm))
                    story.append(KeepTogether(block))
            round_atts = [x for x in attachments if x.get("round_id") == rid]
            others = [x for x in round_atts if not _embeddable(x)]
            if others:
                story += [Spacer(1, 2 * mm), P(f"Other files ({len(others)})", "label")]
                story += [P(f"• {x.get('file_name') or 'attachment'}  ({_size(x.get('size'))})", "small") for x in others]
            for att in [x for x in round_atts if _embeddable(x)]:
                ft = (att.get("file_type") or "").lower()
                name = att.get("file_name") or "attachment"
                is_pdf = ft == "application/pdf" or name.lower().endswith(".pdf")
                try:
                    content = fetch(att["storage_key"])
                except Exception as exc:
                    logger.warning("attachment fetch failed %s: %s", att.get("attachment_id"), exc)
                    story.append(P(f"Attachment unavailable: {name}", "small"))
                    continue
                if is_pdf:
                    try:
                        PdfReader(io.BytesIO(content))
                        appended_pdfs.append(content)
                        story.append(P(f"Attached PDF: {name} (included on the following pages)", "small"))
                    except Exception:
                        story.append(P(f"Attached PDF could not be read: {name}", "small"))
                    continue
                try:
                    story += [Spacer(1, 2 * mm), P(name, "small"), _image_flowable(content, width, max_img_h)]
                except Exception:
                    story.append(P(f"Image could not be shown: {name}", "small"))
        add(_render(story))
        for pdf_bytes in appended_pdfs:
            try:
                add(pdf_bytes)
            except Exception as exc:
                logger.warning("append pdf failed: %s", exc)

    _number_pages(writer)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
