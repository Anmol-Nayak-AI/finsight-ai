import uuid
import hashlib
import json
import random
import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from langgraph.types import Command
from app.database import sync_engine as engine
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

# 1. Initialize PostgreSQL Case Management Table & Enterprise Seed Data
def init_case_management_db():
    try:
        with engine.begin() as conn:
            has_col = conn.execute(text("""
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'compliance_cases' AND column_name = 'customer_name';
            """)).scalar()
            if not has_col:
                conn.execute(text("DROP TABLE IF EXISTS compliance_cases CASCADE;"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS compliance_cases (
                    case_id VARCHAR(64) PRIMARY KEY,
                    transaction_id VARCHAR(64) NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    beneficiary_name VARCHAR(255) NOT NULL,
                    amount NUMERIC(15, 2) NOT NULL,
                    channel VARCHAR(32) NOT NULL,
                    historical_avg NUMERIC(15, 2) NOT NULL,
                    risk_score NUMERIC(5, 2) NOT NULL,
                    priority VARCHAR(16) DEFAULT 'P1 - CRITICAL',
                    sla_deadline VARCHAR(64) DEFAULT '45m remaining',
                    status VARCHAR(32) NOT NULL, -- PENDING_MAKER | PENDING_CHECKER | FINALIZED
                    maker_status JSONB,
                    checker_status JSONB,
                    final_verdict VARCHAR(64),
                    findings JSONB DEFAULT '[]'::jsonb,
                    retrieved_policies JSONB DEFAULT '[]'::jsonb,
                    execution_trace JSONB DEFAULT '[]'::jsonb,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_cases_status ON compliance_cases(status);
            """))

            # Seed initial realistic cases if table is empty
            count = conn.execute(text("SELECT COUNT(*) FROM compliance_cases;")).scalar()
            if count == 0:
                SEED_CASES = [
                    {
                        "case_id": "CASE-99214A",
                        "transaction_id": "TXN-1049281",
                        "customer_name": "Aarav Malhotra",
                        "beneficiary_name": "Panama Horizon Shell Corp",
                        "amount": 1450000.00,
                        "channel": "SWIFT",
                        "historical_avg": 45000.00,
                        "risk_score": 1.00,
                        "priority": "P1 - CRITICAL",
                        "sla_deadline": "28m remaining",
                        "status": "PENDING_CHECKER",
                        "maker_status": json.dumps({
                            "decision": "RECOMMEND_REJECT",
                            "summary": "First-time transfer to offshore shell company. 32.2x velocity spike exceeds RBI Section 41 risk thresholds.",
                            "officer": "Rohan Verma (AML-33012)",
                            "username": "analyst.verma"
                        }),
                        "findings": json.dumps([
                            {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": "High-risk transfer: INR 1,450,000 sent to first-time beneficiary 'Panama Horizon Shell Corp' via SWIFT cross-border corridor."},
                            {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": "Critical velocity spike: 32.22x deviation over 30-day baseline average (INR 45,000)."},
                            {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.40, "details": "Entity watchlist hit: Beneficiary matched high-risk offshore shell jurisdiction index."}
                        ]),
                        "retrieved_policies": json.dumps([
                            {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI/DBR/2015-16/18 Master Direction DBR.AML.BC.No.81/14.01.001/2015-16", "section": "Section 41 - Enhanced Due Diligence", "snippet": "Regulated Entities shall apply Enhanced Due Diligence measures to high-risk accounts and cross-border transfers involving unverified offshore corporate structures."},
                            {"document_title": "Prevention of Money-Laundering (Maintenance of Records) Rules, 2005", "citation": "PMLA Rule 3", "section": "Rule 3(1)(D)", "snippet": "Every reporting entity shall maintain records of all cross border wire transfers of value exceeding five lakh rupees where either origin or destination is suspect."}
                        ])
                    },
                    {
                        "case_id": "CASE-88310B",
                        "transaction_id": "TXN-1082914",
                        "customer_name": "Vikram Singhania",
                        "beneficiary_name": "KoinX BVI Crypto Exchange",
                        "amount": 1850000.00,
                        "channel": "RTGS",
                        "historical_avg": 60000.00,
                        "risk_score": 1.00,
                        "priority": "P1 - CRITICAL",
                        "sla_deadline": "1h 12m remaining",
                        "status": "PENDING_CHECKER",
                        "maker_status": json.dumps({
                            "decision": "RECOMMEND_REJECT",
                            "summary": "Virtual digital asset arbitrage funnel. Sudden liquidity offramp with zero historical cryptocurrency activity.",
                            "officer": "Rohan Verma (AML-33012)",
                            "username": "analyst.verma"
                        }),
                        "findings": json.dumps([
                            {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": "INR 1,850,000 sent to unlinked VDA custodial wallet exchange in British Virgin Islands."},
                            {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": "Velocity deviation of 30.83x against customer monthly turnover."}
                        ]),
                        "retrieved_policies": json.dumps([
                            {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI/2021-22/45 DOR.AML.REC.18/14.01.001/2021-22", "section": "Section 43 - Virtual Digital Assets", "snippet": "Banks must carry out customer due diligence processes for transactions in virtual digital assets in line with PML Rules and FATF Recommendation 15."}
                        ])
                    },
                    {
                        "case_id": "CASE-77192C",
                        "transaction_id": "TXN-1092819",
                        "customer_name": "Deepak Verma",
                        "beneficiary_name": "Alpha Overseas Trade LLP",
                        "amount": 495000.00,
                        "channel": "IMPS",
                        "historical_avg": 20000.00,
                        "risk_score": 0.85,
                        "priority": "P2 - HIGH",
                        "sla_deadline": "2h 40m remaining",
                        "status": "PENDING_CHECKER",
                        "maker_status": json.dumps({
                            "decision": "RECOMMEND_ESCALATE",
                            "summary": "Suspected structuring/smurfing just below statutory 5 Lakh reporting ceiling. Recommend referral to FIU-IND.",
                            "officer": "Rohan Verma (AML-33012)",
                            "username": "analyst.verma"
                        }),
                        "findings": json.dumps([
                            {"agent": "TransactionInvestigator", "risk_level": "MEDIUM", "score_delta": 0.30, "details": "Amount of INR 495,000 structured just below mandatory INR 500,000 currency threshold."},
                            {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": "24.75x velocity spike deviation from historical baseline (INR 20,000)."}
                        ]),
                        "retrieved_policies": json.dumps([
                            {"document_title": "Prevention of Money-Laundering Act, 2002", "citation": "PMLA Section 12", "section": "Section 12(1)(b)", "snippet": "Reporting entities shall report transactions where there is reason to believe that transactions have been deliberately structured below statutory limits to evade reporting."}
                        ])
                    }
                ]

                for sc in SEED_CASES:
                    conn.execute(text("""
                        INSERT INTO compliance_cases (
                            case_id, transaction_id, customer_name, beneficiary_name, 
                            amount, channel, historical_avg, risk_score, priority, 
                            sla_deadline, status, maker_status, findings, retrieved_policies
                        ) VALUES (
                            :case_id, :transaction_id, :customer_name, :beneficiary_name, 
                            :amount, :channel, :historical_avg, :risk_score, :priority, 
                            :sla_deadline, :status, CAST(:maker_status AS jsonb), CAST(:findings AS jsonb), CAST(:retrieved_policies AS jsonb)
                        );
                    """), sc)
    except Exception as e:
        print(f"[Case DB Warning] {e}")

init_case_management_db()

# 2. Authentication Routes
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
    return {"status": "AUTHENTICATED", "user": principal.dict()}

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("finsight_session")
    if token:
        revoke_session(token)
    response.delete_cookie("finsight_session")
    return {"status": "SUCCESS", "message": "Officer session terminated."}

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

# 3. Case Queue Management API (Persistent PostgreSQL Queries)
@router.get("/investigations/queue")
async def get_compliance_queue(request: Request, status_filter: Optional[str] = None):
    _ = get_current_user(request)
    query = "SELECT * FROM compliance_cases"
    params = {}
    if status_filter:
        query += " WHERE status = :st"
        params["st"] = status_filter
    query += " ORDER BY created_at DESC LIMIT 50;"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()

    result = []
    for r in rows:
        d = dict(r)
        d["amount"] = float(d["amount"])
        d["historical_avg"] = float(d["historical_avg"])
        d["risk_score"] = float(d["risk_score"])
        for json_field in ["findings", "retrieved_policies", "execution_trace", "maker_status", "checker_status"]:
            if isinstance(d.get(json_field), str):
                try:
                    d[json_field] = json.loads(d[json_field])
                except Exception:
                    pass
        d["transaction_data"] = {
            "transaction_id": d["transaction_id"],
            "customer_name": d["customer_name"],
            "beneficiary_name": d["beneficiary_name"],
            "amount": d["amount"],
            "channel": d["channel"],
            "historical_avg": d["historical_avg"]
        }
        result.append(d)
    return result

# 4. Stream Ingestion Simulation (Pulls random anomaly from 1M DB into MLRO Inbox)
@router.post("/investigations/queue/ingest-stream")
async def ingest_core_banking_stream(request: Request):
    _ = require_role(["MLRO_OFFICER", "ANALYST"])(request)
    
    # Seek a random anomaly transaction from the 1M database table
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT * FROM transactions 
            WHERE amount > 500000 
            ORDER BY RANDOM() 
            LIMIT 1;
        """)).mappings().first()

    if not row:
        txn = {
            "transaction_id": f"TXN-{random.randint(1000000, 9999999)}",
            "customer_name": "Alok Chandrashekhar",
            "beneficiary_name": "Seychelles Prime Shell Holdings",
            "amount": 2100000.0,
            "channel": "SWIFT",
            "historical_avg": 50000.0
        }
    else:
        txn = dict(row)

    case_id = f"CASE-{uuid.uuid4().hex[:6].upper()}"
    ratio = round(float(txn["amount"]) / max(float(txn["historical_avg"]), 1.0), 1)

    new_case = {
        "case_id": case_id,
        "transaction_id": txn["transaction_id"],
        "customer_name": txn["customer_name"],
        "beneficiary_name": txn["beneficiary_name"],
        "amount": float(txn["amount"]),
        "channel": txn["channel"],
        "historical_avg": float(txn["historical_avg"]),
        "risk_score": 1.00 if ratio > 15.0 else 0.85,
        "priority": "P1 - CRITICAL",
        "sla_deadline": f"{random.randint(15, 55)}m remaining",
        "status": "PENDING_CHECKER",
        "maker_status": json.dumps({
            "decision": "RECOMMEND_REJECT",
            "summary": f"Inbound core banking stream anomaly alert. {ratio}x turnover velocity spike sent to unverified offshore entity.",
            "officer": "Rohan Verma (AML-33012)",
            "username": "analyst.verma"
        }),
        "findings": json.dumps([
            {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": f"Core-banking high value alert: INR {float(txn['amount']):,.2f} routed via {txn['channel']}."},
            {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": f"Velocity multiplier calculated at {ratio}x above 30-day customer historical average."}
        ]),
        "retrieved_policies": json.dumps([
            {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI Section 41", "section": "Section 41", "snippet": "Mandatory Enhanced Due Diligence required for accounts showing disproportionate velocity spikes."}
        ])
    }

    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO compliance_cases (
                case_id, transaction_id, customer_name, beneficiary_name, 
                amount, channel, historical_avg, risk_score, priority, 
                sla_deadline, status, maker_status, findings, retrieved_policies
            ) VALUES (
                :case_id, :transaction_id, :customer_name, :beneficiary_name, 
                :amount, :channel, :historical_avg, :risk_score, :priority, 
                :sla_deadline, :status, CAST(:maker_status AS jsonb), CAST(:findings AS jsonb), CAST(:retrieved_policies AS jsonb)
            );
        """), new_case)

    log_security_event("STREAM_ANOMALY_INGESTED", details=f"New alert {case_id} ingested into MLRO queue.")
    return {"status": "SUCCESS", "case_id": case_id, "amount": txn["amount"]}

# 5. Maker & Checker Workflow Endpoints
def get_workflow(request: Request):
    if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
        return request.app.state.workflow
    from app.main import app_state
    if "workflow" in app_state and app_state["workflow"] is not None:
        return app_state["workflow"]
    raise HTTPException(status_code=500, detail="LangGraph engine not initialized.")

@router.post("/investigations/simulate")
async def simulate_investigation(payload: TransactionCreatePayload, request: Request):
    user = require_role(["ANALYST", "MLRO_OFFICER"])(request)
    workflow = get_workflow(request)
    registered = register_custom_transaction(payload)
    case_id = f"CASE-{uuid.uuid4().hex[:6].upper()}"
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

    case_record = {
        "case_id": case_id,
        "transaction_id": registered["transaction_id"],
        "customer_name": registered["customer_name"],
        "beneficiary_name": registered["beneficiary_name"],
        "amount": float(registered["amount"]),
        "channel": registered["channel"],
        "historical_avg": float(registered["historical_avg"]),
        "risk_score": float(output.get("cumulative_risk_score", 0.0)),
        "priority": "P1 - CRITICAL" if is_high_risk else "P3 - LOW",
        "sla_deadline": "45m remaining" if is_high_risk else "N/A",
        "status": "PENDING_MAKER" if is_high_risk else "FINALIZED",
        "final_verdict": "AUTO_APPROVED" if not is_high_risk else None,
        "findings": json.dumps(output.get("findings", [])),
        "retrieved_policies": json.dumps(output.get("retrieved_policies", [])),
        "execution_trace": json.dumps(output.get("execution_trace", []))
    }

    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO compliance_cases (
                case_id, transaction_id, customer_name, beneficiary_name, 
                amount, channel, historical_avg, risk_score, priority, 
                sla_deadline, status, final_verdict, findings, retrieved_policies, execution_trace
            ) VALUES (
                :case_id, :transaction_id, :customer_name, :beneficiary_name, 
                :amount, :channel, :historical_avg, :risk_score, :priority, 
                :sla_deadline, :status, :final_verdict, CAST(:findings AS jsonb), CAST(:retrieved_policies AS jsonb), CAST(:execution_trace AS jsonb)
            );
        """), case_record)

    return {
        **case_record,
        "findings": output.get("findings", []),
        "retrieved_policies": output.get("retrieved_policies", []),
        "execution_trace": output.get("execution_trace", []),
        "transaction_data": registered,
        "requires_maker_review": is_high_risk,
        "requires_checker_review": False
    }

@router.post("/investigations/{case_id}/maker-recommend")
async def maker_recommend(case_id: str, payload: MakerRecommendationPayload, request: Request):
    maker = require_role(["ANALYST", "MLRO_OFFICER"])(request)
    maker_data = {
        "decision": payload.recommendation,
        "summary": payload.findings_summary,
        "officer": f"{maker.full_name} ({maker.badge_id})",
        "username": maker.username
    }

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE compliance_cases SET
                status = 'PENDING_CHECKER',
                maker_status = CAST(:m AS jsonb),
                updated_at = CURRENT_TIMESTAMP
            WHERE case_id = :cid;
        """), {"m": json.dumps(maker_data), "cid": case_id})

    log_security_event("MAKER_RECOMMENDATION_FILED", username=maker.username, badge_id=maker.badge_id, details=f"Case {case_id} -> {payload.recommendation}")
    return {"status": "SUCCESS", "case_id": case_id, "maker_status": maker_data}

@router.post("/investigations/{case_id}/checker-execute")
async def checker_execute(case_id: str, payload: CheckerExecutionPayload, request: Request):
    checker = require_role(["MLRO_OFFICER"])(request)
    
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Case not found.")

    # Strict Four-Eyes Principle: The Maker cannot be the Checker
    m_status = row.get("maker_status")
    if m_status:
        if isinstance(m_status, str):
            try:
                m_status = json.loads(m_status)
            except Exception:
                m_status = {}
        if m_status.get("username") == checker.username:
            raise HTTPException(
                status_code=403,
                detail="Four-Eyes Violation: You cannot act as Checker on a case where you were the Maker."
            )

    checker_data = {
        "decision": payload.final_decision,
        "memo": payload.statutory_memo,
        "officer": f"{checker.full_name} ({checker.badge_id})",
        "username": checker.username,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    workflow = get_workflow(request)
    config = {"configurable": {"thread_id": case_id}}
    try:
        await workflow.ainvoke(
            Command(resume={"decision": payload.final_decision, "notes": payload.statutory_memo}),
            config=config
        )
    except Exception as e:
        print(f"[Workflow resume note] {e}")

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE compliance_cases SET
                status = 'FINALIZED',
                final_verdict = :verdict,
                checker_status = CAST(:chk AS jsonb),
                updated_at = CURRENT_TIMESTAMP
            WHERE case_id = :cid;
        """), {"verdict": payload.final_decision, "chk": json.dumps(checker_data), "cid": case_id})

    log_security_event("CHECKER_EXECUTION_FINALIZED", username=checker.username, badge_id=checker.badge_id, details=f"Case {case_id} finalized as {payload.final_decision}")
    return {"status": "SUCCESS", "case_id": case_id, "final_verdict": payload.final_decision, "checker_status": checker_data}

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
        "review_status": "FINALIZED",
        "final_verdict": res["final_verdict"],
        "execution_trace": [f"Adjudicated as {res['final_verdict']}"]
    }
