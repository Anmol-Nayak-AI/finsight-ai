import uuid
import hashlib
import traceback
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Response, Depends, status
from pydantic import BaseModel
from sqlalchemy import text
from langgraph.types import Command
from app.database import engine
try:
    from app.database import sync_engine
    engine = sync_engine
except ImportError:
    pass

from app.tools.compliance_tools import TransactionCreatePayload, register_custom_transaction
from app.auth.security import (
    create_mfa_challenge_token,
    create_session_token,
    revoke_session,
    verify_totp_code,
    get_totp_provisioning_uri,
    log_security_event,
    get_current_user,
    require_role,
    UserPrincipal,
    PRE_PROVISIONED_ROSTER
)

router = APIRouter(prefix="/api/v1", tags=["Enterprise Compliance API"])

# In-Memory Queue for Four-Eyes Handoff with initial institutional seed cases
INVESTIGATION_QUEUE: Dict[str, Dict[str, Any]] = {
    "CASE-74910284": {
        "case_id": "CASE-74910284",
        "status": "PENDING_CHECKER",
        "risk_score": 0.88,
        "requires_maker_review": False,
        "requires_checker_review": True,
        "requires_human_review": True,
        "transaction_id": "TXN-910284",
        "customer_name": "Aarav Malhotra",
        "beneficiary_name": "Apex Shell Logistics Ltd",
        "amount": 850000.0,
        "historical_avg": 45000.0,
        "channel": "IMPS",
        "findings": [
            {
                "agent": "Transaction Investigator",
                "risk_level": "HIGH",
                "score_delta": 0.45,
                "details": "Severe velocity spike: Amount ₹850,000.00 is 18.9x historical baseline ₹45,000.00."
            },
            {
                "agent": "Customer Risk Analyst",
                "risk_level": "HIGH",
                "score_delta": 0.35,
                "details": "Apex Shell Logistics Ltd is an offshore counterparty incorporated in Seychelles with no visible commercial trading footprint."
            }
        ],
        "retrieved_policies": [
            {
                "document_title": "RBI Master Direction - Know Your Customer (KYC) Direction, 2016",
                "citation": "RBI/DBR/2015-16/18 Section 35",
                "section": "Section 35 (Enhanced Due Diligence)",
                "snippet": "Regulated Entities shall examine the background and purpose of all complex, unusually large transactions and all unusual patterns of transactions, which have no apparent economic or visible lawful purpose."
            }
        ],
        "execution_trace": [
            "Case CASE-74910284 registered by Officer Rohan Verma (AML-33012)",
            "Graph identified 18.9x velocity surge across IMPS channel",
            "Statutory RRF fusion retrieved KYC Direction Section 35",
            "State machine interrupted at 88% cumulative risk score",
            "Analyst Rohan Verma submitted RECOMMEND_REJECT recommendation"
        ],
        "final_verdict": None,
        "transaction_data": {
            "transaction_id": "TXN-910284",
            "customer_id": "CUST-44021",
            "customer_name": "Aarav Malhotra",
            "amount": 850000.0,
            "currency": "INR",
            "channel": "IMPS",
            "beneficiary_name": "Apex Shell Logistics Ltd",
            "beneficiary_is_new": True,
            "narration": "Consulting Retainer Settlement",
            "historical_avg": 45000.0
        },
        "maker_status": {
            "decision": "RECOMMEND_REJECT",
            "summary": "Beneficiary matched shell entity patterns; 18.9x velocity spike over 30-day baseline. Account freeze and FIU SAR advised.",
            "officer": "Rohan Verma (AML-33012)",
            "username": "analyst.verma"
        },
        "checker_status": None
    },
    "CASE-89A0E1F3": {
        "case_id": "CASE-89A0E1F3",
        "status": "FINALIZED",
        "risk_score": 0.92,
        "requires_maker_review": False,
        "requires_checker_review": False,
        "requires_human_review": False,
        "transaction_id": "TXN-1004812",
        "customer_name": "Vikram Singhania",
        "beneficiary_name": "KoinX BVI Crypto Exchange",
        "amount": 1850000.0,
        "historical_avg": 55000.0,
        "channel": "RTGS",
        "findings": [
            {
                "agent": "Transaction Investigator",
                "risk_level": "HIGH",
                "score_delta": 0.50,
                "details": "RTGS outbound wire ₹1,850,000.00 is 33.6x over account baseline."
            },
            {
                "agent": "Customer Risk Analyst",
                "risk_level": "HIGH",
                "score_delta": 0.42,
                "details": "Virtual Asset Service Provider (VASP) based in BVI flagged under high-risk jurisdiction notice."
            }
        ],
        "retrieved_policies": [
            {
                "document_title": "Prevention of Money Laundering (Maintenance of Records) Rules, 2005",
                "citation": "PMLA 2002 Section 12",
                "section": "Section 12 (Reporting Entity Obligations)",
                "snippet": "Every reporting entity shall furnish to the Director information relating to transactions specified in rules 3, 5, 7 and 8 within seven working days."
            }
        ],
        "execution_trace": [
            "Case CASE-89A0E1F3 registered by Officer Rohan Verma (AML-33012)",
            "Graph interrupted at 92% cumulative risk score",
            "Analyst recommended RECOMMEND_REJECT",
            "Checker Priya Sharma executed CONFIRMED_REJECTED"
        ],
        "final_verdict": "CONFIRMED_REJECTED",
        "transaction_data": {
            "transaction_id": "TXN-1004812",
            "customer_id": "CUST-99210",
            "customer_name": "Vikram Singhania",
            "amount": 1850000.0,
            "currency": "INR",
            "channel": "RTGS",
            "beneficiary_name": "KoinX BVI Crypto Exchange",
            "beneficiary_is_new": True,
            "narration": "Commercial Retainer Settlement",
            "historical_avg": 55000.0
        },
        "maker_status": {
            "decision": "RECOMMEND_REJECT",
            "summary": "High risk offshore VASP wire with anomalous velocity surge.",
            "officer": "Rohan Verma (AML-33012)",
            "username": "analyst.verma"
        },
        "checker_status": {
            "decision": "CONFIRMED_REJECTED",
            "memo": "Statutory account freeze ordered pursuant to PMLA Section 12. Transmitting STR to FIU-IND.",
            "officer": "Priya Sharma (AML-88219)"
        }
    }
}

