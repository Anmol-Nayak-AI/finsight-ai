import os
import hashlib
import hmac
import datetime
from typing import Optional, Dict, Any, List
import jwt
import pyotp
import uuid
from fastapi import HTTPException, Security, status, Request, Response
from pydantic import BaseModel
from sqlalchemy import text
from app.database import engine

APP_ENV = os.getenv("APP_ENV", "development").lower()
_configured_secret = os.getenv("JWT_SECRET_KEY")
if APP_ENV == "production" and not _configured_secret:
    raise RuntimeError("JWT_SECRET_KEY must be configured when APP_ENV=production")
if APP_ENV == "production" and len(_configured_secret or "") < 32:
    raise RuntimeError("JWT_SECRET_KEY must contain at least 32 characters when APP_ENV=production")
SECRET_KEY = _configured_secret or "local-dev-only-change-me-finsight"
ALGORITHM = "HS256"
SESSION_EXPIRE_HOURS = 8
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true" if APP_ENV == "production" else "false").lower() == "true"
DEMO_MODE = os.getenv("DEMO_MODE", "true" if APP_ENV != "production" else "false").lower() == "true"

def _identity_secret(environment_name: str, development_default: str) -> str:
    configured = os.getenv(environment_name)
    if configured:
        return configured
    if APP_ENV == "production":
        raise RuntimeError(f"{environment_name} must be configured when APP_ENV=production")
    return development_default

def hash_password(password: str, username: str) -> str:
    salt = f"finsight-identity:{username.lower()}".encode()
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000).hex()

def verify_password(password: str, username: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password, username), expected_hash)

# INSTITUTIONAL PRE-PROVISIONED ROSTER
PRE_PROVISIONED_ROSTER = {
    "officer.sharma": {
        "username": "officer.sharma",
        "password_hash": hash_password(_identity_secret("MLRO_SHARMA_PASSWORD", "Compliance@2026"), "officer.sharma"),
        "full_name": "Priya Sharma (CAMS)",
        "role": "MLRO_OFFICER",
        "badge_id": "AML-88219",
        "department": "Special Investigations Unit (SIU)",
        "totp_seed": _identity_secret("MLRO_SHARMA_TOTP_SEED", "JBSWY3DPEHPK3PXP")
    },
    "officer.kapoor": {
        "username": "officer.kapoor",
        "password_hash": hash_password(_identity_secret("MLRO_KAPOOR_PASSWORD", "Senior@2026"), "officer.kapoor"),
        "full_name": "Vikram Kapoor",
        "role": "MLRO_OFFICER",
        "badge_id": "AML-99001",
        "department": "Executive Compliance Directorate",
        "totp_seed": _identity_secret("MLRO_KAPOOR_TOTP_SEED", "JBSWY3DPEHPK3PXP")
    },
    "analyst.verma": {
        "username": "analyst.verma",
        "password_hash": hash_password(_identity_secret("ANALYST_VERMA_PASSWORD", "Analyst@2026"), "analyst.verma"),
        "full_name": "Rohan Verma",
        "role": "ANALYST",
        "badge_id": "AML-33012",
        "department": "Transaction Monitoring Operations",
        "totp_seed": _identity_secret("ANALYST_VERMA_TOTP_SEED", "HXDMVJECJJWSRB3H")
    },
    "regulator.iyer": {
        "username": "regulator.iyer",
        "password_hash": hash_password(_identity_secret("REGULATOR_IYER_PASSWORD", "Regulator@2026"), "regulator.iyer"),
        "full_name": "Ananya Iyer",
        "role": "REGULATOR_OFFICER",
        "badge_id": "FIU-IND-7104",
        "department": "Financial Intelligence Unit - India",
        "totp_seed": _identity_secret("REGULATOR_IYER_TOTP_SEED", "JBSWY3DPEHPK3PXP")
    }
}

class UserPrincipal(BaseModel):
    username: str
    full_name: str
    role: str
    badge_id: str
    department: str

