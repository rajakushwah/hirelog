import re
from datetime import date, datetime
from typing import Annotated, List, Literal, Optional
from urllib.parse import urlsplit

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

APPLICATION_STATUSES = (
    "Interested", "Applied", "Recruiter Screening", "Interview Scheduled", "Interview In Progress",
    "Offer Received", "Offer Accepted", "Rejected", "On Hold", "Withdrawn",
)
OFFER_STATUSES = ("Offer Received", "Offer Accepted")
IN_PROGRESS_STATUSES = ("Interested", "Applied", "Recruiter Screening", "Interview Scheduled", "Interview In Progress", "On Hold")
JOB_TYPES = ("Full-time", "Contract", "Remote", "Hybrid", "Part-time")
JOB_SOURCES = ("LinkedIn", "Naukri", "Referral", "Company Website", "Recruiter", "Other")
INTERVIEW_TYPES = ("Technical", "Coding", "System Design", "Behavioral", "AI", "Managerial", "HR", "Other")
INTERVIEW_PLATFORMS = ("Google Meet", "Zoom", "Teams", "Phone", "In-person")
INTERVIEW_STATUSES = ("Scheduled", "Completed", "Rescheduled", "Cancelled")
INTERVIEW_RESULTS = ("Passed", "Failed", "Pending")
DIFFICULTY_LEVELS = ("Easy", "Medium", "Hard")
QUESTION_CATEGORIES = (
    "Python", "Golang", "SQL", "Data Structures and Algorithms", "System Design", "Kubernetes",
    "Networking", "Linux", "Cloud", "DevOps", "Behavioral", "HR", "Other",
)

ApplicationStatus = Literal[APPLICATION_STATUSES]  # type: ignore[valid-type]
JobType = Literal[JOB_TYPES]  # type: ignore[valid-type]
JobSource = Literal[JOB_SOURCES]  # type: ignore[valid-type]
InterviewType = Literal[INTERVIEW_TYPES]  # type: ignore[valid-type]
Platform = Literal[INTERVIEW_PLATFORMS]  # type: ignore[valid-type]
InterviewStatus = Literal[INTERVIEW_STATUSES]  # type: ignore[valid-type]
InterviewResult = Literal[INTERVIEW_RESULTS]  # type: ignore[valid-type]
Difficulty = Literal[DIFFICULTY_LEVELS]  # type: ignore[valid-type]
Category = Literal[QUESTION_CATEGORIES]  # type: ignore[valid-type]

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(v: str) -> str:
    return _CTRL.sub("", v)


def _opt_email(v: str) -> str:
    if not v:
        return ""
    try:
        return validate_email(v, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise ValueError("invalid email address") from exc


_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.\-]*:(?!\d)")


def _opt_url(v: str) -> str:
    """Only http(s) links are stored, so a saved link can never become a javascript: or data: URL in the UI."""
    if not v:
        return ""
    if "://" not in v:
        # "javascript:..." / "data:..." are other schemes, not bare hosts ("host:8080" is fine).
        if _SCHEME.match(v):
            raise ValueError("must be an http(s) URL")
        v = "https://" + v
    parts = urlsplit(v)
    if parts.scheme not in ("http", "https") or not parts.netloc or any(c.isspace() for c in v):
        raise ValueError("must be an http(s) URL")
    return v


_PHONE = re.compile(r"^[0-9+()\-.\s]{0,40}$")


def _opt_phone(v: str) -> str:
    if not _PHONE.match(v):
        raise ValueError("invalid phone number")
    return v


def Text(max_len: int, min_len: int = 0):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_len, max_length=max_len), AfterValidator(_clean)]


Short = Text(200)
Long = Text(20000)
OptEmail = Annotated[str, StringConstraints(strip_whitespace=True, max_length=320), AfterValidator(_opt_email)]
OptUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000), AfterValidator(_opt_url)]
OptPhone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=40), AfterValidator(_opt_phone)]


class In(BaseModel):
    # Unknown fields are rejected: clients can never set user_id, ids or timestamps (mass assignment).
    model_config = ConfigDict(extra="forbid")


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterIn(In):
    name: Text(200, 1)  # type: ignore[valid-type]
    email: OptEmail
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]


CONTACT_TOPICS = ("General", "Support", "Feedback", "Careers", "Partnership")


