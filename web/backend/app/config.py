from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """All runtime configuration. Values come from environment variables prefixed with HIRELOG_ (or backend/.env)."""

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_prefix="HIRELOG_", extra="ignore")

    env: Literal["development", "production", "test"] = "development"

    # SQLite by default so the app runs locally with zero setup. For Postgres:
    # postgresql+asyncpg://user:pass@host:5432/hirelog (put it in .env, never in code).
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'hirelog.db'}"
    auto_migrate: bool = True

    storage_dir: Path = BASE_DIR / "data" / "uploads"
    max_upload_mb: int = 25

    # The origin users open in the browser. Used for the Origin/CSRF check and the Google redirect URI.
    public_origin: str = "http://localhost:5173"
    # Host headers accepted (blocks DNS-rebinding). The public_origin host is always allowed.
    allowed_hosts: list[str] = ["localhost", "127.0.0.1"]
    # Serve the built frontend (frontend/dist) from the API process.
    frontend_dist: Path = BASE_DIR.parent / "frontend" / "dist"

    # Set to false when serving over plain http (local dev). Defaults to true outside development.
    cookie_secure: Optional[bool] = None
    session_idle_hours: int = 12
    session_absolute_days: int = 7

    allow_registration: bool = True

    # Optional Google sign-in (OIDC). Leave empty to use email + password only.
    google_client_id: str = ""
    google_client_secret: str = ""

    # Android beta APK. Drop the signed release APK at android_apk_path, or host it elsewhere and set
    # android_apk_url (https only) together with its android_apk_sha256 so users can verify it.
    android_apk_path: Path = BASE_DIR / "data" / "downloads" / "hirelog.apk"
    android_apk_url: str = ""
    android_apk_sha256: str = ""
    android_version: str = ""
    android_min_version: str = "Android 8.0 or later"
    # False while the published APK still uses its own (Emergent) backend; the page then warns users.
    android_shared_account: bool = False

    @field_validator("public_origin")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @field_validator("android_apk_url")
    @classmethod
    def _https_only(cls, v: str) -> str:
        if v and not v.startswith("https://"):
            raise ValueError("android_apk_url must be an https:// URL")
        return v

    @field_validator("android_apk_sha256")
    @classmethod
    def _hex_digest(cls, v: str) -> str:
        v = v.strip().lower()
        if v and (len(v) != 64 or any(c not in "0123456789abcdef" for c in v)):
            raise ValueError("android_apk_sha256 must be a 64-character hex SHA-256 digest")
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def secure_cookies(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.env == "production"

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
