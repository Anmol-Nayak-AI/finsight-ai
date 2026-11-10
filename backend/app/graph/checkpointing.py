import os
from contextlib import asynccontextmanager

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.database import RAW_DATABASE_URL
from app.graph.workflow import compile_compliance_graph, create_checkpoint_serializer


def normalize_checkpoint_database_url(database_url: str) -> str:
    """Convert SQLAlchemy-style PostgreSQL URLs into psycopg connection URLs."""
    driver_prefixes = (
        "postgresql+psycopg://",
        "postgresql+psycopg2://",
        "postgresql+asyncpg://",
    )
    for prefix in driver_prefixes:
        if database_url.startswith(prefix):
            return database_url.replace(prefix, "postgresql://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql://", 1)
    return database_url


def _positive_int_from_env(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value < 1:
        raise ValueError(f"{name} must be at least 1")
    return value


def create_checkpoint_pool() -> AsyncConnectionPool:
    """Build the bounded pool used exclusively by LangGraph checkpoints."""
    checkpoint_url = (os.getenv("DATABASE_CHECKPOINT_URL") or RAW_DATABASE_URL).strip()
    if not checkpoint_url:
        raise RuntimeError("DATABASE_CHECKPOINT_URL or DATABASE_URL must be configured")

    min_size = _positive_int_from_env("CHECKPOINT_POOL_MIN_SIZE", 1)
    max_size = _positive_int_from_env("CHECKPOINT_POOL_MAX_SIZE", 10)
    if max_size < min_size:
        raise ValueError("CHECKPOINT_POOL_MAX_SIZE must be greater than or equal to CHECKPOINT_POOL_MIN_SIZE")

    return AsyncConnectionPool(
        conninfo=normalize_checkpoint_database_url(checkpoint_url),
        min_size=min_size,
        max_size=max_size,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
        },
        check=AsyncConnectionPool.check_connection,
        name="langgraph-checkpoints",
        open=False,
    )


@asynccontextmanager
async def postgres_checkpoint_workflow():
    """Own the durable checkpointer and compiled graph for one app lifespan."""
    pool = create_checkpoint_pool()
    startup_timeout = float(os.getenv("CHECKPOINT_POOL_STARTUP_TIMEOUT", "30"))

    try:
        await pool.open(wait=True, timeout=startup_timeout)
        checkpointer = AsyncPostgresSaver(
            pool,
            serde=create_checkpoint_serializer(),
        )
        await checkpointer.setup()
        yield compile_compliance_graph(checkpointer)
    finally:
        await pool.close()
