import os
import hashlib
import datetime
from typing import Optional, Dict, Any, List
import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import text
from app.database import engine, sync_engine

# Use synchronous engine for schema DDL and table initialization
engine = sync_engine

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "prod-fin-compliance-secret-key-384910284019284")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

security_bearer = HTTPBearer()

def hash_password(password: str) -> str:
    salt = "finsight_salt_2026"
    return hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

class UserPrincipal(BaseModel):
    username: str
    full_name: str
    role: str  # SUPER_ADMIN | MLRO_OFFICER | ANALYST
    badge_id: str
    department: str

# Default seeded in-memory and DB officers
DEMO_OFFICERS: Dict[str, Dict[str, Any]] = {
    "admin.patel": {
        "username": "admin.patel",
        "hashed_password": hash_password("SuperAdmin@2026"),
        "full_name": "Vikram Patel (Director of FCC)",
        "role": "SUPER_ADMIN",
        "badge_id": "DIR-00001",
        "department": "Executive Compliance & Oversight"
    },
    "officer.sharma": {
        "username": "officer.sharma",
        "hashed_password": hash_password("Compliance@2026"),
        "full_name": "Priya Sharma (CAMS)",
        "role": "MLRO_OFFICER",
        "badge_id": "AML-88219",
        "department": "Special Investigations Unit (SIU)"
    },
    "analyst.verma": {
        "username": "analyst.verma",
        "hashed_password": hash_password("Analyst@2026"),
        "full_name": "Rohan Verma",
        "role": "ANALYST",
        "badge_id": "AML-33012",
        "department": "Transaction Monitoring Operations"
    }
}

def init_auth_db():
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
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS platform_configs (
                    config_key VARCHAR(64) PRIMARY KEY,
                    config_val VARCHAR(255) NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                INSERT INTO platform_configs (config_key, config_val)
                VALUES ('HITL_THRESHOLD', '0.70')
                ON CONFLICT (config_key) DO NOTHING;
            """))

            # Seed Default Super Admin & Tiered Officers
            admin_pwd = hash_password("SuperAdmin@2026")
            sharma_pwd = hash_password("Compliance@2026")
            verma_pwd = hash_password("Analyst@2026")
            
            conn.execute(text("""
                INSERT INTO compliance_officers (username, hashed_password, full_name, role, badge_id, department, is_active)
                VALUES 
                    ('admin.patel', :admin_pwd, 'Vikram Patel (Director of FCC)', 'SUPER_ADMIN', 'DIR-00001', 'Executive Compliance & Oversight', TRUE),
                    ('officer.sharma', :sharma_pwd, 'Priya Sharma (CAMS)', 'MLRO_OFFICER', 'AML-88219', 'Special Investigations Unit (SIU)', TRUE),
                    ('analyst.verma', :verma_pwd, 'Rohan Verma', 'ANALYST', 'AML-33012', 'Transaction Monitoring Operations', TRUE)
                ON CONFLICT (username) DO NOTHING;
            """), {"admin_pwd": admin_pwd, "sharma_pwd": sharma_pwd, "verma_pwd": verma_pwd})
    except Exception as e:
        print(f"[Auth DB Warning] {e}")

init_auth_db()

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

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security_bearer)) -> UserPrincipal:
    token = credentials.credentials
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization bearer token.")

def require_role(allowed_roles: List[str]):
    def role_checker(user: UserPrincipal = Security(get_current_user)) -> UserPrincipal:
        # SUPER_ADMIN has god-mode privileges across all routes
        if user.role == "SUPER_ADMIN":
            return user
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Officer role '{user.role}' lacks permission for this statutory action."
            )
        return user
    return role_checker
