import os
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from dotenv import load_dotenv


load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg://postgres:password@localhost:5432/finsight"
)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Synchronous engine for fast synchronous tool execution in LangChain/LangGraph nodes
sync_engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20)

