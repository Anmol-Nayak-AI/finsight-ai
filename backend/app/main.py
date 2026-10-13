import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import router
from app.graph.workflow import app as compiled_graph

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

# Allow credentials for localhost and production cloud subdomains
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Allow any onrender.com frontend domain dynamically
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/health", tags=["Telemetry"])
async def health_check():
    return {"status": "HEALTHY", "system": "FinSight AI Enterprise Engine"}