def init_security_tables():
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('finsight_security_schema_v2'));"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS compliance_officers (
                    username VARCHAR(64) PRIMARY KEY,
                    hashed_password VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    role VARCHAR(32) NOT NULL,
                    badge_id VARCHAR(64) NOT NULL,
                    department VARCHAR(128) NOT NULL,
                    totp_seed VARCHAR(64) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS revoked_tokens (
                    token_hash VARCHAR(64) PRIMARY KEY,
                    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
                );

                CREATE TABLE IF NOT EXISTS used_mfa_challenges (
                    challenge_hash VARCHAR(64) PRIMARY KEY,
                    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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

                DELETE FROM used_mfa_challenges WHERE expires_at < CURRENT_TIMESTAMP;
                DELETE FROM revoked_tokens WHERE expires_at < CURRENT_TIMESTAMP;
            """))

            for u, data in PRE_PROVISIONED_ROSTER.items():
                conn.execute(text("""
                    INSERT INTO compliance_officers (username, hashed_password, full_name, role, badge_id, department, totp_seed)
                    VALUES (:u, :pwd, :name, :role, :badge, :dept, :totp)
                    ON CONFLICT (username) DO UPDATE SET
                        hashed_password = EXCLUDED.hashed_password,
                        role = EXCLUDED.role,
                        totp_seed = EXCLUDED.totp_seed;
                """), {
                    "u": u,
                    "pwd": data["password_hash"],
                    "name": data["full_name"],
                    "role": data["role"],
                    "badge": data["badge_id"],
                    "dept": data["department"],
                    "totp": data["totp_seed"]
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

def verify_totp_code(secret_seed: str, input_code: str) -> bool:
    totp = pyotp.TOTP(secret_seed)
    return totp.verify(input_code.strip(), valid_window=1)

def get_totp_provisioning_uri(username: str, secret_seed: str) -> str:
    totp = pyotp.TOTP(secret_seed)
    return totp.provisioning_uri(name=username, issuer_name="FinSight Bank Compliance")

def create_mfa_challenge_token(username: str) -> str:
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)
    return jwt.encode(
        {"sub": username, "stage": "MFA_PENDING", "jti": uuid.uuid4().hex, "exp": exp},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

def consume_mfa_challenge(challenge_id: str, expires_at: datetime.datetime) -> bool:
    """Atomically mark a valid MFA challenge as used to prevent token replay."""
    challenge_hash = hashlib.sha256(challenge_id.encode()).hexdigest()
    with engine.begin() as conn:
        consumed = conn.execute(text("""
            INSERT INTO used_mfa_challenges (challenge_hash, expires_at)
            VALUES (:challenge_hash, :expires_at)
            ON CONFLICT (challenge_hash) DO NOTHING
            RETURNING challenge_hash;
        """), {"challenge_hash": challenge_hash, "expires_at": expires_at}).scalar()
    return consumed is not None

def create_session_token(user: UserPrincipal) -> str:
    issued_at = datetime.datetime.now(datetime.timezone.utc)
    exp = issued_at + datetime.timedelta(hours=SESSION_EXPIRE_HOURS)
    payload = {
        "sub": user.username,
        "name": user.full_name,
        "role": user.role,
        "badge_id": user.badge_id,
        "dept": user.department,
        "stage": "AUTHENTICATED",
        "jti": uuid.uuid4().hex,
        "iat": issued_at,
        "exp": exp
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

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

def get_current_user(request: Request) -> UserPrincipal:
    # Prefer an explicit bearer credential so a stale browser cookie from a
    # previous officer cannot shadow the caller's intended session.
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    if not token:
        token = request.cookies.get("finsight_session")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No active session found. Please sign in.")

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
            full_name=payload["name"],
            role=payload["role"],
            badge_id=payload["badge_id"],
            department=payload["dept"]
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

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.now(datetime.timezone.utc) + expires_delta
    else:
        expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=SESSION_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

DEMO_OFFICERS = PRE_PROVISIONED_ROSTER
