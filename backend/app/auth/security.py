import os
import hashlib
import datetime
from typing import Optional, Dict, Any, List
import jwt
from fastapi import HTTPException, Security, status, Request, Response
from pydantic import BaseModel
from sqlalchemy import text
from app.database import engine, sync_engine

# Use synchronous engine for schema DDL and table operations
engine = sync_engine

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "prod-fin-compliance-enterprise-secret-key-9918237461")
ALGORITHM = "HS256"
SESSION_EXPIRE_HOURS = 8

# INSTITUTIONAL PRE-PROVISIONED ROSTER (Single Source of Truth)
PRE_PROVISIONED_ROSTER = {
    "officer.sharma": {
        "username": "officer.sharma",
        "password_hash": hashlib.sha256("Compliance@2026".encode()).hexdigest(),
        "full_name": "Priya Sharma (CAMS)",
        "role": "MLRO_OFFICER",
        "badge_id": "AML-88219",
        "department": "Special Investigations Unit (SIU)",
        "totp_secret": "123456" # Pre-shared 2FA code
    },
    "analyst.verma": {
        "username": "analyst.verma",
        "password_hash": hashlib.sha256("Analyst@2026".encode()).hexdigest(),
        "full_name": "Rohan Verma",
        "role": "ANALYST",
        "badge_id": "AML-33012",
        "department": "Transaction Monitoring Operations",
        "totp_secret": "654321" # Pre-shared 2FA code
    },
    "auditor.rao": {
        "username": "auditor.rao",
        "password_hash": hashlib.sha256("Auditor@2026".encode()).hexdigest(),
        "full_name": "Kavita Rao",
        "role": "AUDITOR",
        "badge_id": "AUD-90114",
        "department": "Internal Compliance Audit",
        "totp_secret": "999888" # Pre-shared 2FA code
    }
}

# Compatibility alias
DEMO_OFFICERS = PRE_PROVISIONED_ROSTER

INSTITUTIONAL_KEYS = {
    "MLRO_OFFICER": "MLRO-AUTH-2026",
    "ANALYST": "ANALYST-AUTH-2026",
    "AUDITOR": "AUDITOR-AUTH-2026"
}

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

class UserPrincipal(BaseModel):
    username: str
    full_name: str
    role: str  # ANALYST | MLRO_OFFICER | AUDITOR
    badge_id: str
    department: str

def init_security_tables():
    """Initializes tables for session revocation and security event tracking."""
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS compliance_officers (
                    username VARCHAR(64) PRIMARY KEY,
                    hashed_password VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    role VARCHAR(32) NOT NULL,
                    badge_id VARCHAR(64) NOT NULL,
                    department VARCHAR(128) NOT NULL,
                    totp_secret VARCHAR(32) NOT NULL DEFAULT '123456',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                ALTER TABLE compliance_officers ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(32) DEFAULT '123456';

                CREATE TABLE IF NOT EXISTS revoked_tokens (
                    token_hash VARCHAR(64) PRIMARY KEY,
                    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
                );

                CREATE TABLE IF NOT EXISTS security_audit_logs (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(64) NOT NULL,
                    username VARCHAR(64),
                    badge_id VARCHAR(64),
                    details TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """))

            # Seed Roster
            for u, data in PRE_PROVISIONED_ROSTER.items():
                conn.execute(text("""
                    INSERT INTO compliance_officers (username, hashed_password, full_name, role, badge_id, department, totp_secret)
                    VALUES (:u, :pwd, :name, :role, :badge, :dept, :totp)
                    ON CONFLICT (username) DO UPDATE SET
                        hashed_password = EXCLUDED.hashed_password,
                        full_name = EXCLUDED.full_name,
                        role = EXCLUDED.role,
                        badge_id = EXCLUDED.badge_id,
                        department = EXCLUDED.department,
                        totp_secret = EXCLUDED.totp_secret;
                """), {
                    "u": u,
                    "pwd": data["password_hash"],
                    "name": data["full_name"],
                    "role": data["role"],
                    "badge": data["badge_id"],
                    "dept": data["department"],
                    "totp": data["totp_secret"]
                })
    except Exception as e:
        print(f"[Security DB Init Note] {e}")

init_security_tables()

def log_security_event(event_type: str, username: str = None, badge_id: str = None, details: str = ""):
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO security_audit_logs (event_type, username, badge_id, details)
                VALUES (:event, :user, :badge, :details);
            """), {"event": event_type, "user": username, "badge": badge_id, "details": details})
    except Exception as err:
        print(f"[Audit Log Warning] {err}")

def create_mfa_challenge_token(username: str) -> str:
    """Short-lived 5-minute token issued after Step-1 password validation."""
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)
    return jwt.encode({"sub": username, "stage": "MFA_PENDING", "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)

def create_session_token(user: UserPrincipal) -> str:
    """Full 8-hour session token issued only after 2FA TOTP verification."""
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=SESSION_EXPIRE_HOURS)
    payload = {
        "sub": user.username,
        "name": user.full_name,
        "role": user.role,
        "badge_id": user.badge_id,
        "dept": user.department,
        "stage": "AUTHENTICATED",
        "exp": exp
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# Compatibility alias
create_access_token = create_session_token

def revoke_session(token: str):
    try:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        exp_ts = payload.get("exp", datetime.datetime.now(datetime.timezone.utc).timestamp() + 3600)
        exp_date = datetime.datetime.fromtimestamp(exp_ts, tz=datetime.timezone.utc)
        
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO revoked_tokens (token_hash, expires_at)
                VALUES (:h, :exp) ON CONFLICT (token_hash) DO NOTHING;
            """), {"h": token_hash, "exp": exp_date})
            
        log_security_event("SESSION_REVOKED", username=payload.get("sub"), badge_id=payload.get("badge_id"), details="Logged out and revoked on server.")
    except Exception as err:
        print(f"[Revoke Notice] {err}")

# Compatibility alias
revoke_token = revoke_session

def get_current_user(request: Request) -> UserPrincipal:
    """Extracts session from HttpOnly Cookie (primary) or Bearer header (cURL/API)."""
    token = request.cookies.get("finsight_session")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No active session found. Please sign in.")

    # Check revocation blacklist
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with engine.connect() as conn:
        revoked = conn.execute(
            text("SELECT token_hash FROM revoked_tokens WHERE token_hash = :h;"),
            {"h": token_hash}
        ).first()
        if revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked. Please sign in again.")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("stage") != "AUTHENTICATED":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2FA authentication incomplete.")
            
        return UserPrincipal(
            username=payload["sub"],
            full_name=payload.get("name", payload["sub"]),
            role=payload.get("role", "ANALYST"),
            badge_id=payload.get("badge_id", "AML-00000"),
            department=payload.get("dept", "Operations")
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Re-authenticate.")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session credentials.")

def require_role(allowed_roles: List[str]):
    def role_checker(request: Request) -> UserPrincipal:
        user = get_current_user(request)
        if user.role not in allowed_roles:
            log_security_event("UNAUTHORIZED_ATTEMPT", username=user.username, badge_id=user.badge_id, details=f"Attempted action requiring {allowed_roles}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Officer role '{user.role}' lacks authority. Required: {allowed_roles}"
            )
        return user
    return role_checker
