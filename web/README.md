# HireLog — web

Web version of the HireLog mobile app (`../app`). Same features, statuses and forest-green theme, but every byte of data
lives in **your** database and **your** disk. There are no Emergent services, no Google Sheets/Drive, no third-party storage.

```
frontend/  React 19 + Vite + TypeScript SPA (TanStack Query, recharts, phosphor icons)
backend/   FastAPI + SQLAlchemy 2 (async) + Alembic. SQLite by default, Postgres for multi-user
           attachments on local disk (backend/data/uploads), exports with openpyxl / reportlab
```

## Run locally (development)

Requirements: Python 3.12+ and Node 20+.

```bash
# API  -> http://127.0.0.1:8000  (docs at /api/docs in development)
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env            # optional; defaults work out of the box
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Web  -> http://localhost:5173  (proxies /api to the API)
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173 and create an account. The database (`backend/data/hirelog.db`) and migrations are created
automatically on first start.

Tests: `cd backend && .venv/bin/python -m pytest -q`. Type check: `cd frontend && npm run typecheck`.

## Run as one app (no Node at runtime)

```bash
cd frontend && npm ci && npm run build      # produces frontend/dist
cd ../backend
HIRELOG_PUBLIC_ORIGIN=http://localhost:8000 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API serves the built SPA from the same origin, so there is no CORS at all.

## Deploy (Docker + Postgres)

```bash
cp .env.example .env     # set POSTGRES_PASSWORD, HIRELOG_PUBLIC_ORIGIN, HIRELOG_ALLOWED_HOSTS
docker compose up -d --build
```

The app listens on `127.0.0.1:8000` only. Put a TLS reverse proxy in front, for example Caddy:

```
hirelog.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

In production (`HIRELOG_ENV=production`, the image default) cookies are `Secure` and use the `__Host-` prefix, HSTS is sent
and the API docs are disabled. **Serve it over HTTPS**, use TLS 1.3 at the proxy, and set `HIRELOG_ALLOW_REGISTRATION=false`
once your account exists.

Backups: the Postgres volume (`pg_dump`) and the `uploads` volume. With SQLite, copy `backend/data/` while the app is stopped
(or use `sqlite3 hirelog.db ".backup backup.db"`).

## Optional Google sign-in

Email + password works with nothing extra. To add "Continue with Google":

1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → **Web application**.
2. Authorized redirect URI: `<HIRELOG_PUBLIC_ORIGIN>/api/auth/google/callback`
   (dev: `http://localhost:5173/api/auth/google/callback`).
3. Put the client id and secret in `backend/.env` (or `web/.env` for Docker) as `HIRELOG_GOOGLE_CLIENT_ID` /
   `HIRELOG_GOOGLE_CLIENT_SECRET`. Never commit them.

Only sign-in uses Google (OpenID Connect with PKCE). No interview data is ever sent there. The "Google Calendar" button on a
round sends that round's title and time to Google only when you click it; "Add to calendar (.ics)" is fully local.

## Landing page & contact form

Signed-out visitors at `/` see the public home page (features, about, careers, contact). Contact-form messages are saved in
the `contact_messages` table (rate limited, with a bot honeypot). Read them with:

```bash
sqlite3 backend/data/hirelog.db "select created_at, topic, name, email, message from contact_messages order by created_at desc;"
```

The careers roles and About text in `frontend/src/pages/Landing.tsx` are placeholders. Edit them to match your team.

## Android beta APK

The home page has a "Downloads" section (Android APK + iOS "coming soon"). Until an APK is present the Android button shows "Coming soon".

1. Build a **signed release** APK (not the debug build), e.g. `eas build -p android --profile preview` in `../app/frontend`.
2. Copy it to `backend/data/downloads/hirelog.apk` (Docker: `docker compose cp hirelog.apk app:/data/downloads/hirelog.apk`).
3. Optionally set `HIRELOG_ANDROID_VERSION=1.0.0` and restart.

The server checks it is a real APK, computes its SHA-256 (shown on the page), and serves it as
`application/vnd.android.package-archive` with resumable downloads. To publish a new version, replace the file and bump the
version. To host it elsewhere instead, set `HIRELOG_ANDROID_APK_URL` (https) and `HIRELOG_ANDROID_APK_SHA256`.

Verify the signing certificate before publishing:
`apksigner verify --print-certs hirelog.apk` (it must be your release key, RSA 2048+ or EC P-256, SHA-256 digest).

## Configuration

All settings are environment variables with the `HIRELOG_` prefix (see `backend/.env.example`):

| Variable | Default |
| --- | --- |
| `HIRELOG_DATABASE_URL` | SQLite at `backend/data/hirelog.db` |
| `HIRELOG_STORAGE_DIR` | `backend/data/uploads` |
| `HIRELOG_MAX_UPLOAD_MB` | `25` |
| `HIRELOG_PUBLIC_ORIGIN` | `http://localhost:5173` |
| `HIRELOG_ALLOWED_HOSTS` | `["localhost","127.0.0.1"]` |
| `HIRELOG_SESSION_IDLE_HOURS` / `_ABSOLUTE_DAYS` | `12` / `7` |
| `HIRELOG_ALLOW_REGISTRATION` | `true` |

## Security design

- **Auth:** Argon2id password hashes. Opaque 256-bit session tokens in an `HttpOnly`, `SameSite=Lax` cookie; only their
  SHA-256 is stored. Idle and absolute expiry, a fresh session on every login, "sign out everywhere".
- **CSRF:** per-session synchronizer token (`X-CSRF-Token` header) plus an Origin / `Sec-Fetch-Site` check on every
  state-changing request.
- **Brute force:** login throttled per IP and per account. Errors are generic, and unknown emails take the same time.
- **Access control:** every query is scoped to the signed-in user. Other users' ids return 404.
- **Input:** strict schemas (unknown fields rejected, enums, length limits). Links must be http(s). 1 MB JSON body limit.
- **Uploads:** type detected from content, not the extension (allow-list: images, videos, PDF, Office, text). Images are
  re-encoded to strip EXIF/GPS. Files are stored under random names with owner-only permissions, served with `nosniff`
  and a sandbox CSP, and non-media files are always downloaded.
- **Exports:** spreadsheet cells are escaped against formula injection.
- **Headers:** strict CSP (no inline scripts), `frame-ancestors 'none'`, `no-referrer`, COOP, HSTS on https, `no-store` on API.
- **Secrets:** none in code. Everything is read from the environment / `.env`, which is git-ignored.

## Scaling notes

- Switch to Postgres via `HIRELOG_DATABASE_URL`. Migrations run on startup, or run `alembic upgrade head` yourself.
- The login rate limiter is in-memory. Run one worker per instance, or move it to Redis before scaling out horizontally.
- Attachments go through a `Storage` interface (`app/storage.py`). Add an S3/MinIO implementation for multiple instances.
