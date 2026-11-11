# HireLog

**Your job hunt, finally organised.** Track applications, interview rounds, questions, attachments and offers.

| Folder | What it is | Stack |
| --- | --- | --- |
| [`web/`](web/) | Self-hosted web app. All data in your own database and disk | React 19 + TypeScript (Vite) · FastAPI (Python 3.13) · SQLAlchemy · SQLite / PostgreSQL |
| [`app/`](app/) | Original mobile app (Expo / React Native), built on Emergent | Expo · React Native · FastAPI · MongoDB |

Start with [`web/README.md`](web/README.md) for setup, deployment and security notes.

Secrets are never committed. Configure them through environment variables (`web/.env.example`, `web/backend/.env.example`).
