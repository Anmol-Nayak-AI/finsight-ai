import uuid
import hashlib
import json
import random
import datetime
from typing import List, Dict, Any, Optional, Literal
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from langgraph.types import Command
from app.database import engine
from app.rag.seed_corpus import REGULATORY_CORPUS
from app.tools.compliance_tools import TransactionCreatePayload, register_custom_transaction
from app.auth.security import (
    create_mfa_challenge_token,
    consume_mfa_challenge,
    create_session_token,
    revoke_session,
    verify_totp_code,
    verify_password,
    get_totp_provisioning_uri,
    log_security_event,
    get_current_user,
    require_role,
    UserPrincipal,
    PRE_PROVISIONED_ROSTER,
    COOKIE_SECURE,
    DEMO_MODE,
)

router = APIRouter(prefix="/api/v1", tags=["Enterprise Compliance API"])

class Step1LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)

class VerifyMfaRequest(BaseModel):
    mfa_challenge_token: str = Field(min_length=20, max_length=2048)
    totp_code: str = Field(pattern=r"^\d{6}$")

class MakerRecommendationPayload(BaseModel):
    recommendation: Literal["RECOMMEND_REJECT", "RECOMMEND_ESCALATE", "RECOMMEND_APPROVE"]
    findings_summary: str = Field(min_length=12, max_length=2000)

    @field_validator("findings_summary")
    @classmethod
    def normalize_summary(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 12:
            raise ValueError("findings_summary must contain at least 12 non-whitespace characters")
        return normalized

class CheckerExecutionPayload(BaseModel):
    final_decision: Literal[
        "REJECTED", "ESCALATED", "APPROVED",
        "CONFIRMED_REJECTED", "CONFIRMED_ESCALATED", "CONFIRMED_APPROVED",
        "OVERRIDDEN_REJECTED", "OVERRIDDEN_ESCALATED", "OVERRIDDEN_APPROVED",
    ]
    statutory_memo: str = Field(min_length=12, max_length=2000)

    @field_validator("statutory_memo")
    @classmethod
    def normalize_memo(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 12:
            raise ValueError("statutory_memo must contain at least 12 non-whitespace characters")
        return normalized

class RegulatorDispositionPayload(BaseModel):
    disposition: Literal["NO_FURTHER_ACTION", "CONTINUE_MONITORING", "ENFORCEMENT_REFERRED"]
    regulator_reference: str = Field(min_length=6, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
    rationale: str = Field(min_length=12, max_length=2000)

    @field_validator("regulator_reference")
    @classmethod
    def normalize_regulator_reference(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized.upper()

    @field_validator("rationale")
    @classmethod
    def normalize_regulator_rationale(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 12:
            raise ValueError("rationale must contain at least 12 non-whitespace characters")
        return normalized

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
        "customer_id": row_dict.get("customer_id"),
        "created_by_username": row_dict.get("created_by_username"),
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
        "fiu_docket_id": row_dict.get("fiu_docket_id"),
        "duplicate_of_case_id": row_dict.get("duplicate_of_case_id"),
        "maker_status": safe_dict(row_dict.get("maker_status")),
        "checker_status": safe_dict(row_dict.get("checker_status")),
        "regulator_status": safe_dict(row_dict.get("regulator_status")),
        "regulator_reference": row_dict.get("regulator_reference"),
        "findings": safe_list(row_dict.get("findings")),
        "retrieved_policies": safe_list(row_dict.get("retrieved_policies")),
        "execution_trace": safe_list(row_dict.get("execution_trace")),
        "decision_version": int(row_dict.get("decision_version") or 0),
        "created_at": row_dict.get("created_at").isoformat() if row_dict.get("created_at") else None,
        "updated_at": row_dict.get("updated_at").isoformat() if row_dict.get("updated_at") else None,
        "transaction_data": {
            "transaction_id": row_dict["transaction_id"],
            "customer_name": row_dict["customer_name"],
            "beneficiary_name": row_dict["beneficiary_name"],
            "amount": float(row_dict["amount"]),
            "channel": row_dict["channel"],
            "historical_avg": float(row_dict["historical_avg"])
        }
    }

def format_account_holder_row(row_dict: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "customer_id": row_dict["customer_id"],
        "customer_name": row_dict["customer_name"],
        "historical_avg": float(row_dict["historical_avg"]),
        "latest_transaction_at": (
            row_dict.get("latest_transaction_at").isoformat()
            if row_dict.get("latest_transaction_at")
            else None
        ),
    }

def seed_enterprise_cases_if_empty(conn):
    if not DEMO_MODE:
        return
    count = conn.execute(text("""
        SELECT COUNT(*) FROM compliance_cases
        WHERE status <> 'DUPLICATE_SUPERSEDED';
    """)).scalar()
    if count == 0:
        SEED_CASES = [
            {
                "case_id": "CASE-99214A",
                "transaction_id": "TXN-1049281",
                "customer_id": "CUST-10492",
                "created_by_username": "analyst.verma",
                "customer_name": "Aarav Malhotra",
                "beneficiary_name": "Panama Horizon Shell Corp",
                "amount": 1450000.00,
                "channel": "SWIFT",
                "historical_avg": 45000.00,
                "risk_score": 1.00,
                "priority": "P1 - CRITICAL",
                "sla_deadline": "28m remaining",
                "status": "PENDING_CHECKER",
                "fiu_docket_id": None,
                "maker_status": json.dumps({
                    "decision": "RECOMMEND_REJECT",
                    "summary": "First-time transfer to offshore shell company. 32.2x velocity spike exceeds statutory risk ceilings.",
                    "officer": "Rohan Verma (AML-33012)",
                    "username": "analyst.verma"
                }),
                "findings": json.dumps([
                    {"agent": "TransactionInvestigator", "risk_level": "HIGH", "score_delta": 0.45, "details": "High-risk transfer: INR 1,450,000 sent to first-time beneficiary 'Panama Horizon Shell Corp' via SWIFT cross-border corridor."},
                    {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": "Critical velocity spike: 32.22x deviation over 30-day baseline average (INR 45,000)."},
                    {"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.40, "details": "Entity watchlist hit: Beneficiary matched high-risk offshore shell jurisdiction index."}
                ]),
                "retrieved_policies": json.dumps([
                    {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI Section 41", "section": "Section 41 - Enhanced Due Diligence", "snippet": "Regulated Entities shall apply Enhanced Due Diligence measures to high-risk accounts and cross-border transfers involving unverified offshore corporate structures."}
                ])
            },
            {
                "case_id": "CASE-88310B",
                "transaction_id": "TXN-1082914",
                "customer_id": "CUST-44021",
                "created_by_username": "analyst.verma",
                "customer_name": "Vikram Singhania",
                "beneficiary_name": "KoinX BVI Crypto Exchange",
                "amount": 1850000.00,
                "channel": "RTGS",
                "historical_avg": 60000.00,
                "risk_score": 1.00,
                "priority": "P1 - CRITICAL",
                "sla_deadline": "1h 12m remaining",
                "status": "PENDING_CHECKER",
                "fiu_docket_id": None,
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
                    {"document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016", "citation": "RBI Section 43", "section": "Section 43 - Virtual Digital Assets", "snippet": "Banks must carry out customer due diligence processes for transactions in virtual digital assets in line with PML Rules and FATF Recommendation 15."}
                ])
            }
        ]
        for sc in SEED_CASES:
            conn.execute(text("""
                INSERT INTO compliance_cases (
                    case_id, transaction_id, customer_id, created_by_username, customer_name, beneficiary_name,
                    amount, channel, historical_avg, risk_score, priority, 
                    sla_deadline, status, fiu_docket_id, maker_status, findings, retrieved_policies
                ) VALUES (
                    :case_id, :transaction_id, :customer_id, :created_by_username, :customer_name, :beneficiary_name,
                    :amount, :channel, :historical_avg, :risk_score, :priority, 
                    :sla_deadline, :status, :fiu_docket_id, CAST(:maker_status AS jsonb), CAST(:findings AS jsonb), CAST(:retrieved_policies AS jsonb)
                ) ON CONFLICT (case_id) DO NOTHING;
            """), sc)

def init_case_management_db():
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('finsight_case_schema_v3'));"))
            conn.execute(text("""
                CREATE EXTENSION IF NOT EXISTS vector;

                DO $$
                BEGIN
                    IF to_regclass('public.transactions') IS NULL THEN
                        CREATE TABLE transactions (
                            transaction_id VARCHAR(64) NOT NULL,
                            customer_id VARCHAR(64) NOT NULL,
                            customer_name VARCHAR(255) NOT NULL,
                            amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
                            currency VARCHAR(8) NOT NULL,
                            channel VARCHAR(32) NOT NULL,
                            beneficiary_id VARCHAR(64) NOT NULL,
                            beneficiary_name VARCHAR(255) NOT NULL,
                            beneficiary_is_new BOOLEAN NOT NULL DEFAULT TRUE,
                            narration VARCHAR(500) NOT NULL,
                            historical_avg NUMERIC(15, 2) NOT NULL CHECK (historical_avg > 0),
                            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            PRIMARY KEY (transaction_id, created_at)
                        ) PARTITION BY RANGE (created_at);
                        CREATE TABLE transactions_default PARTITION OF transactions DEFAULT;
                    END IF;
                END $$;

                CREATE INDEX IF NOT EXISTS idx_transactions_customer_created
                    ON transactions(customer_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_transactions_amount
                    ON transactions(amount);

                CREATE TABLE IF NOT EXISTS account_holders (
                    customer_id VARCHAR(64) PRIMARY KEY,
                    customer_name VARCHAR(255) NOT NULL,
                    historical_avg NUMERIC(15, 2) NOT NULL CHECK (historical_avg > 0),
                    latest_transaction_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_account_holders_name_lower
                    ON account_holders(LOWER(customer_name));

                INSERT INTO account_holders (
                    customer_id, customer_name, historical_avg, latest_transaction_at
                )
                SELECT
                    latest.customer_id,
                    latest.customer_name,
                    latest.historical_avg,
                    latest.created_at
                FROM (
                    SELECT DISTINCT ON (customer_id)
                        customer_id, customer_name, historical_avg, created_at
                    FROM transactions
                    WHERE customer_id IS NOT NULL
                      AND BTRIM(customer_id) <> ''
                      AND customer_name IS NOT NULL
                      AND BTRIM(customer_name) <> ''
                    ORDER BY customer_id, created_at DESC
                ) AS latest
                WHERE NOT EXISTS (SELECT 1 FROM account_holders LIMIT 1)
                ON CONFLICT (customer_id) DO NOTHING;

                CREATE TABLE IF NOT EXISTS regulatory_chunks (
                    id SERIAL PRIMARY KEY,
                    document_title VARCHAR(255) NOT NULL,
                    regulator VARCHAR(64) NOT NULL,
                    circular_ref VARCHAR(128) NOT NULL,
                    section VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector(1536)
                );
                ALTER TABLE regulatory_chunks ALTER COLUMN embedding DROP NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_regulatory_citation
                    ON regulatory_chunks(circular_ref, section);
                CREATE INDEX IF NOT EXISTS idx_regulatory_document_title
                    ON regulatory_chunks(document_title);
                CREATE INDEX IF NOT EXISTS ix_regulatory_chunks_embedding_hnsw
                    ON regulatory_chunks USING hnsw (embedding vector_cosine_ops)
                    WITH (m = 16, ef_construction = 64);
            """))
            for document in REGULATORY_CORPUS:
                conn.execute(text("""
                    INSERT INTO regulatory_chunks (
                        document_title, regulator, circular_ref, section, content
                    ) VALUES (
                        :document_title, :regulator, :circular_ref, :section, :content
                    )
                    ON CONFLICT (circular_ref, section) DO UPDATE SET
                        document_title = EXCLUDED.document_title,
                        regulator = EXCLUDED.regulator,
                        content = EXCLUDED.content;
                """), document)

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS compliance_cases (
                    case_id VARCHAR(64) PRIMARY KEY,
                    transaction_id VARCHAR(64) NOT NULL,
                    customer_id VARCHAR(64),
                    created_by_username VARCHAR(128),
                    customer_name VARCHAR(255) NOT NULL,
                    beneficiary_name VARCHAR(255) NOT NULL,
                    amount NUMERIC(15, 2) NOT NULL,
                    channel VARCHAR(32) NOT NULL,
                    historical_avg NUMERIC(15, 2) NOT NULL,
                    risk_score NUMERIC(5, 2) NOT NULL,
                    priority VARCHAR(16) DEFAULT 'P1 - CRITICAL',
                    sla_deadline VARCHAR(64) DEFAULT '45m remaining',
                    status VARCHAR(32) NOT NULL,
                    fiu_docket_id VARCHAR(64),
                    duplicate_of_case_id VARCHAR(64),
                    maker_status JSONB,
                    checker_status JSONB,
                    regulator_status JSONB,
                    regulator_reference VARCHAR(128),
                    final_verdict VARCHAR(64),
                    findings JSONB DEFAULT '[]'::jsonb,
                    retrieved_policies JSONB DEFAULT '[]'::jsonb,
                    execution_trace JSONB DEFAULT '[]'::jsonb,
                    decision_version INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_cases_status ON compliance_cases(status);
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS fiu_docket_id VARCHAR(64);
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS duplicate_of_case_id VARCHAR(64);
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS created_by_username VARCHAR(128);
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS decision_version INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS regulator_status JSONB;
                ALTER TABLE compliance_cases ADD COLUMN IF NOT EXISTS regulator_reference VARCHAR(128);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_fiu_docket ON compliance_cases(fiu_docket_id) WHERE fiu_docket_id IS NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_regulator_reference ON compliance_cases(regulator_reference) WHERE regulator_reference IS NOT NULL;
            """))
            # Preserve legacy duplicate records for audit, but retire every
            # non-canonical case before installing the idempotency constraint.
            # A sealed decision wins; otherwise the furthest/oldest workflow
            # record is retained as the canonical case for the transaction.
            conn.execute(text("""
                WITH latest_transactions AS (
                    SELECT DISTINCT ON (transaction_id) transaction_id, customer_id
                    FROM transactions
                    WHERE customer_id IS NOT NULL AND BTRIM(customer_id) <> ''
                    ORDER BY transaction_id, created_at DESC
                )
                UPDATE compliance_cases AS cases SET
                    customer_id = COALESCE(
                        NULLIF(BTRIM(cases.customer_id), ''),
                        latest_transactions.customer_id,
                        'LEGACY-' || UPPER(SUBSTRING(MD5(LOWER(BTRIM(cases.customer_name))), 1, 12))
                    )
                FROM latest_transactions
                WHERE cases.transaction_id = latest_transactions.transaction_id
                  AND (cases.customer_id IS NULL OR BTRIM(cases.customer_id) = '');

                UPDATE compliance_cases SET
                    customer_id = 'LEGACY-' || UPPER(SUBSTRING(MD5(LOWER(BTRIM(customer_name))), 1, 12))
                WHERE customer_id IS NULL OR BTRIM(customer_id) = '';

                UPDATE compliance_cases SET
                    created_by_username = COALESCE(
                        NULLIF(BTRIM(created_by_username), ''),
                        maker_status->>'username',
                        CASE WHEN status = 'PENDING_MAKER' THEN 'analyst.verma' ELSE 'system.legacy' END
                    )
                WHERE created_by_username IS NULL OR BTRIM(created_by_username) = '';

                WITH ranked AS (
                    SELECT
                        case_id,
                        FIRST_VALUE(case_id) OVER (
                            PARTITION BY transaction_id
                            ORDER BY
                                CASE status
                                    WHEN 'REGULATOR_ENFORCEMENT' THEN 5
                                    WHEN 'REGULATOR_MONITORING' THEN 5
                                    WHEN 'REGULATOR_CLEARED' THEN 5
                                    WHEN 'ESCALATED_FIU' THEN 4
                                    WHEN 'FINALIZED' THEN 4
                                    WHEN 'PENDING_CHECKER' THEN 3
                                    WHEN 'PENDING_MAKER' THEN 2
                                    ELSE 1
                                END DESC,
                                created_at ASC,
                                case_id ASC
                        ) AS canonical_case_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY transaction_id
                            ORDER BY
                                CASE status
                                    WHEN 'REGULATOR_ENFORCEMENT' THEN 5
                                    WHEN 'REGULATOR_MONITORING' THEN 5
                                    WHEN 'REGULATOR_CLEARED' THEN 5
                                    WHEN 'ESCALATED_FIU' THEN 4
                                    WHEN 'FINALIZED' THEN 4
                                    WHEN 'PENDING_CHECKER' THEN 3
                                    WHEN 'PENDING_MAKER' THEN 2
                                    ELSE 1
                                END DESC,
                                created_at ASC,
                                case_id ASC
                        ) AS rank_no
                    FROM compliance_cases
                    WHERE status <> 'DUPLICATE_SUPERSEDED'
                )
                UPDATE compliance_cases AS cases SET
                    status = 'DUPLICATE_SUPERSEDED',
                    duplicate_of_case_id = ranked.canonical_case_id,
                    final_verdict = COALESCE(cases.final_verdict, 'SUPERSEDED_DUPLICATE'),
                    execution_trace = COALESCE(cases.execution_trace, '[]'::jsonb) ||
                        jsonb_build_array(jsonb_build_object(
                            'event', 'DUPLICATE_CASE_SUPERSEDED',
                            'canonical_case_id', ranked.canonical_case_id,
                            'timestamp', CURRENT_TIMESTAMP
                        )),
                    updated_at = CURRENT_TIMESTAMP
                FROM ranked
                WHERE cases.case_id = ranked.case_id AND ranked.rank_no > 1;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_one_canonical_transaction
                    ON compliance_cases(transaction_id)
                    WHERE status <> 'DUPLICATE_SUPERSEDED';

                WITH pending_accounts AS (
                    SELECT
                        case_id,
                        FIRST_VALUE(case_id) OVER (
                            PARTITION BY customer_id
                            ORDER BY
                                CASE status WHEN 'ESCALATED_FIU' THEN 3 WHEN 'PENDING_CHECKER' THEN 2 ELSE 1 END DESC,
                                created_at ASC,
                                case_id ASC
                        ) AS canonical_case_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY customer_id
                            ORDER BY
                                CASE status WHEN 'ESCALATED_FIU' THEN 3 WHEN 'PENDING_CHECKER' THEN 2 ELSE 1 END DESC,
                                created_at ASC,
                                case_id ASC
                        ) AS rank_no
                    FROM compliance_cases
                    WHERE status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU')
                )
                UPDATE compliance_cases AS cases SET
                    status = 'DUPLICATE_SUPERSEDED',
                    duplicate_of_case_id = pending_accounts.canonical_case_id,
                    final_verdict = COALESCE(cases.final_verdict, 'SUPERSEDED_DUPLICATE'),
                    execution_trace = COALESCE(cases.execution_trace, '[]'::jsonb) ||
                        jsonb_build_array(jsonb_build_object(
                            'event', 'DUPLICATE_PENDING_ACCOUNT_SUPERSEDED',
                            'canonical_case_id', pending_accounts.canonical_case_id,
                            'timestamp', CURRENT_TIMESTAMP
                        )),
                    updated_at = CURRENT_TIMESTAMP
                FROM pending_accounts
                WHERE cases.case_id = pending_accounts.case_id
                  AND pending_accounts.rank_no > 1;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_one_active_review_per_customer
                    ON compliance_cases(customer_id)
                    WHERE status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU');
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

    if not verify_password(req.password, user_record["username"], user_record["password_hash"]):
        log_security_event("LOGIN_FAILED", username=req.username, details="Password mismatch.")
        raise HTTPException(status_code=401, detail="Invalid institutional credentials.")

    challenge_token = create_mfa_challenge_token(user_record["username"])
    otpauth_uri = get_totp_provisioning_uri(user_record["username"], user_record["totp_seed"])

    log_security_event("MFA_CHALLENGE_ISSUED", username=user_record["username"], badge_id=user_record["badge_id"])
    response_payload = {
        "status": "MFA_REQUIRED",
        "mfa_challenge_token": challenge_token,
        "officer_name": user_record["full_name"],
        "badge_id": user_record["badge_id"],
        "role": user_record["role"],
    }
    # Test-persona pairing is intentionally local/demo-only. Production never
    # returns MFA secrets from the password-verification endpoint.
    if DEMO_MODE:
        response_payload.update({"totp_seed": user_record["totp_seed"], "otpauth_uri": otpauth_uri})
    return response_payload

@router.post("/auth/verify-mfa")
async def verify_mfa(req: VerifyMfaRequest, response: Response):
    import jwt
    from app.auth.security import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(req.mfa_challenge_token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if payload.get("stage") != "MFA_PENDING" or not payload.get("jti"):
            raise ValueError("Not an MFA challenge token")
    except Exception:
        raise HTTPException(status_code=401, detail="MFA challenge expired. Please re-authenticate.")

    user_record = PRE_PROVISIONED_ROSTER.get(username)
    if not user_record or not verify_totp_code(user_record["totp_seed"], req.totp_code):
        log_security_event("MFA_FAILED", username=username, details="Invalid 6-digit authenticator code.")
        raise HTTPException(status_code=401, detail="Invalid 6-Digit Code. Check your Authenticator app.")

    expires_at = datetime.datetime.fromtimestamp(payload["exp"], tz=datetime.timezone.utc)
    if not consume_mfa_challenge(payload["jti"], expires_at):
        log_security_event("MFA_REPLAY_BLOCKED", username=username, details="Previously consumed challenge token was reused.")
        raise HTTPException(status_code=401, detail="MFA challenge already used. Please sign in again.")

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
        secure=COOKIE_SECURE,
        max_age=8 * 3600
    )

    log_security_event("MFA_AUTHENTICATED", username=principal.username, badge_id=principal.badge_id, details="Session established.")
    return {
        "status": "AUTHENTICATED", 
        "user": principal.model_dump(),
        "access_token": session_token
    }

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    auth_h = request.headers.get("Authorization")
    token = auth_h.split(" ", 1)[1] if auth_h and auth_h.startswith("Bearer ") else request.cookies.get("finsight_session")

    if token:
        revoke_session(token)
    response.delete_cookie("finsight_session")
    return {"status": "SUCCESS", "message": "Officer session terminated."}

@router.get("/auth/me")
async def get_authenticated_officer(request: Request):
    return get_current_user(request).model_dump()

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
    _ = require_role(["MLRO_OFFICER"])(request)
    try:
        with engine.begin() as conn:
            seed_enterprise_cases_if_empty(conn)
            
            query = "SELECT * FROM compliance_cases"
            params = {}
            if status_filter:
                query += " WHERE status = :st"
                params["st"] = status_filter
            else:
                query += " WHERE status <> 'DUPLICATE_SUPERSEDED'"
            query += " ORDER BY created_at DESC LIMIT 50;"

            rows = conn.execute(text(query), params).mappings().all()
        return [format_case_row(dict(r)) for r in rows]
    except Exception as e:
        print(f"[Queue fetch warning] {e}")
        raise HTTPException(status_code=500, detail="Database reconnecting. Please retry.")

@router.get("/regulatory/queue")
async def get_regulatory_queue(request: Request):
    """Return only cases over which the external authority has jurisdiction."""
    _ = require_role(["REGULATOR_OFFICER"])(request)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT * FROM compliance_cases
            WHERE status IN (
                'ESCALATED_FIU', 'REGULATOR_CLEARED',
                'REGULATOR_MONITORING', 'REGULATOR_ENFORCEMENT'
            )
            ORDER BY
                CASE WHEN status = 'ESCALATED_FIU' THEN 0 ELSE 1 END,
                updated_at DESC
            LIMIT 50;
        """)).mappings().all()
    return [format_case_row(dict(row)) for row in rows]

# Stream Ingestion
@router.post("/investigations/queue/ingest-stream")
async def ingest_core_banking_stream(request: Request):
    _ = require_role(["MLRO_OFFICER"])(request)
    txn = None
    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT DISTINCT ON (transactions.transaction_id) transactions.*
                FROM transactions
                WHERE amount > 500000
                  AND NOT EXISTS (
                      SELECT 1 FROM compliance_cases
                      WHERE compliance_cases.transaction_id = transactions.transaction_id
                        AND compliance_cases.status <> 'DUPLICATE_SUPERSEDED'
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM compliance_cases
                      WHERE compliance_cases.customer_id = transactions.customer_id
                        AND compliance_cases.status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU')
                  )
                ORDER BY transactions.transaction_id, transactions.created_at DESC
                LIMIT 1;
            """)).mappings().first()
            if row:
                txn = dict(row)
    except Exception as err:
        print(f"[Table scan fallback note] {err}")

    if not txn and not DEMO_MODE:
        raise HTTPException(status_code=404, detail="No eligible unassigned high-risk transactions are available for ingestion.")

    if not txn:
        RANDOM_TARGETS = [
            ("CUST-81104", "Alok Chandrashekhar", "Seychelles Prime Shell Holdings", 2150000.0, "SWIFT", 45000.0),
            ("CUST-81105", "Naveen Jindal Corp", "Cayman Horizon Trust Fund", 1880000.0, "RTGS", 60000.0),
            ("CUST-81106", "Rajesh Exports Ltd", "Belize Meridian Crypto Ltd", 1420000.0, "IMPS", 50000.0)
        ]
        chosen = random.choice(RANDOM_TARGETS)
        txn = {
            "transaction_id": f"TXN-{random.randint(1000000, 9999999)}",
            "customer_id": chosen[0],
            "customer_name": chosen[1],
            "beneficiary_name": chosen[2],
            "amount": chosen[3],
            "channel": chosen[4],
            "historical_avg": chosen[5]
        }

    case_id = f"CASE-{uuid.uuid4().hex[:6].upper()}"
    ratio = round(float(txn["amount"]) / max(float(txn["historical_avg"]), 1.0), 1)

    new_case = {
        "case_id": case_id,
        "transaction_id": txn["transaction_id"],
        "customer_id": txn.get("customer_id") or f"LEGACY-{hashlib.md5(str(txn['customer_name']).strip().lower().encode()).hexdigest()[:12].upper()}",
        "created_by_username": "system.streaming",
        "customer_name": txn["customer_name"],
        "beneficiary_name": txn["beneficiary_name"],
        "amount": float(txn["amount"]),
        "channel": txn["channel"],
        "historical_avg": float(txn["historical_avg"]),
        "risk_score": 1.00 if ratio > 15.0 else 0.85,
        "priority": "P1 - CRITICAL",
        "sla_deadline": f"{random.randint(15, 55)}m remaining",
        "status": "PENDING_CHECKER",
        "fiu_docket_id": None,
        "maker_status": json.dumps({
            "decision": "RECOMMEND_REJECT",
            "summary": f"Inbound core banking stream anomaly alert. {ratio}x turnover velocity spike sent to unverified offshore entity.",
            "officer": "Automated Transaction Monitoring",
            "username": "system.streaming"
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
        inserted_case_id = conn.execute(text("""
            INSERT INTO compliance_cases (
                case_id, transaction_id, customer_id, created_by_username, customer_name, beneficiary_name,
                amount, channel, historical_avg, risk_score, priority, 
                sla_deadline, status, fiu_docket_id, maker_status, findings, retrieved_policies
            ) VALUES (
                :case_id, :transaction_id, :customer_id, :created_by_username, :customer_name, :beneficiary_name,
                :amount, :channel, :historical_avg, :risk_score, :priority, 
                :sla_deadline, :status, :fiu_docket_id, CAST(:maker_status AS jsonb), CAST(:findings AS jsonb), CAST(:retrieved_policies AS jsonb)
            )
            ON CONFLICT DO NOTHING
            RETURNING case_id;
        """), new_case).scalar()

        if not inserted_case_id:
            inserted_case_id = conn.execute(text("""
                SELECT case_id FROM compliance_cases
                WHERE (
                        (transaction_id = :transaction_id
                         AND status <> 'DUPLICATE_SUPERSEDED')
                        OR
                        (customer_id = :customer_id
                         AND status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU'))
                      )
                LIMIT 1;
            """), {
                "transaction_id": txn["transaction_id"],
                "customer_id": new_case["customer_id"],
            }).scalar()

    was_deduplicated = inserted_case_id != case_id
    log_security_event(
        "STREAM_ANOMALY_DEDUPLICATED" if was_deduplicated else "STREAM_ANOMALY_INGESTED",
        details=(
            f"Duplicate transaction {txn['transaction_id']} mapped to existing case {inserted_case_id}."
            if was_deduplicated
            else f"New alert {case_id} ingested into MLRO queue."
        )
    )
    return {
        "status": "SUCCESS",
        "case_id": inserted_case_id,
        "amount": txn["amount"],
        "deduplicated": was_deduplicated,
    }

# Checker Adjudication Execution with Formal Statutory Escalation
@router.post("/investigations/{case_id}/checker-execute")
async def checker_execute(case_id: str, payload: CheckerExecutionPayload, request: Request):
    checker = require_role(["MLRO_OFFICER"])(request)

    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Case record not found in compliance ledger.")
    if row["status"] != "PENDING_CHECKER":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Case is already {row['status']}. Binding decisions are immutable and cannot be submitted twice."
        )

    maker_status = safe_dict(row.get("maker_status"))
    if maker_status.get("username") == checker.username:
        log_security_event(
            "SEGREGATION_OF_DUTIES_BLOCK",
            username=checker.username,
            badge_id=checker.badge_id,
            details=f"Officer attempted to adjudicate their own case {case_id}."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Four-Eyes control: the officer who submitted this case cannot issue its binding ruling."
        )

    checker_action_map = {
        "REJECTED": "REJECTED",
        "ESCALATED": "ESCALATED",
        "APPROVED": "APPROVED",
        "CONFIRMED_REJECTED": "REJECTED",
        "CONFIRMED_ESCALATED": "ESCALATED",
        "CONFIRMED_APPROVED": "APPROVED",
        "OVERRIDDEN_REJECTED": "REJECTED",
        "OVERRIDDEN_ESCALATED": "ESCALATED",
        "OVERRIDDEN_APPROVED": "APPROVED",
    }
    maker_action_map = {
        "RECOMMEND_REJECT": "REJECTED",
        "RECOMMEND_ESCALATE": "ESCALATED",
        "RECOMMEND_APPROVE": "APPROVED",
    }
    checker_action = checker_action_map[payload.final_decision]
    maker_action = maker_action_map.get(maker_status.get("decision"))
    is_override = maker_action is not None and checker_action != maker_action
    decision_alignment = "OVERRIDDEN_MAKER" if is_override else "CONFIRMED_MAKER"

    is_escalation = checker_action == "ESCALATED"
    docket_year = datetime.datetime.now(datetime.timezone.utc).year
    fiu_docket = f"FIU-IND-STR-{docket_year}-{uuid.uuid4().hex[:6].upper()}" if is_escalation else None
    new_status = "ESCALATED_FIU" if is_escalation else "FINALIZED"
    final_verdict = (
        "STATUTORY_ESCALATION_FIU_IND"
        if is_escalation
        else f"{'OVERRIDDEN' if is_override else 'CONFIRMED'}_{checker_action}"
    )

    checker_record = {
        "decision": final_verdict,
        "submitted_action": checker_action,
        "maker_recommendation": maker_status.get("decision"),
        "decision_alignment": decision_alignment,
        "memo": payload.statutory_memo,
        "officer": f"{checker.full_name} ({checker.badge_id})",
        "username": checker.username,
        "fiu_docket_id": fiu_docket,
        "escalation_authority": "Financial Intelligence Unit - India (FIU-IND)" if is_escalation else "Internal Core Ledger",
        "external_review_status": "PENDING_REGULATOR" if is_escalation else None,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    transition_trace = json.dumps([{
        "event": "EXTERNAL_ESCALATION_DISPATCHED" if is_escalation else "CHECKER_RULING_SEALED",
        "actor": checker.username,
        "decision": final_verdict,
        "timestamp": checker_record["timestamp"]
    }])
    with engine.begin() as conn:
        updated_row = conn.execute(text("""
            UPDATE compliance_cases SET
                status = :status,
                final_verdict = :verdict,
                fiu_docket_id = :fiu,
                checker_status = CAST(:chk AS jsonb),
                execution_trace = COALESCE(execution_trace, '[]'::jsonb) || CAST(:trace AS jsonb),
                decision_version = decision_version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE case_id = :cid AND status = 'PENDING_CHECKER'
            RETURNING *;
        """), {
            "status": new_status,
            "verdict": final_verdict,
            "fiu": fiu_docket,
            "chk": json.dumps(checker_record),
            "trace": transition_trace,
            "cid": case_id
        }).mappings().first()

    # This compare-and-set is the authoritative duplicate-submit guard. A second
    # concurrent request can never transition the same pending case.
    if not updated_row:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another officer has already completed this case. Refresh the queue to view the sealed ruling."
        )

    # Resume the in-memory reasoning trace only after the durable transition.
    # A checkpoint issue must never roll back or duplicate the statutory ruling.
    try:
        if hasattr(request.app.state, "workflow") and request.app.state.workflow is not None:
            config = {"configurable": {"thread_id": case_id}}
            await request.app.state.workflow.ainvoke(
                Command(resume={"decision": final_verdict, "notes": checker_record["memo"]}),
                config=config
            )
    except Exception as e:
        print(f"[LangGraph checkpoint note] {e}")

    log_security_event(
        "STATUTORY_ESCALATION_FILED" if is_escalation else "CHECKER_EXECUTION_FINALIZED", 
        username=checker.username, 
        badge_id=checker.badge_id, 
        details=f"Case {case_id} -> {final_verdict} (Docket: {fiu_docket})"
    )
    return {
        "status": "SUCCESS",
        "case": format_case_row(dict(updated_row))
    }

@router.post("/regulatory/cases/{case_id}/disposition")
async def record_regulator_disposition(
    case_id: str,
    payload: RegulatorDispositionPayload,
    request: Request,
):
    """Seal the one-time external outcome for an FIU-escalated case.

    The status compare-and-set is the concurrency and replay boundary: only an
    ESCALATED_FIU row can be transitioned, and every successful outcome is
    terminal and immutable through this API.
    """
    regulator = require_role(["REGULATOR_OFFICER"])(request)
    outcome_map = {
        "NO_FURTHER_ACTION": ("REGULATOR_CLEARED", "FIU_NO_FURTHER_ACTION"),
        "CONTINUE_MONITORING": ("REGULATOR_MONITORING", "FIU_CONTINUE_MONITORING"),
        "ENFORCEMENT_REFERRED": ("REGULATOR_ENFORCEMENT", "FIU_ENFORCEMENT_REFERRED"),
    }
    new_status, final_verdict = outcome_map[payload.disposition]
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    regulator_record = {
        "disposition": payload.disposition,
        "outcome": final_verdict,
        "reference": payload.regulator_reference,
        "rationale": payload.rationale,
        "authority": "Financial Intelligence Unit - India (FIU-IND)",
        "officer": f"{regulator.full_name} ({regulator.badge_id})",
        "username": regulator.username,
        "external_review_status": "CLOSED_BY_REGULATOR",
        "timestamp": timestamp,
    }
    transition_trace = json.dumps([{
        "event": "REGULATOR_DISPOSITION_RECORDED",
        "actor": regulator.username,
        "decision": final_verdict,
        "reference": payload.regulator_reference,
        "timestamp": timestamp,
    }])

    try:
        with engine.begin() as conn:
            updated_row = conn.execute(text("""
                UPDATE compliance_cases SET
                    status = :status,
                    final_verdict = :verdict,
                    regulator_reference = :reference,
                    regulator_status = CAST(:regulator_status AS jsonb),
                    execution_trace = COALESCE(execution_trace, '[]'::jsonb) || CAST(:trace AS jsonb),
                    decision_version = decision_version + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE case_id = :case_id AND status = 'ESCALATED_FIU'
                RETURNING *;
            """), {
                "status": new_status,
                "verdict": final_verdict,
                "reference": payload.regulator_reference,
                "regulator_status": json.dumps(regulator_record),
                "trace": transition_trace,
                "case_id": case_id,
            }).mappings().first()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That regulator reference is already attached to another case. Use the unique FIU acknowledgement reference.",
        )

    if not updated_row:
        with engine.connect() as conn:
            existing = conn.execute(
                text("SELECT status FROM compliance_cases WHERE case_id = :case_id"),
                {"case_id": case_id},
            ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="Escalated case was not found.")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Case is already {existing['status']}. The external disposition is immutable and cannot be submitted twice.",
        )

    log_security_event(
        "REGULATOR_DISPOSITION_RECORDED",
        username=regulator.username,
        badge_id=regulator.badge_id,
        details=f"Case {case_id} -> {final_verdict} (Reference: {payload.regulator_reference})",
    )
    return {"status": "SUCCESS", "case": format_case_row(dict(updated_row))}

# Maker Recommendation Submission
@router.post("/investigations/{case_id}/maker-recommend")
async def maker_recommend(case_id: str, payload: MakerRecommendationPayload, request: Request):
    maker = require_role(["ANALYST"])(request)

    maker_data = {
        "decision": payload.recommendation,
        "summary": payload.findings_summary,
        "officer": f"{maker.full_name} ({maker.badge_id})",
        "username": maker.username
    }

    with engine.begin() as conn:
        updated_row = conn.execute(text("""
            UPDATE compliance_cases SET
                status = 'PENDING_CHECKER',
                maker_status = CAST(:m AS jsonb),
                execution_trace = COALESCE(execution_trace, '[]'::jsonb) || CAST(:trace AS jsonb),
                decision_version = decision_version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE case_id = :cid
              AND status = 'PENDING_MAKER'
              AND created_by_username = :maker_username
            RETURNING *;
        """), {
            "m": json.dumps(maker_data),
            "trace": json.dumps([{
                "event": "MAKER_RECOMMENDATION_TRANSMITTED",
                "actor": maker.username,
                "decision": payload.recommendation,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }]),
            "cid": case_id,
            "maker_username": maker.username,
        }).mappings().first()

    if not updated_row:
        with engine.connect() as conn:
            existing = conn.execute(
                text("SELECT status, created_by_username FROM compliance_cases WHERE case_id = :cid;"),
                {"cid": case_id}
            ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="Case not found.")
        if existing["status"] == "PENDING_MAKER" and existing["created_by_username"] != maker.username:
            log_security_event(
                "MAKER_OWNERSHIP_BLOCK",
                username=maker.username,
                badge_id=maker.badge_id,
                details=f"Analyst attempted to submit another Maker's case {case_id}.",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maker ownership control: only the Analyst who opened this investigation can submit its recommendation.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Case is already {existing['status']}. Duplicate transmission was blocked."
        )

    log_security_event("MAKER_RECOMMENDATION_FILED", username=maker.username, badge_id=maker.badge_id, details=f"Case {case_id} -> {payload.recommendation}")
    return {
        "status": "SUCCESS",
        "case": format_case_row(dict(updated_row))
    }

# Maker Simulation Endpoint
@router.get("/investigations/my-open")
async def get_my_open_investigation(request: Request):
    analyst = require_role(["ANALYST"])(request)
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT * FROM compliance_cases
            WHERE created_by_username = :username
              AND status = 'PENDING_MAKER'
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1;
        """), {"username": analyst.username}).mappings().first()
    return format_case_row(dict(row)) if row else None


@router.get("/investigations/account-holders")
async def get_account_holders(
    request: Request,
    search: str = Query(default="", max_length=80),
    limit: int = Query(default=30, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=100_000),
    sample: bool = Query(default=False),
    exclude_customer_id: Optional[str] = Query(default=None, max_length=64),
    exclude_customer_name: Optional[str] = Query(default=None, max_length=255),
):
    """Search or sample canonical ledger identities for the Analyst case form."""
    _ = require_role(["ANALYST"])(request)
    normalized_search = search.strip()
    normalized_exclusion = (exclude_customer_id or "").strip().upper()
    normalized_name_exclusion = (exclude_customer_name or "").strip().lower()
    params = {
        "pattern": f"%{normalized_search.lower()}%",
        "search_is_empty": normalized_search == "",
        "excluded_customer_id": normalized_exclusion,
        "excluded_customer_name": normalized_name_exclusion,
        "limit_plus_one": limit + 1,
        "offset": offset,
    }
    ordering = "RANDOM()" if sample else "holders.customer_name, holders.customer_id"

    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT
                holders.customer_id,
                holders.customer_name,
                holders.historical_avg,
                holders.latest_transaction_at
            FROM account_holders AS holders
            WHERE (
                    :search_is_empty
                    OR LOWER(holders.customer_id) LIKE :pattern
                    OR LOWER(holders.customer_name) LIKE :pattern
                  )
              AND (:excluded_customer_id = '' OR holders.customer_id <> :excluded_customer_id)
              AND (:excluded_customer_name = '' OR LOWER(holders.customer_name) <> :excluded_customer_name)
              AND NOT EXISTS (
                    SELECT 1
                    FROM compliance_cases AS cases
                    WHERE cases.customer_id = holders.customer_id
                      AND cases.status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU')
                  )
            ORDER BY {ordering}
            LIMIT :limit_plus_one
            OFFSET :offset;
        """), params).mappings().all()

    has_more = len(rows) > limit
    page = rows[:limit]
    return {
        "items": [format_account_holder_row(dict(row)) for row in page],
        "has_more": has_more,
        "next_offset": offset + len(page) if has_more else None,
        "offset": offset,
        "search": normalized_search,
    }


