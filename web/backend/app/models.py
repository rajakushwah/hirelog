import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, MetaData, String, Text, TypeDecorator, false
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes on every backend (SQLite stores them naive)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime")
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("usr"))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    google_sub: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    profile_image: Mapped[Optional[str]] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    # Granted only from the server CLI (python -m app.cli) or by another admin; never self-service.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    disabled_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, index=True)

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None

    @property
    def is_disabled(self) -> bool:
        return self.disabled_at is not None


class UserActivityDay(Base):
    """One row per user per UTC day with any authenticated activity. Powers DAU/WAU/MAU without tracking requests."""

    __tablename__ = "user_activity_days"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True, index=True)


class UserSession(Base):
    __tablename__ = "user_sessions"

    session_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ses"))
    # Only a SHA-256 of the cookie value is stored, so a leaked database can't be replayed as sessions.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)

    user: Mapped[User] = relationship(lazy="joined", innerjoin=True)


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (Index("ix_applications_user_applied", "user_id", "applied_date"),)

    application_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("app"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    company_name: Mapped[str] = mapped_column(String(200))
    company_website: Mapped[str] = mapped_column(String(500), default="")
    job_role: Mapped[str] = mapped_column(String(200))
    job_description: Mapped[str] = mapped_column(Text, default="")
    job_location: Mapped[str] = mapped_column(String(200), default="")
    job_type: Mapped[str] = mapped_column(String(40), default="Full-time")
    employment_type: Mapped[str] = mapped_column(String(200), default="")
    applied_date: Mapped[date] = mapped_column(Date)
    job_source: Mapped[str] = mapped_column(String(40), default="Other")
    recruiter_name: Mapped[str] = mapped_column(String(200), default="")
    recruiter_email: Mapped[str] = mapped_column(String(320), default="")
    recruiter_phone: Mapped[str] = mapped_column(String(40), default="")
    expected_ctc: Mapped[str] = mapped_column(String(200), default="")
    offered_ctc: Mapped[str] = mapped_column(String(200), default="")
    notice_period: Mapped[str] = mapped_column(String(200), default="")
    application_status: Mapped[str] = mapped_column(String(40), default="Applied")
    offer_date: Mapped[Optional[date]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class InterviewRound(Base):
    __tablename__ = "interview_rounds"
    __table_args__ = (
        Index("ix_rounds_user_date", "user_id", "interview_date"),
        Index("ix_rounds_app_number", "application_id", "round_number"),
    )

    round_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("rnd"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.application_id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    round_name: Mapped[str] = mapped_column(String(200))
    interview_types: Mapped[list] = mapped_column(JSON, default=list)
    interview_date: Mapped[Optional[date]] = mapped_column(Date)
    interview_time: Mapped[str] = mapped_column(String(20), default="")
    duration: Mapped[str] = mapped_column(String(40), default="")
    interviewer_name: Mapped[str] = mapped_column(String(200), default="")
    interviewer_designation: Mapped[str] = mapped_column(String(200), default="")
    interviewer_email: Mapped[str] = mapped_column(String(320), default="")
    interview_platform: Mapped[str] = mapped_column(String(40), default="Google Meet")
    meeting_link: Mapped[str] = mapped_column(String(1000), default="")
    interview_status: Mapped[str] = mapped_column(String(40), default="Scheduled")
    interview_result: Mapped[str] = mapped_column(String(40), default="Pending")
    feedback: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[str] = mapped_column(String(20), default="Medium")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    application: Mapped[Application] = relationship(lazy="joined", innerjoin=True)

    @property
    def company_name(self) -> str:
        return self.application.company_name

    @property
    def job_role(self) -> str:
        return self.application.job_role

    @property
    def interview_type(self) -> str:
        return " + ".join(self.interview_types or []) or "Other"


class Question(Base):
    __tablename__ = "interview_questions"
    __table_args__ = (
        Index("ix_questions_user_round", "user_id", "round_id"),
        Index("ix_questions_user_category", "user_id", "category"),
    )

    question_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("qst"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    round_id: Mapped[Optional[str]] = mapped_column(ForeignKey("interview_rounds.round_id", ondelete="CASCADE"), index=True)
    application_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("applications.application_id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="Other")
    difficulty: Mapped[str] = mapped_column(String(20), default="Medium")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class Attachment(Base):
    __tablename__ = "attachments"
    __table_args__ = (Index("ix_attachments_user_round", "user_id", "round_id"),)

    attachment_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("att"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.application_id", ondelete="CASCADE"), index=True)
    round_id: Mapped[str] = mapped_column(ForeignKey("interview_rounds.round_id", ondelete="CASCADE"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(200))
    uploaded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    message_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("msg"))
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320))
    topic: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime)


class DownloadEvent(Base):
    """A started app download by a signed-in user. No IP or user agent is kept."""

    __tablename__ = "download_events"

    event_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("dl"))
    user_id: Mapped[Optional[str]] = mapped_column(String(40), ForeignKey("users.user_id", ondelete="SET NULL"), index=True)
    platform: Mapped[str] = mapped_column(String(20))
    version: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)


class AdminAuditLog(Base):
    """Append-only record of admin actions. Emails are copied so entries survive user deletion."""

    __tablename__ = "admin_audit_log"

    entry_id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("aud"))
    admin_id: Mapped[Optional[str]] = mapped_column(String(40))
    admin_email: Mapped[str] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(40))
    target_user_id: Mapped[Optional[str]] = mapped_column(String(40))
    target_email: Mapped[str] = mapped_column(String(320), default="")
    detail: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
