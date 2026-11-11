import asyncio

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings
from app.db import ensure_sqlite_dir
from app.models import Base

config = context.config
target_metadata = Base.metadata


def _configure(connection=None, url=None) -> None:
    is_sqlite = get_settings().is_sqlite
    context.configure(
        connection=connection,
        url=url,
        target_metadata=target_metadata,
        render_as_batch=is_sqlite,  # SQLite needs table rebuilds for ALTERs
        compare_type=True,
    )


def run_migrations_offline() -> None:
    _configure(url=get_settings().database_url)
    with context.begin_transaction():
        context.run_migrations()


def _run_sync(connection) -> None:
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    ensure_sqlite_dir()
    engine = async_engine_from_config(
        {"sqlalchemy.url": get_settings().database_url}, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run_sync)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