@router.post("/investigations/simulate")
async def simulate_investigation(payload: TransactionCreatePayload, request: Request):
    user = require_role(["ANALYST"])(request)
    with engine.connect() as conn:
        existing_case = conn.execute(text("""
            SELECT * FROM compliance_cases
            WHERE (
                    (transaction_id = :transaction_id
                     AND status <> 'DUPLICATE_SUPERSEDED')
                    OR
                    (customer_id = :customer_id
                     AND status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU'))
                  )
            ORDER BY created_at ASC
            LIMIT 1;
        """), {
            "transaction_id": payload.transaction_id,
            "customer_id": payload.customer_id,
        }).mappings().first()
    if existing_case:
        if existing_case["status"] in {"PENDING_MAKER", "PENDING_CHECKER"}:
            maker_status = safe_dict(existing_case.get("maker_status"))
            owner = existing_case.get("created_by_username") or maker_status.get("username")
            if owner == user.username:
                restored_case = format_case_row(dict(existing_case))
                restored_case["resumed_existing_case"] = True
                restored_case["resume_message"] = (
                    f"Pending case {existing_case['case_id']} restored. No duplicate approval was created."
                )
                log_security_event(
                    "PENDING_CASE_RESUMED",
                    username=user.username,
                    badge_id=user.badge_id,
                    details=f"Analyst resumed case {existing_case['case_id']} after retry/login.",
                )
                return restored_case
            conflict_detail = (
                f"Account holder {payload.customer_id} already has pending case {existing_case['case_id']} "
                "owned by another investigation workflow. Duplicate approval was blocked."
            )
        elif existing_case["status"] == "ESCALATED_FIU":
            conflict_detail = (
                f"Account holder {payload.customer_id} is already under FIU review in case {existing_case['case_id']} "
                f"(docket {existing_case['fiu_docket_id']}). New approvals are blocked until the regulator records a disposition."
            )
        elif existing_case["transaction_id"] == payload.transaction_id:
            conflict_detail = (
                f"Transaction {payload.transaction_id} already belongs to case {existing_case['case_id']}. "
                "Open the existing case instead of creating a duplicate."
            )
        else:
            conflict_detail = (
                f"Account holder {payload.customer_id} already has pending case {existing_case['case_id']} "
                f"for transaction {existing_case['transaction_id']}. Complete or resolve that approval before opening another."
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflict_detail,
        )

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
            findings = jsonable_encoder(output.get("findings", []))
            policies = jsonable_encoder(output.get("retrieved_policies", []))
            trace = jsonable_encoder(output.get("execution_trace", trace))
            risk = float(output.get("cumulative_risk_score", 0.0))
        except Exception as e:
            print(f"[Workflow exec note] {e}")

    if not findings:
        amount = float(registered["amount"])
        ratio = amount / max(float(registered["historical_avg"]), 1.0)
        beneficiary_name = str(registered["beneficiary_name"])
        beneficiary_is_new = bool(registered["beneficiary_is_new"])
        high_risk_keywords = (
            "shell", "havala", "sanction", "holding", "offshore", "panama",
            "crypto", "bvi", "trust", "isle of man", "cayman", "swiss",
        )
        watchlist_hit = any(keyword in beneficiary_name.lower() for keyword in high_risk_keywords)

        transaction_delta = 0.45 if amount >= 500000 and beneficiary_is_new else (0.25 if amount >= 250000 or beneficiary_is_new else 0.05)
        findings.append({
            "agent": "TransactionInvestigator",
            "risk_level": "HIGH" if transaction_delta >= 0.40 else ("MEDIUM" if transaction_delta >= 0.20 else "LOW"),
            "score_delta": transaction_delta,
            "details": f"Transaction evidence: INR {amount:,.2f} via {registered['channel']} to {'first-time' if beneficiary_is_new else 'established'} beneficiary '{beneficiary_name}'.",
        })

        if ratio > 10.0:
            findings.append({"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.35, "details": f"Critical turnover velocity spike: {ratio:.1f}x deviation over 30-day baseline."})
        elif ratio >= 1.5:
            findings.append({"agent": "CustomerRiskAnalyst", "risk_level": "MEDIUM", "score_delta": 0.20, "details": f"Moderate turnover velocity deviation: {ratio:.1f}x the 30-day baseline."})

        if watchlist_hit:
            findings.append({"agent": "CustomerRiskAnalyst", "risk_level": "HIGH", "score_delta": 0.40, "details": f"Beneficiary '{beneficiary_name}' matched the high-risk entity/jurisdiction keyword screen."})

        regulatory_delta = 0.30 if amount >= 500000 and beneficiary_is_new else (0.10 if amount >= 200000 else 0.02)
        findings.append({
            "agent": "RegulatoryResearcher",
            "risk_level": "HIGH" if regulatory_delta >= 0.25 else "LOW",
            "score_delta": regulatory_delta,
            "details": "Deterministic statutory fallback applied because the external semantic reasoning service was unavailable.",
        })
        risk = min(round(sum(float(finding["score_delta"]) for finding in findings), 2), 1.0)
        policies.append({
            "document_title": "Master Direction - Know Your Customer (KYC) Direction, 2016",
            "citation": "RBI Section 41",
            "section": "Section 41 - Enhanced Due Diligence",
            "snippet": "Risk-based monitoring and enhanced due diligence must be applied to unusual transaction patterns and higher-risk relationships.",
            "retrieval_mode": "DETERMINISTIC_FALLBACK",
        })
        trace.append("RegulatoryResearcher: external reasoning unavailable; deterministic statutory fallback completed.")

    is_high_risk = risk >= 0.70

    case_record = {
        "case_id": case_id,
        "transaction_id": registered["transaction_id"],
        "customer_id": registered["customer_id"],
        "created_by_username": user.username,
        "customer_name": registered["customer_name"],
        "beneficiary_name": registered["beneficiary_name"],
        "amount": float(registered["amount"]),
        "channel": registered["channel"],
        "historical_avg": float(registered["historical_avg"]),
        "risk_score": risk,
        "priority": "P1 - CRITICAL" if is_high_risk else "P3 - LOW",
        "sla_deadline": "45m remaining" if is_high_risk else "N/A",
        "status": "PENDING_MAKER" if is_high_risk else "FINALIZED",
        "fiu_docket_id": None,
        "final_verdict": "AUTO_APPROVED" if not is_high_risk else None,
        "findings": json.dumps(findings),
        "retrieved_policies": json.dumps(policies),
        "execution_trace": json.dumps(trace)
    }

    with engine.begin() as conn:
        inserted_case_id = conn.execute(text("""
            INSERT INTO compliance_cases (
                case_id, transaction_id, customer_id, created_by_username, customer_name, beneficiary_name,
                amount, channel, historical_avg, risk_score, priority, 
                sla_deadline, status, fiu_docket_id, final_verdict, findings, retrieved_policies, execution_trace
            ) VALUES (
                :case_id, :transaction_id, :customer_id, :created_by_username, :customer_name, :beneficiary_name,
                :amount, :channel, :historical_avg, :risk_score, :priority, 
                :sla_deadline, :status, :fiu_docket_id, :final_verdict, CAST(:findings AS jsonb), CAST(:retrieved_policies AS jsonb), CAST(:execution_trace AS jsonb)
            )
            ON CONFLICT DO NOTHING
            RETURNING case_id;
        """), case_record).scalar()

    if not inserted_case_id:
        with engine.connect() as conn:
            existing_case_id = conn.execute(text("""
                SELECT case_id FROM compliance_cases
                WHERE (
                        (transaction_id = :transaction_id
                         AND status <> 'DUPLICATE_SUPERSEDED')
                        OR
                        (customer_id = :customer_id
                         AND status IN ('PENDING_MAKER', 'PENDING_CHECKER', 'ESCALATED_FIU'))
                      )
                LIMIT 1;
            """), {
                "transaction_id": registered["transaction_id"],
                "customer_id": registered["customer_id"],
            }).scalar()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Account holder {registered['customer_id']} already has pending case {existing_case_id}. Duplicate approval was blocked."
        )

    with engine.connect() as conn:
        created_row = conn.execute(text("SELECT * FROM compliance_cases WHERE case_id = :cid;"), {"cid": case_id}).mappings().first()

    return format_case_row(dict(created_row))