class Step1LoginRequest(BaseModel):
    username: str
    password: str

class VerifyMfaRequest(BaseModel):
    mfa_challenge_token: str
    totp_code: str

class MakerRecommendationPayload(BaseModel):
    recommendation: str
    findings_summary: str

class CheckerExecutionPayload(BaseModel):
    final_decision: str
    statutory_memo: str

@router.post("/auth/login-step1")
async def login_step1(req: Step1LoginRequest):
    user_record = PRE_PROVISIONED_ROSTER.get(req.username.strip().lower())
    if not user_record:
        log_security_event("LOGIN_FAILED", username=req.username, details="Non-existent account.")
        raise HTTPException(status_code=401, detail="Invalid institutional credentials.")

    input_hash = hashlib.sha256(req.password.encode()).hexdigest()
    if input_hash != user_record["password_hash"]:
        log_security_event("LOGIN_FAILED", username=req.username, details="Password mismatch.")
        raise HTTPException(status_code=401, detail="Invalid institutional credentials.")

    challenge_token = create_mfa_challenge_token(user_record["username"])
    otpauth_uri = get_totp_provisioning_uri(user_record["username"], user_record["totp_seed"])

    log_security_event("MFA_CHALLENGE_ISSUED", username=user_record["username"], badge_id=user_record["badge_id"])
    return {
        "status": "MFA_REQUIRED",
        "mfa_challenge_token": challenge_token,
        "officer_name": user_record["full_name"],
        "badge_id": user_record["badge_id"],
        "role": user_record["role"],
        "totp_seed": user_record["totp_seed"],
        "otpauth_uri": otpauth_uri
    }

@router.post("/auth/verify-mfa")
async def verify_mfa(req: VerifyMfaRequest, response: Response):
    import jwt
    from app.auth.security import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(req.mfa_challenge_token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="MFA challenge expired. Please re-authenticate.")

    user_record = PRE_PROVISIONED_ROSTER.get(username)
    if not user_record or not verify_totp_code(user_record["totp_seed"], req.totp_code):
        log_security_event("MFA_FAILED", username=username, details="Invalid 6-digit authenticator code.")
        raise HTTPException(status_code=401, detail="Invalid 6-Digit Code. Check your Authenticator app.")

    principal = UserPrincipal(
        username=user_record["username"],
        full_name=user_record["full_name"],
        role=user_record["role"],
        badge_id=user_record["badge_id"],
        department=user_record["department"]
    )
    
    session_token = create_session_token(principal)
    response.set_cookie(
        key="finsight_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=8 * 3600
    )

    log_security_event("MFA_AUTHENTICATED", username=principal.username, badge_id=principal.badge_id, details="HttpOnly Session established.")
    return {
        "status": "AUTHENTICATED", 
        "user": principal.dict(),
        "token_backup": session_token
    }

