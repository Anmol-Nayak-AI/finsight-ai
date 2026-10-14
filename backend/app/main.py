import os
from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import router
from app.graph.workflow import app as compiled_graph
from app.database import engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.workflow = compiled_graph
    yield

app = FastAPI(
    title="FinSight AI Compliance API",
    version="2.0.0",
    description="Enterprise Multi-Agent AML Regulatory Intelligence & Four-Eyes Governance",
    lifespan=lifespan
)

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]
ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/health", tags=["Telemetry"])
async def health_check():
    try:
        with engine.connect() as connection:
            schema_ready = connection.execute(text("""
                SELECT
                    to_regclass('public.transactions') IS NOT NULL
                    AND to_regclass('public.compliance_cases') IS NOT NULL
                    AND to_regclass('public.account_holders') IS NOT NULL
                    AND to_regclass('public.regulatory_chunks') IS NOT NULL
                    AND to_regclass('public.compliance_officers') IS NOT NULL;
            """)).scalar_one()
        if not schema_ready:
            raise RuntimeError("required database schema is incomplete")
    except Exception as error:
        print(f"[Readiness Check] {error}")
        raise HTTPException(status_code=503, detail="Database readiness check failed.")
    return {"status": "HEALTHY", "system": "FinSight AI Enterprise Engine", "database": "READY"}
