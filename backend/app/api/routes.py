import uuid
import traceback
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from langgraph.types import Command
from app.tools.compliance_tools import TransactionCreatePayload, register_custom_transaction
from app.auth.security import require_role, UserPrincipal

router = APIRouter(prefix="/api/v1/investigations", tags=["Investigations"])

class InvestigationRequest(BaseModel):
    transaction_id: str

class AdjudicationRequest(BaseModel):
    decision: str
    notes: str

def get_workflow(request: Request):
    """Safely retrieves the compiled LangGraph workflow from application state."""
    if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
        return request.app.state.workflow
    from app.main import app_state
    if "workflow" in app_state and app_state["workflow"] is not None:
        return app_state["workflow"]
    raise HTTPException(status_code=500, detail="LangGraph workflow engine is not initialized.")

@router.post("/simulate")
async def simulate_dynamic_investigation(payload: TransactionCreatePayload, request: Request):
    """Registers dynamic user-configured transaction and executes the compliance graph."""
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
            "execution_trace": [f"Dynamic case {case_id} registered for {registered['transaction_id']}"]
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
            "transaction_data": registered
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {str(e)}")

@router.post("/run")
async def trigger_investigation(req: InvestigationRequest, request: Request):
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
            "execution_trace": [f"Case {case_id} initialized for {req.transaction_id}"]
        }

        state_output = await workflow.ainvoke(initial_state, config=config)
        return {**state_output, "case_id": case_id}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")

@router.post("/{case_id}/resume")
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
            Command(resume={"decision": payload.decision, "notes": payload.notes}),
            config=config
        )

        trace = list(resumed_state.get("execution_trace", []))
        trace.append(f"Statutory HITL sign-off certified by {current_user.full_name} ({current_user.badge_id}, {current_user.department})")

        return {
            "case_id": case_id,
            "review_status": resumed_state.get("review_status"),
            "final_verdict": resumed_state.get("final_verdict"),
            "execution_trace": trace,
            "adjudicated_by": {
                "name": current_user.full_name,
                "role": current_user.role,
                "badge_id": current_user.badge_id,
                "department": current_user.department
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Adjudication resume failed: {str(e)}")

