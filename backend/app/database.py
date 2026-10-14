import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from dotenv import load_dotenv

load_dotenv()

RAW_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg://postgres:password@localhost:5432/finsight"
)


def normalize_sqlalchemy_database_url(database_url: str) -> str:
    """Use psycopg 3 for provider URLs that omit a SQLAlchemy driver."""
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


DATABASE_URL = normalize_sqlalchemy_database_url(RAW_DATABASE_URL)

# Enterprise Production Connection Pool with Sleep/Wake Socket Auto-Recovery
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # Pings DB prior to every query; discards severed sockets
    pool_recycle=300,         # Recycles idle connections every 5 minutes
    pool_size=10,             # Maintains 10 persistent worker connections
    max_overflow=20           # Accommodates burst throughput
)

# Synchronous engine aliases & session helpers
sync_engine = engine
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Enterprise Async Engine & Session for RRF vector retrieval & evaluators
async_engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,
    max_overflow=20
)
async_session_factory = async_sessionmaker(async_engine, expire_on_commit=False, class_=AsyncSession)
