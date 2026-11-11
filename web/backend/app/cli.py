"""Server-side admin management. Run from web/backend:

    .venv/bin/python -m app.cli make-admin you@example.com
    .venv/bin/python -m app.cli remove-admin someone@example.com
    .venv/bin/python -m app.cli list-admins
"""

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select

from .db import dispose_engine, get_sessionmaker
from .main import run_migrations
from .models import AdminAuditLog, User


async def _set_admin(email: str, value: bool) -> int:
    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            print(f"No account with email {email!r}. Sign up on the website first.", file=sys.stderr)
            return 1
        if value and user.is_disabled:
            print("That account is disabled. Enable it first.", file=sys.stderr)
            return 1
        user.is_admin = value
        db.add(AdminAuditLog(admin_id=None, admin_email="server-cli", action="grant_admin" if value else "revoke_admin",
                             target_user_id=user.user_id, target_email=user.email, detail="via command line"))
        await db.commit()
        print(f"{user.email} is {'now an admin' if value else 'no longer an admin'}.")
        return 0


async def _list() -> int:
    async with get_sessionmaker()() as db:
        admins = list(await db.scalars(select(User).where(User.is_admin.is_(True)).order_by(User.email)))
        print("\n".join(f"{u.email}  ({u.name})" for u in admins) or "No admins yet.")
        return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="python -m app.cli", description="HireLog admin management")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("make-admin", "remove-admin"):
        sub.add_parser(name).add_argument("email")
    sub.add_parser("list-admins")
    args = p.parse_args()

    async def run() -> int:
        try:
            if args.cmd == "list-admins":
                return await _list()
            return await _set_admin(args.email, args.cmd == "make-admin")
        finally:
            await dispose_engine()

    logging.getLogger("alembic").setLevel(logging.WARNING)
    run_migrations()
    return asyncio.run(run())


if __name__ == "__main__":
    raise SystemExit(main())