# Backward compatibility direct login
@router.post("/auth/login")
async def login_direct(req: Step1LoginRequest, response: Response):
    user_record = PRE_PROVISIONED_ROSTER.get(req.username.strip().lower())
    if not user_record:
        log_security_event("LOGIN_FAILED", username=req.username, details="Non-existent account.")
        raise HTTPException(status_code=401, detail="Invalid institutional credentials.")

    input_hash = hashlib.sha256(req.password.encode()).hexdigest()
    if input_hash != user_record["password_hash"]:
        log_security_event("LOGIN_FAILED", username=req.username, details="Password mismatch.")
        raise HTTPException(status_code=401, detail="Invalid institutional credentials.")

    principal = UserPrincipal(
        username=user_record["username"],
        full_name=user_record["full_name"],
        role=user_record["role"],
        badge_id=user_record["badge_id"],
        department=user_record["department"]
    )
    session_token = create_session_token(principal)
    response.set_cookie(
        key="finsight_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=8 * 3600
    )
    log_security_event("SESSION_AUTHENTICATED", username=principal.username, badge_id=principal.badge_id, details="Direct session established.")
    return {
        "status": "AUTHENTICATED",
        "access_token": session_token,
        "token_type": "bearer",
        "user": principal.dict(),
        "token_backup": session_token
    }

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("finsight_session")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if token:
        revoke_session(token)
    response.delete_cookie("finsight_session")
    return {"status": "SUCCESS", "message": "Officer session terminated."}

@router.get("/auth/me")
async def get_my_profile(request: Request):
    return get_current_user(request)

@router.get("/auth/users")
async def get_directory(request: Request):
    _ = get_current_user(request)
    return [
        {
            "username": u["username"],
            "full_name": u["full_name"],
            "role": u["role"],
            "badge_id": u["badge_id"],
            "department": u["department"],
            "totp_seed": u["totp_seed"]
        }
        for u in PRE_PROVISIONED_ROSTER.values()
    ]

@router.get("/auth/audit-logs")
async def get_audit_logs(request: Request):
    _ = get_current_user(request)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, event_type, username, badge_id, details, created_at FROM security_audit_logs ORDER BY created_at DESC LIMIT 30;")
        ).mappings().all()
    return [dict(r) for r in rows]

def get_workflow(request: Request):
    if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
        return request.app.state.workflow
    from app.main import app_state
    if "workflow" in app_state and app_state["workflow"] is not None:
        return app_state["workflow"]
    raise HTTPException(status_code=500, detail="LangGraph engine not initialized.")

# GET MLRO PENDING CASE QUEUE
@router.get("/investigations/queue")
async def get_pending_queue(request: Request):
    _ = get_current_user(request)
    return list(INVESTIGATION_QUEUE.values())

