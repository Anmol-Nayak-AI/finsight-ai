import uuid
import traceback
from fastapi import APIRouter, HTTPException, Request, Depends, status
from pydantic import BaseModel
from langgraph.types import Command
from app.tools.compliance_tools import TransactionCreatePayload, register_custom_transaction
from app.auth import (
    create_access_token, 
    verify_password, 
    get_current_user, 
    require_role, 
    UserPrincipal, 
    DEMO_OFFICERS
)

router = APIRouter(prefix="/api/v1", tags=["Enterprise Compliance API"])

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "MLRO_OFFICER"
    department: str = "Special Investigations Unit (SIU)"

class InvestigationRequest(BaseModel):
    transaction_id: str

class AdjudicationRequest(BaseModel):
    decision: str  # APPROVED | REJECTED | ESCALATED
    notes: str

@router.post("/auth/register")
async def register_officer(req: RegisterRequest):
    from app.database import sync_engine
    from app.auth.security import hash_password
    from sqlalchemy import text
    import random
    
    username = req.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty.")
    
    hashed = hash_password(req.password)
    badge_prefix = "AML" if req.role != "SUPER_ADMIN" else "DIR"
    badge_id = f"{badge_prefix}-{random.randint(10000, 99999)}"
    
    try:
        with sync_engine.begin() as conn:
            existing = conn.execute(
                text("SELECT username FROM compliance_officers WHERE username = :u;"),
                {"u": username}
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Officer username already exists.")
            
            conn.execute(
                text("""
                INSERT INTO compliance_officers (username, hashed_password, full_name, role, badge_id, department, is_active)
                VALUES (:u, :pwd, :name, :role, :badge, :dept, TRUE);
                """),
                {
                    "u": username,
                    "pwd": hashed,
                    "name": req.full_name.strip() or username,
                    "role": req.role,
                    "badge": badge_id,
                    "dept": req.department.strip() or "Financial Crime Compliance"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    
    principal = UserPrincipal(
        username=username,
        full_name=req.full_name.strip() or username,
        role=req.role,
        badge_id=badge_id,
        department=req.department.strip() or "Financial Crime Compliance"
    )
    token = create_access_token(principal)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": principal.dict()
    }

@router.post("/auth/login")
async def login(req: LoginRequest):
    from app.database import sync_engine
    from sqlalchemy import text

    username = req.username.strip().lower()
    user_record = None

    # 1. Query PostgreSQL compliance_officers table
    try:
        with sync_engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM compliance_officers WHERE LOWER(username) = :u AND is_active = TRUE;"),
                {"u": username}
            ).mappings().first()
            if row:
                user_record = dict(row)
    except Exception as e:
        print(f"[Auth DB Warning] {e}")

    # 2. Fallback to in-memory DEMO_OFFICERS
    if not user_record:
        user_record = DEMO_OFFICERS.get(req.username.strip())

    if not user_record or not verify_password(req.password, user_record["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Compliance Officer credentials."
        )
    
    principal = UserPrincipal(
        username=user_record["username"],
        full_name=user_record["full_name"],
        role=user_record["role"],
        badge_id=user_record["badge_id"],
        department=user_record["department"]
    )
    token = create_access_token(principal)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": principal.dict()
    }


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
    # Regulatory compliance mandates MLRO / Special Unit authority to officially sign off
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
