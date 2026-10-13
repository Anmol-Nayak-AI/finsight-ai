import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg://postgres:password@localhost:5432/finsight"
)

# Enterprise Production Connection Pool with Sleep/Wake Resilience
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # Pings DB prior to every query; recovers severed sockets automatically
    pool_recycle=300,         # Recycles idle connections every 5 minutes to prevent stale OS sockets
    pool_size=10,             # Maintains 10 persistent worker connections
    max_overflow=20           # Accommodates concurrent burst throughput
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
