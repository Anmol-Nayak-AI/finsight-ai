import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import router
from app.graph.checkpointing import postgres_checkpoint_workflow
from app.database import engine
from app.demo_seed import seed_large_ledger_if_empty

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with postgres_checkpoint_workflow() as compiled_graph:
        app.state.workflow = compiled_graph
        if os.getenv("SEED_LEDGER_IF_EMPTY", "false").lower() == "true":
            seed_large_ledger_if_empty(engine)
        try:
            yield
        finally:
            app.state.workflow = None

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


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
        "base-uri 'self'; form-action 'self'",
    )
    if os.getenv("APP_ENV", "development").lower() == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    return response

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


# The free Render topology runs one web service. When STATIC_DIR is supplied by
# that image, FastAPI serves the compiled React application after all API and
# telemetry routes have been registered. Local and split-service deployments
# omit STATIC_DIR and continue to use the Vite/Nginx frontend unchanged.
STATIC_DIR = os.getenv("STATIC_DIR")
if STATIC_DIR:
    static_root = Path(STATIC_DIR).resolve()
    index_file = static_root / "index.html"
    assets_directory = static_root / "assets"

    if not index_file.is_file():
        raise RuntimeError(f"Compiled frontend is missing from {static_root}")

    if assets_directory.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_directory), name="frontend-assets")

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_frontend_index():
        return FileResponse(index_file)

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_frontend_route(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found.")

        requested_file = (static_root / full_path).resolve()
        if static_root in requested_file.parents and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(index_file)
