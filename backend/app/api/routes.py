import uuid
import traceback
from fastapi import APIRouter, HTTPException, Request, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from langgraph.types import Command
from app.database import engine, sync_engine
from app.tools.compliance_tools import TransactionCreatePayload, register_custom_transaction
from app.auth.security import (
    create_access_token, 
    verify_password, 
    hash_password,
    get_current_user, 
    require_role, 
    UserPrincipal
)

# Use synchronous engine for synchronous tool and database queries
engine = sync_engine

router = APIRouter(prefix="/api/v1", tags=["Enterprise Compliance API"])

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = Field(default="MLRO_OFFICER", description="MLRO_OFFICER or ANALYST")
    department: str = "Financial Crime Compliance (FCC)"
    badge_id: str = ""

class InvestigationRequest(BaseModel):
    transaction_id: str

class AdjudicationRequest(BaseModel):
    decision: str  # APPROVED | REJECTED | ESCALATED
    notes: str

# 1. Register New Compliance Officer
@router.post("/auth/register")
async def register(req: RegisterRequest):
    username = req.username.strip().lower()
    if not username or len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Username required and password must be >= 4 characters.")
    
    badge = req.badge_id.strip() if req.badge_id.strip() else f"AML-{uuid.uuid4().hex[:5].upper()}"
    role = req.role if req.role in ["MLRO_OFFICER", "ANALYST", "SUPER_ADMIN"] else "ANALYST"
    
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT username FROM compliance_officers WHERE username = :u;"),
            {"u": username}
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Officer ID '{username}' already registered. Please sign in.")
        
        hashed = hash_password(req.password)
        conn.execute(
            text("""
                INSERT INTO compliance_officers (username, hashed_password, full_name, role, badge_id, department)
                VALUES (:u, :pwd, :name, :role, :badge, :dept);
            """),
            {
                "u": username,
                "pwd": hashed,
                "name": req.full_name.strip() or username.title(),
                "role": role,
                "badge": badge,
                "dept": req.department.strip() or "Special Investigations Unit (SIU)"
            }
        )

    principal = UserPrincipal(
        username=username,
        full_name=req.full_name.strip() or username.title(),
        role=role,
        badge_id=badge,
        department=req.department.strip() or "Special Investigations Unit (SIU)"
    )
    token = create_access_token(principal)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": principal.dict()
    }

# 2. Login Existing Officer
@router.post("/auth/login")
async def login(req: LoginRequest):
    username = req.username.strip().lower()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT username, hashed_password, full_name, role, badge_id, department FROM compliance_officers WHERE username = :u;"),
            {"u": username}
        ).mappings().first()

    if not row or not verify_password(req.password, row["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Invalid username or security credentials."
        )

    principal = UserPrincipal(
        username=row["username"],
        full_name=row["full_name"],
        role=row["role"],
        badge_id=row["badge_id"],
        department=row["department"]
    )
    token = create_access_token(principal)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": principal.dict()
    }

# 3. Directory of Compliance Personnel (RBAC Governance)
@router.get("/auth/users")
async def list_compliance_officers(current_user: UserPrincipal = Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT username, full_name, role, badge_id, department, created_at 
                FROM compliance_officers 
                ORDER BY created_at DESC;
            """)
        ).mappings().all()
    return [dict(r) for r in rows]

@router.get("/auth/me")
async def get_my_profile(current_user: UserPrincipal = Depends(get_current_user)):
    return current_user

def get_workflow(request: Request):
    if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
        return request.app.state.workflow
    from app.main import app_state
    if "workflow" in app_state and app_state["workflow"] is not None:
        return app_state["workflow"]
    raise HTTPException(status_code=500, detail="LangGraph workflow engine is not initialized.")

@router.post("/investigations/simulate")
async def simulate_dynamic_investigation(
    payload: TransactionCreatePayload, 
    request: Request,
    current_user: UserPrincipal = Depends(require_role(["ANALYST", "MLRO_OFFICER"]))
):
    try:
        workflow = get_workflow(request)
        registered = register_custom_transaction(payload)
        
        case_id = f"CASE-{uuid.uuid4().hex[:8].upper()}"
        config = {"configurable": {"thread_id": case_id}}

        initial_state = {
            "case_id": case_id,
            "transaction_id": registered["transaction_id"],
            "customer_id": registered["customer_id"],
            "transaction_data": registered,
            "customer_profile": {},
            "findings": [],
            "retrieved_policies": [],
            "cumulative_risk_score": 0.0,
            "requires_human_review": False,
            "review_status": "INITIALIZED",
            "human_notes": None,
            "final_verdict": None,
            "execution_trace": [
                f"Case {case_id} registered by Officer {current_user.full_name} ({current_user.badge_id})"
            ]
        }

        state_output = await workflow.ainvoke(initial_state, config=config)

        return {
            "case_id": case_id,
            "status": state_output.get("review_status"),
            "risk_score": state_output.get("cumulative_risk_score", 0.0),
            "requires_human_review": state_output.get("requires_human_review", False),
            "findings": state_output.get("findings", []),
            "retrieved_policies": state_output.get("retrieved_policies", []),
            "execution_trace": state_output.get("execution_trace", []),
            "final_verdict": state_output.get("final_verdict"),
            "transaction_data": registered,
            "audited_by": current_user.dict()
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {str(e)}")

@router.post("/investigations/run")
async def trigger_investigation(
    req: InvestigationRequest, 
    request: Request,
    current_user: UserPrincipal = Depends(require_role(["ANALYST", "MLRO_OFFICER"]))
):
    try:
        workflow = get_workflow(request)
        case_id = f"CASE-{uuid.uuid4().hex[:8].upper()}"
        config = {"configurable": {"thread_id": case_id}}

        initial_state = {
            "case_id": case_id,
            "transaction_id": req.transaction_id,
            "customer_id": "",
            "transaction_data": {},
            "customer_profile": {},
            "findings": [],
            "retrieved_policies": [],
            "cumulative_risk_score": 0.0,
            "requires_human_review": False,
            "review_status": "INITIALIZED",
            "human_notes": None,
            "final_verdict": None,
            "execution_trace": [f"Case {case_id} initiated for {req.transaction_id} by {current_user.badge_id}"]
        }

        state_output = await workflow.ainvoke(initial_state, config=config)
        return {**state_output, "case_id": case_id, "audited_by": current_user.dict()}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")

@router.post("/investigations/{case_id}/resume")
async def resume_investigation(
    case_id: str, 
    payload: AdjudicationRequest, 
    request: Request,
    current_user: UserPrincipal = Depends(require_role(["MLRO_OFFICER"]))
):
    try:
        workflow = get_workflow(request)
        config = {"configurable": {"thread_id": case_id}}

        resumed_state = await workflow.ainvoke(
            Command(resume={
                "decision": payload.decision, 
                "notes": f"[{current_user.badge_id} - {current_user.full_name}]: {payload.notes}"
            }),
            config=config
        )

        return {
            "case_id": case_id,
            "review_status": resumed_state.get("review_status"),
            "final_verdict": resumed_state.get("final_verdict"),
            "execution_trace": resumed_state.get("execution_trace"),
            "sign_off_officer": current_user.dict()
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Adjudication resume failed: {str(e)}")
