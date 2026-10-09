import os
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy import text
from dotenv import load_dotenv

from app.graph.workflow import create_compliance_graph
from app.models.entities import Base
from app.models.rag_entities import RegulatoryDocumentChunk
from app.database import engine
from app.api.routes import router as investigations_router

load_dotenv()

app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Initialize Tables & Vector extension
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"[FinSight Init Warning] Database schema check: {e}")

    # 2. Try PostgreSQL Checkpointer, fallback to robust MemorySaver
    checkpointer = None
    pool = None
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg_pool import AsyncConnectionPool
        
        DB_URI = os.getenv("DATABASE_CHECKPOINT_URL", "postgresql://postgres:password@postgres:5432/finsight")
        pool = AsyncConnectionPool(conninfo=DB_URI, max_size=10, kwargs={"autocommit": True}, open=False)
        await pool.open()
        
        conn = await pool.getconn()
        checkpointer = AsyncPostgresSaver(conn)
        await checkpointer.setup()
        app_state["pool"] = pool
        print("[FinSight Init] PostgreSQL Checkpointer successfully initialized.")
    except Exception as err:
        if pool:
            try:
                await pool.close()
            except Exception:
                pass
        print(f"[FinSight Init Fallback] Postgres checkpointer error: {err}. Using MemorySaver.")
        checkpointer = MemorySaver()

    compiled_workflow = create_compliance_graph().compile(checkpointer=checkpointer)
    
    app.state.workflow = compiled_workflow
    app.state.checkpointer = checkpointer
    app_state["workflow"] = compiled_workflow
    app_state["checkpointer"] = checkpointer

    yield

    # Clean shutdown
    if "pool" in app_state:
        await app_state["pool"].close()

app = FastAPI(
    title="FinSight AI — Compliance Platform",
    version="2.4.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(investigations_router)

@app.get("/health")
async def health_check():
    return {"status": "HEALTHY", "service": "finsight-api"}
