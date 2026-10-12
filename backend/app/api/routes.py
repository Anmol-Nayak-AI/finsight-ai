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

class InvestigationRequest(BaseModel):
    transaction_id: str

class AdjudicationRequest(BaseModel):
    decision: str  # APPROVED | REJECTED | ESCALATED
    notes: str

@router.post("/auth/login")
async def login(req: LoginRequest):
    user_record = DEMO_OFFICERS.get(req.username)
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
