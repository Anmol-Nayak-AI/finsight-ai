import os
import hashlib
import datetime
from typing import Optional, Dict, Any, List
import jwt
from fastapi import HTTPException, Security, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import text
from app.database import engine, sync_engine

# Use synchronous engine for DB queries and DDL
engine = sync_engine

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "prod-fin-compliance-secret-key-384910284019284")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8-Hour Regulated Officer Shift

# Institutional Organization Verification Keys
INSTITUTIONAL_KEYS = {
    "MLRO_OFFICER": "MLRO-AUTH-2026",
    "ANALYST": "ANALYST-AUTH-2026"
}

security_bearer = HTTPBearer()

def hash_password(password: str) -> str:
    salt = "finsight_salt_enterprise_2026"
    return hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hash_password(plain_password) == hashed_password:
        return True
    legacy_salt = "finsight_salt_2026"
    return hashlib.sha256(f"{legacy_salt}{plain_password}".encode("utf-8")).hexdigest() == hashed_password

class UserPrincipal(BaseModel):
    username: str
    full_name: str
    role: str  # ANALYST | MLRO_OFFICER
    badge_id: str
    department: str

# Demo Officers Mapping for backwards compatibility
DEMO_OFFICERS: Dict[str, Dict[str, Any]] = {
    "officer.sharma": {
        "username": "officer.sharma",
        "full_name": "Priya Sharma (CAMS)",
        "role": "MLRO_OFFICER",
        "badge_id": "AML-88219",
        "department": "Special Investigations Unit (SIU)"
    },
    "analyst.verma": {
        "username": "analyst.verma",
        "full_name": "Rohan Verma",
        "role": "ANALYST",
        "badge_id": "AML-33012",
        "department": "Transaction Monitoring Operations"
    }
}

def init_auth_tables():
    """Initializes tables for officers, token blacklisting, and immutable security audit trails."""
    try:
        with engine.begin() as conn:
            # 1. Compliance Personnel Directory
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS compliance_officers (
                    username VARCHAR(64) PRIMARY KEY,
                    hashed_password VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    role VARCHAR(32) NOT NULL,
                    badge_id VARCHAR(64) NOT NULL,
                    department VARCHAR(128) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """))

            # 2. Server-Side JWT Revocation Blacklist (Stateful Invalidation)
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS revoked_tokens (
                    token_hash VARCHAR(64) PRIMARY KEY,
                    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_revoked_exp ON revoked_tokens(expires_at);
            """))

            # 3. Immutable Security & Access Audit Log
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS security_audit_logs (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(64) NOT NULL,
                    username VARCHAR(64),
                    badge_id VARCHAR(64),
                    details TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_audit_created ON security_audit_logs(created_at DESC);
            """))

            # Seed Pre-Approved Demo Officers
            sharma_pwd = hash_password("Compliance@2026")
            verma_pwd = hash_password("Analyst@2026")
            conn.execute(text("""
                INSERT INTO compliance_officers (username, hashed_password, full_name, role, badge_id, department)
                VALUES 
                    ('officer.sharma', :p1, 'Priya Sharma (CAMS)', 'MLRO_OFFICER', 'AML-88219', 'Special Investigations Unit (SIU)'),
                    ('analyst.verma', :p2, 'Rohan Verma', 'ANALYST', 'AML-33012', 'Transaction Monitoring Operations')
                ON CONFLICT (username) DO UPDATE SET hashed_password = EXCLUDED.hashed_password;
            """), {"p1": sharma_pwd, "p2": verma_pwd})
    except Exception as e:
        print(f"[Security Engine Setup Warning] {e}")

init_auth_tables()

def log_security_event(event_type: str, username: str = None, badge_id: str = None, details: str = ""):
    """Logs security lifecycle actions to immutable database table."""
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO security_audit_logs (event_type, username, badge_id, details)
                VALUES (:event, :user, :badge, :details);
            """), {"event": event_type, "user": username, "badge": badge_id, "details": details})
    except Exception as err:
        print(f"[Audit Log Warning] {err}")

def create_access_token(user: UserPrincipal) -> str:
    expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": user.username,
        "name": user.full_name,
        "role": user.role,
        "badge_id": user.badge_id,
        "dept": user.department,
        "exp": expires
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def revoke_token(token: str):
    """Server-side session invalidation by persisting token hash to revocation table."""
    try:
        token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        exp_ts = payload.get("exp", datetime.datetime.now(datetime.timezone.utc).timestamp() + 3600)
        exp_date = datetime.datetime.fromtimestamp(exp_ts, tz=datetime.timezone.utc)
        
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO revoked_tokens (token_hash, expires_at)
                VALUES (:h, :exp)
                ON CONFLICT (token_hash) DO NOTHING;
            """), {"h": token_hash, "exp": exp_date})
            
        log_security_event("SESSION_TERMINATED", username=payload.get("sub"), badge_id=payload.get("badge_id"), details="Token revoked server-side.")
    except Exception as e:
        print(f"[Token Revocation Warning] {e}")

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security_bearer)) -> UserPrincipal:
    token = credentials.credentials
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()

    # 1. Check Server-Side Revocation Blacklist
    with engine.connect() as conn:
        revoked = conn.execute(
            text("SELECT token_hash FROM revoked_tokens WHERE token_hash = :h;"),
            {"h": token_hash}
        ).first()
        if revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Security Token Revoked. Your session was logged out. Please sign in again."
            )

    # 2. Decode & Verify JWT
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return UserPrincipal(
            username=payload["sub"],
            full_name=payload["name"],
            role=payload["role"],
            badge_id=payload["badge_id"],
            department=payload["dept"]
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Compliance session expired. Please re-authenticate.")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session credentials.")

def require_role(allowed_roles: List[str]):
    def role_checker(user: UserPrincipal = Security(get_current_user)) -> UserPrincipal:
        if user.role not in allowed_roles:
            log_security_event("UNAUTHORIZED_ACCESS_ATTEMPT", username=user.username, badge_id=user.badge_id, details=f"Attempted action requiring {allowed_roles}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Officer role '{user.role}' lacks legal authority for this action."
            )
        return user
    return role_checker
