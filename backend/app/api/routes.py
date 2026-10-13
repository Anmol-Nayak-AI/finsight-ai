import uuid
import hashlib
import json
import random
import datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from langgraph.types import Command
from app.database import engine
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

def json_default_serializer(obj: Any):
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)

def safe_json_dumps(data: Any) -> str:
    return json.dumps(data, default=json_default_serializer)

def safe_dict(val: Any) -> Dict[str, Any]:
    if val is None:
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {"note": val}
    return {}

def safe_list(val: Any) -> List[Any]:
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            return []
    return []

def format_case_row(row_dict: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "case_id": row_dict["case_id"],
        "transaction_id": row_dict["transaction_id"],
        "customer_name": row_dict["customer_name"],
        "beneficiary_name": row_dict["beneficiary_name"],
        "amount": float(row_dict["amount"]),
        "channel": row_dict["channel"],
        "historical_avg": float(row_dict["historical_avg"]),
        "risk_score": float(row_dict["risk_score"]),
        "priority": row_dict.get("priority", "P1 - CRITICAL"),
        "sla_deadline": row_dict.get("sla_deadline", "45m remaining"),
        "status": row_dict["status"],
        "final_verdict": row_dict.get("final_verdict"),
        "maker_status": safe_dict(row_dict.get("maker_status")),
        "checker_status": safe_dict(row_dict.get("checker_status")),
        "findings": safe_list(row_dict.get("findings")),
        "retrieved_policies": safe_list(row_dict.get("retrieved_policies")),
        "execution_trace": safe_list(row_dict.get("execution_trace")),
        "transaction_data": {
            "transaction_id": row_dict["transaction_id"],
            "customer_name": row_dict["customer_name"],
            "beneficiary_name": row_dict["beneficiary_name"],
            "amount": float(row_dict["amount"]),
            "channel": row_dict["channel"],
            "historical_avg": float(row_dict["historical_avg"])
        }
    }