class ContactIn(In):
    name: Text(200, 1)  # type: ignore[valid-type]
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=320), AfterValidator(_opt_email)]
    topic: Literal[CONTACT_TOPICS]  # type: ignore[valid-type]
    message: Text(5000, 10)  # type: ignore[valid-type]
    # Honeypot: hidden in the form, so only bots fill it.
    website: Annotated[str, StringConstraints(max_length=200)] = ""


class LoginIn(In):
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=320)]
    password: Annotated[str, StringConstraints(max_length=128)]


class DeleteAccountIn(In):
    confirm: Literal["DELETE"]


class UserOut(Out):
    user_id: str
    name: str
    email: str
    profile_image: Optional[str] = None
    created_at: datetime
    has_password: bool = False
    is_admin: bool = False


class AuthConfigOut(BaseModel):
    google_enabled: bool
    registration_enabled: bool


# ---------- Applications ----------
class ApplicationIn(In):
    company_name: Text(200, 1)  # type: ignore[valid-type]
    company_website: OptUrl = ""
    job_role: Text(200, 1)  # type: ignore[valid-type]
    job_description: Long = ""
    job_location: Short = ""
    job_type: JobType = "Full-time"
    employment_type: Short = ""
    applied_date: Optional[date] = None
    job_source: JobSource = "Other"
    recruiter_name: Short = ""
    recruiter_email: OptEmail = ""
    recruiter_phone: OptPhone = ""
    expected_ctc: Short = ""
    offered_ctc: Short = ""
    notice_period: Short = ""
    application_status: ApplicationStatus = "Applied"


class ApplicationOut(Out):
    application_id: str
    company_name: str
    company_website: str
    job_role: str
    job_description: str
    job_location: str
    job_type: str
    employment_type: str
    applied_date: date
    job_source: str
    recruiter_name: str
    recruiter_email: str
    recruiter_phone: str
    expected_ctc: str
    offered_ctc: str
    notice_period: str
    application_status: str
    offer_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime


# ---------- Rounds ----------
class RoundIn(In):
    application_id: Annotated[str, StringConstraints(max_length=40)]
    round_number: int = Field(1, ge=1, le=100)
    round_name: Text(200, 1)  # type: ignore[valid-type]
    interview_types: List[InterviewType] = Field(default_factory=lambda: ["Technical"], min_length=1, max_length=len(INTERVIEW_TYPES))
    interview_date: Optional[date] = None
    interview_time: Text(20) = ""  # type: ignore[valid-type]
    duration: Text(40) = ""  # type: ignore[valid-type]
    interviewer_name: Short = ""
    interviewer_designation: Short = ""
    interviewer_email: OptEmail = ""
    interview_platform: Platform = "Google Meet"
    meeting_link: OptUrl = ""
    interview_status: InterviewStatus = "Scheduled"
    interview_result: InterviewResult = "Pending"
    feedback: Long = ""
    difficulty: Difficulty = "Medium"
    notes: Long = ""


class RoundOut(Out):
    round_id: str
    application_id: str
    company_name: str
    job_role: str
    round_number: int
    round_name: str
    interview_type: str
    interview_types: List[str]
    interview_date: Optional[date] = None
    interview_time: str
    duration: str
    interviewer_name: str
    interviewer_designation: str
    interviewer_email: str
    interview_platform: str
    meeting_link: str
    interview_status: str
    interview_result: str
    feedback: str
    difficulty: str
    notes: str
    created_at: datetime
    updated_at: datetime


# ---------- Questions ----------
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class QuestionIn(In):
    round_id: Optional[Annotated[str, StringConstraints(max_length=40)]] = None
    application_id: Optional[Annotated[str, StringConstraints(max_length=40)]] = None
    question: Text(5000, 1)  # type: ignore[valid-type]
    answer: Long = ""
    category: Category = "Other"
    difficulty: Difficulty = "Medium"
    tags: List[Tag] = Field(default_factory=list, max_length=20)
    notes: Long = ""


class QuestionOut(Out):
    question_id: str
    round_id: Optional[str] = None
    application_id: Optional[str] = None
    question: str
    answer: str
    category: str
    difficulty: str
    tags: List[str]
    notes: str
    created_at: datetime
    updated_at: datetime


# ---------- Attachments ----------
class AttachmentOut(Out):
    attachment_id: str
    application_id: str
    round_id: str
    file_name: str
    file_type: str
    size: int
    uploaded_at: datetime


class Deleted(BaseModel):
    deleted: int