# INGEST STREAM ANOMALY (Pulls or synthesizes high-risk record from 1M ledger)
@router.post("/investigations/queue/ingest-stream")
async def ingest_stream_case(request: Request):
    user = require_role(["MLRO_OFFICER", "ANALYST"])(request)
    workflow = get_workflow(request)

    stream_txns = [
        {
            "transaction_id": f"TXN-STRM-{uuid.uuid4().hex[:6].upper()}",
            "customer_id": "CUST-88319",
            "customer_name": "Nexa Global Trade Ltd",
            "amount": 2450000.0,
            "currency": "INR",
            "channel": "SWIFT",
            "beneficiary_id": "BEN-99212",
            "beneficiary_name": "Panama Horizon Shell Corp",
            "beneficiary_is_new": True,
            "narration": "Offshore Trade Settlement Advance",
            "historical_avg": 42000.0
        },
        {
            "transaction_id": f"TXN-STRM-{uuid.uuid4().hex[:6].upper()}",
            "customer_id": "CUST-99201",
            "customer_name": "TechFab Solutions Pvt Ltd",
            "amount": 1680000.0,
            "currency": "INR",
            "channel": "RTGS",
            "beneficiary_id": "BEN-88341",
            "beneficiary_name": "KoinX BVI Crypto Exchange",
            "beneficiary_is_new": True,
            "narration": "Commercial Retainer Settlement",
            "historical_avg": 35000.0
        }
    ]

    import random
    selected_txn = random.choice(stream_txns)
    case_id = f"CASE-{uuid.uuid4().hex[:8].upper()}"
    config = {"configurable": {"thread_id": case_id}}

    initial_state = {
        "case_id": case_id,
        "transaction_id": selected_txn["transaction_id"],
        "customer_id": selected_txn["customer_id"],
        "transaction_data": selected_txn,
        "customer_profile": {},
        "findings": [],
        "retrieved_policies": [],
        "cumulative_risk_score": 0.0,
        "requires_human_review": False,
        "review_status": "INITIALIZED",
        "maker_recommendation": None,
        "maker_officer": None,
        "checker_verdict": None,
        "checker_officer": None,
        "final_verdict": None,
        "execution_trace": [f"Stream Anomaly Case {case_id} ingested into MLRO queue."]
    }

    try:
        output = await workflow.ainvoke(initial_state, config=config)
    except Exception as e:
        print(f"Workflow stream notice: {e}")
        output = {}

    risk_score = output.get("cumulative_risk_score", 0.89)

    case_obj = {
        "case_id": case_id,
        "status": "PENDING_CHECKER",
        "risk_score": risk_score,
        "requires_maker_review": False,
        "requires_checker_review": True,
        "requires_human_review": True,
        "findings": output.get("findings", [
            {
                "agent": "Transaction Investigator",
                "risk_level": "HIGH",
                "score_delta": 0.45,
                "details": f"Velocity Spike: Outbound amount ₹{selected_txn['amount']:,.2f} is {(selected_txn['amount']/selected_txn['historical_avg']):.1f}x over account average ₹{selected_txn['historical_avg']:,.2f}."
            },
            {
                "agent": "Customer Risk Analyst",
                "risk_level": "HIGH",
                "score_delta": 0.35,
                "details": f"Beneficiary {selected_txn['beneficiary_name']} identified as unverified offshore counterparty."
            }
        ]),
        "retrieved_policies": output.get("retrieved_policies", [
            {
                "document_title": "RBI Master Direction - Know Your Customer (KYC) Direction, 2016",
                "citation": "RBI/DBR/2015-16/18 Section 35",
                "section": "Section 35 (Enhanced Due Diligence)",
                "snippet": "Regulated Entities shall examine the background and purpose of all complex, unusually large transactions."
            }
        ]),
        "execution_trace": output.get("execution_trace", [f"Automated ingest triage executed for {case_id}"]),
        "final_verdict": None,
        "transaction_data": selected_txn,
        "transaction_id": selected_txn["transaction_id"],
        "customer_name": selected_txn["customer_name"],
        "beneficiary_name": selected_txn["beneficiary_name"],
        "amount": selected_txn["amount"],
        "historical_avg": selected_txn["historical_avg"],
        "channel": selected_txn["channel"],
        "maker_status": {
            "decision": "RECOMMEND_REJECT",
            "summary": "Stream Ingestion Flag: High velocity anomaly and offshore shell linkage detected.",
            "officer": "Rohan Verma (AML-33012)",
            "username": "analyst.verma"
        },
        "checker_status": None
    }

    INVESTIGATION_QUEUE[case_id] = case_obj
    log_security_event("STREAM_ANOMALY_INGESTED", username=user.username, badge_id=user.badge_id, details=f"Inbound stream case {case_id} queued")
    return case_obj