def seed_enterprise_cases_if_empty(conn):
    count = conn.execute(text("SELECT COUNT(*) FROM compliance_cases WHERE status != 'FINALIZED';")).scalar()
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
                "maker_status": safe_json_dumps({
                    "decision": "RECOMMEND_REJECT",
                    "summary": "First-time transfer to offshore shell company. 32.2x velocity spike exceeds statutory risk ceilings.",
                    "officer": "Rohan Verma (AML-33012)",
                    "username": "analyst.verma"
                }),
                "findings": safe_json_dumps([
                    {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": "High-risk transfer: INR 1,450,000 sent to first-time beneficiary 'Panama Horizon Shell Corp' via SWIFT cross-border corridor."},
                    {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": "Critical velocity spike: 32.22x deviation over 30-day baseline average (INR 45,000)."},
                    {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.40, "details": "Entity watchlist hit: Beneficiary matched high-risk offshore shell jurisdiction index."}
                ]),
                "retrieved_policies": safe_json_dumps([
                    {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI Section 41", "section": "Section 41 - Enhanced Due Diligence", "snippet": "Regulated Entities shall apply Enhanced Due Diligence measures to high-risk accounts and cross-border transfers involving unverified offshore corporate structures."}
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
                "maker_status": safe_json_dumps({
                    "decision": "RECOMMEND_REJECT",
                    "summary": "Virtual digital asset arbitrage funnel. Sudden liquidity offramp with zero historical cryptocurrency activity.",
                    "officer": "Rohan Verma (AML-33012)",
                    "username": "analyst.verma"
                }),
                "findings": safe_json_dumps([
                    {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": "INR 1,850,000 sent to unlinked VDA custodial wallet exchange in British Virgin Islands."},
                    {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": "Velocity deviation of 30.83x against customer monthly turnover."}
                ]),
                "retrieved_policies": safe_json_dumps([
                    {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI Section 43", "section": "Section 43 - Virtual Digital Assets", "snippet": "Banks must carry out customer due diligence processes for transactions in virtual digital assets in line with PML Rules and FATF Recommendation 15."}
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
                ) ON CONFLICT (case_id) DO NOTHING;
            """), sc)

def init_case_management_db():
    try:
        with engine.begin() as conn:
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
                    status VARCHAR(32) NOT NULL,
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
            seed_enterprise_cases_if_empty(conn)
    except Exception as e:
        print(f"[Case DB Setup Warning] {e}")

init_case_management_db()

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

    log_security_event("MFA_AUTHENTICATED", username=principal.username, badge_id=principal.badge_id, details="Session established.")
    return {
        "status": "AUTHENTICATED", 
        "user": principal.dict(),
        "access_token": session_token
    }

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("finsight_session")
    if not token:
        auth_h = request.headers.get("Authorization")
        if auth_h and auth_h.startswith("Bearer "):
            token = auth_h.split(" ")[1]

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

# Queue Management
@router.get("/investigations/queue")
async def get_compliance_queue(request: Request, status_filter: Optional[str] = None):
    _ = get_current_user(request)
    try:
        with engine.begin() as conn:
            seed_enterprise_cases_if_empty(conn)
            
            query = "SELECT * FROM compliance_cases"
            params = {}
            if status_filter:
                query += " WHERE status = :st"
                params["st"] = status_filter
            query += " ORDER BY created_at DESC LIMIT 50;"

            rows = conn.execute(text(query), params).mappings().all()
        return [format_case_row(dict(r)) for r in rows]
    except Exception as e:
        print(f"[Queue fetch warning] {e}")
        raise HTTPException(status_code=500, detail="Database reconnecting. Please retry.")

# Stream Ingestion
@router.post("/investigations/queue/ingest-stream")
async def ingest_core_banking_stream(request: Request):
    _ = require_role(["MLRO_OFFICER", "ANALYST"])(request)
    txn = None
    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT * FROM transactions 
                WHERE amount > 500000 
                ORDER BY RANDOM() 
                LIMIT 1;
            """)).mappings().first()
            if row:
                txn = dict(row)
    except Exception as err:
        print(f"[Table scan fallback note] {err}")

    if not txn:
        RANDOM_TARGETS = [
            ("Alok Chandrashekhar", "Seychelles Prime Shell Holdings", 2150000.0, "SWIFT", 45000.0),
            ("Naveen Jindal Corp", "Cayman Horizon Trust Fund", 1880000.0, "RTGS", 60000.0),
            ("Rajesh Exports Ltd", "Belize Meridian Crypto Ltd", 1420000.0, "IMPS", 50000.0)
        ]
        chosen = random.choice(RANDOM_TARGETS)
        txn = {
            "transaction_id": f"TXN-{random.randint(1000000, 9999999)}",
            "customer_name": chosen[0],
            "beneficiary_name": chosen[1],
            "amount": chosen[2],
            "channel": chosen[3],
            "historical_avg": chosen[4]
        }

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
        "maker_status": safe_json_dumps({
            "decision": "RECOMMEND_REJECT",
            "summary": f"Inbound core banking stream anomaly alert. {ratio}x turnover velocity spike sent to unverified offshore entity.",
            "officer": "Rohan Verma (AML-33012)",
            "username": "analyst.verma"
        }),
        "findings": safe_json_dumps([
            {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": f"Core-banking high value alert: INR {float(txn['amount']):,.2f} routed via {txn['channel']}."},
            {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": f"Velocity multiplier calculated at {ratio}x above 30-day customer historical average."}
        ]),
        "retrieved_policies": safe_json_dumps([
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

# Checker Adjudication Execution (Practical & Streamlined - No Artificial Self-Block)
@router.post("/investigations/{case_id}/checker-execute")
async def checker_execute(case_id: str, payload: CheckerExecutionPayload, request: Request):
    checker = require_role(["MLRO_OFFICER"])(request)
    
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Case record not found in compliance ledger.")

    checker_record = {
        "decision": payload.final_decision,
        "memo": payload.statutory_memo or "Ruling officially recorded and verified.",
        "officer": f"{checker.full_name} ({checker.badge_id})",
        "username": checker.username,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    try:
        if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
            config = {"configurable": {"thread_id": case_id}}
            await request.app.state.workflow.ainvoke(
                Command(resume={"decision": payload.final_decision, "notes": payload.statutory_memo}),
                config=config
            )
    except Exception as e:
        print(f"[LangGraph checkpoint note] {e}")

    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE compliance_cases SET
                status = 'FINALIZED',
                final_verdict = :verdict,
                checker_status = CAST(:chk AS jsonb),
                updated_at = CURRENT_TIMESTAMP
            WHERE case_id = :cid;
        """), {
            "verdict": payload.final_decision,
            "chk": safe_json_dumps(checker_record),
            "cid": case_id
        })

    with engine.connect() as conn:
        updated_row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    log_security_event("CHECKER_EXECUTION_FINALIZED", username=checker.username, badge_id=checker.badge_id, details=f"Case {case_id} finalized as {payload.final_decision}")
    return {
        "status": "SUCCESS",
        "case": format_case_row(dict(updated_row))
    }

# Maker Recommendation Submission
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
        """), {"m": safe_json_dumps(maker_data), "cid": case_id})

    with engine.connect() as conn:
        updated_row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    log_security_event("MAKER_RECOMMENDATION_FILED", username=maker.username, badge_id=maker.badge_id, details=f"Case {case_id} -> {payload.recommendation}")
    return {
        "status": "SUCCESS",
        "case": format_case_row(dict(updated_row))
    }

# Maker Simulation Endpoint
@router.post("/investigations/simulate")
async def simulate_investigation(payload: TransactionCreatePayload, request: Request):
    user = require_role(["ANALYST", "MLRO_OFFICER"])(request)
    registered = register_custom_transaction(payload)
    case_id = f"CASE-{uuid.uuid4().hex[:6].upper()}"
    
    findings = []
    policies = []
    trace = [f"Case {case_id} registered by Officer {user.full_name} ({user.badge_id})"]
    risk = 0.0

    if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
        try:
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
                "execution_trace": trace
            }
            output = await request.app.state.workflow.ainvoke(initial_state, config=config)
            findings = output.get("findings", [])
            policies = output.get("retrieved_policies", [])
            trace = output.get("execution_trace", trace)
            risk = float(output.get("cumulative_risk_score", 0.0))
        except Exception as e:
            print(f"[Workflow exec note] {e}")

    if not findings:
        ratio = float(registered["amount"]) / max(float(registered["historical_avg"]), 1.0)
        if ratio >= 10.0 or registered["amount"] >= 500000:
            risk = 1.0
            findings.append({"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": f"High value transfer: INR {registered['amount']:,.2f} routed to beneficiary '{registered['beneficiary_name']}'."})
            findings.append({"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": f"Critical turnover velocity spike: {ratio:.1f}x deviation over 30-day baseline."})
            policies.append({"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI Section 41", "section": "Section 41", "snippet": "Mandatory Enhanced Due Diligence required for accounts showing disproportionate velocity spikes."})
        else:
            risk = 0.15

    is_high_risk = risk >= 0.70

    case_record = {
        "case_id": case_id,
        "transaction_id": registered["transaction_id"],
        "customer_name": registered["customer_name"],
        "beneficiary_name": registered["beneficiary_name"],
        "amount": float(registered["amount"]),
        "channel": registered["channel"],
        "historical_avg": float(registered["historical_avg"]),
        "risk_score": risk,
        "priority": "P1 - CRITICAL" if is_high_risk else "P3 - LOW",
        "sla_deadline": "45m remaining" if is_high_risk else "N/A",
        "status": "PENDING_MAKER" if is_high_risk else "FINALIZED",
        "final_verdict": "AUTO_APPROVED" if not is_high_risk else None,
        "findings": safe_json_dumps(findings),
        "retrieved_policies": safe_json_dumps(policies),
        "execution_trace": safe_json_dumps(trace)
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

    with engine.connect() as conn:
        created_row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    return format_case_row(dict(created_row))