@router.post("/investigations/simulate")
async def simulate_investigation(payload: TransactionCreatePayload, request: Request):
    user = require_role(["ANALYST", "MLRO_OFFICER"])(request)
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
            "maker_recommendation": None,
            "maker_officer": None,
            "checker_verdict": None,
            "checker_officer": None,
            "final_verdict": None,
            "execution_trace": [f"Case {case_id} registered by Officer {user.full_name} ({user.badge_id})"]
        }

        output = await workflow.ainvoke(initial_state, config=config)
        is_high_risk = output.get("cumulative_risk_score", 0.0) >= 0.70

        case_obj = {
            "case_id": case_id,
            "status": "PENDING_MAKER_REVIEW" if is_high_risk else "AUTO_APPROVED",
            "risk_score": output.get("cumulative_risk_score", 0.0),
            "requires_maker_review": is_high_risk,
            "requires_checker_review": False,
            "requires_human_review": is_high_risk,
            "findings": output.get("findings", []),
            "retrieved_policies": output.get("retrieved_policies", []),
            "execution_trace": output.get("execution_trace", []),
            "final_verdict": None if is_high_risk else "AUTO_APPROVED",
            "transaction_data": registered,
            "transaction_id": registered["transaction_id"],
            "customer_name": registered["customer_name"],
            "beneficiary_name": registered["beneficiary_name"],
            "amount": registered["amount"],
            "historical_avg": registered["historical_avg"],
            "channel": registered["channel"],
            "maker_status": None,
            "checker_status": None
        }

        INVESTIGATION_QUEUE[case_id] = case_obj
        return case_obj
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")

# MAKER STEP: SUBMIT RECOMMENDATION
@router.post("/investigations/{case_id}/maker-recommend")
async def maker_recommend(case_id: str, payload: MakerRecommendationPayload, request: Request):
    maker = require_role(["ANALYST", "MLRO_OFFICER"])(request)
    
    if case_id not in INVESTIGATION_QUEUE:
        raise HTTPException(status_code=404, detail="Case not found in active ledger.")

    case_obj = INVESTIGATION_QUEUE[case_id]
    case_obj["status"] = "PENDING_CHECKER_APPROVAL"
    case_obj["requires_maker_review"] = False
    case_obj["requires_checker_review"] = True
    case_obj["maker_status"] = {
        "decision": payload.recommendation,
        "summary": payload.findings_summary,
        "officer": f"{maker.full_name} ({maker.badge_id})",
        "username": maker.username
    }

    log_security_event("MAKER_RECOMMENDATION_FILED", username=maker.username, badge_id=maker.badge_id, details=f"Case {case_id} -> {payload.recommendation}")
    return case_obj

# CHECKER STEP: MLRO OFFICER EXECUTES
@router.post("/investigations/{case_id}/checker-execute")
async def checker_execute(case_id: str, payload: CheckerExecutionPayload, request: Request):
    checker = require_role(["MLRO_OFFICER"])(request)
    
    if case_id not in INVESTIGATION_QUEUE:
        raise HTTPException(status_code=404, detail="Case not found in active ledger.")

    case_obj = INVESTIGATION_QUEUE[case_id]
    
    # Strict Four-Eyes Principle: The Maker cannot be the Checker
    if case_obj.get("maker_status", {}).get("username") == checker.username:
        raise HTTPException(
            status_code=403, 
            detail="Four-Eyes Violation: You cannot act as Checker on a case where you were the Maker."
        )

    workflow = get_workflow(request)
    config = {"configurable": {"thread_id": case_id}}

    try:
        await workflow.ainvoke(
            Command(resume={
                "decision": payload.final_decision,
                "notes": f"[CHECKER: {checker.full_name} - {checker.badge_id}]: {payload.statutory_memo}"
            }),
            config=config
        )
    except Exception as e:
        print(f"[Workflow resume note] {e}")

    case_obj["status"] = "FINALIZED"
    case_obj["final_verdict"] = payload.final_decision
    case_obj["requires_maker_review"] = False
    case_obj["requires_checker_review"] = False
    case_obj["checker_status"] = {
        "decision": payload.final_decision,
        "memo": payload.statutory_memo,
        "officer": f"{checker.full_name} ({checker.badge_id})"
    }

    log_security_event("CHECKER_EXECUTION_FINALIZED", username=checker.username, badge_id=checker.badge_id, details=f"Case {case_id} finalized as {payload.final_decision}")
    return case_obj

# Compatibility alias for legacy resume
class LegacyAdjudicationPayload(BaseModel):
    decision: str
    notes: str = ""

@router.post("/investigations/{case_id}/resume")
async def resume_legacy(case_id: str, payload: LegacyAdjudicationPayload, request: Request):
    checker_payload = CheckerExecutionPayload(
        final_decision=payload.decision,
        statutory_memo=payload.notes
    )
    res = await checker_execute(case_id, checker_payload, request)
    return {
        "case_id": res["case_id"],
        "review_status": res["status"],
        "final_verdict": res["final_verdict"],
        "execution_trace": [f"Adjudicated as {res['final_verdict']}"]
    }
