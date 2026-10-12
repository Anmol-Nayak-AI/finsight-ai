import os
import datetime
from typing import Optional, Dict, Any, List
import jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "prod-fin-compliance-secret-key-384910284019284")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8-hour shift session

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security_bearer = HTTPBearer()

class UserPrincipal(BaseModel):
    username: str
    full_name: str
    role: str  # ANALYST | MLRO_OFFICER | AUDITOR
    badge_id: str
    department: str

# In-memory production seed users for instant demoing
DEMO_OFFICERS: Dict[str, Dict[str, Any]] = {
    "officer.sharma": {
        "username": "officer.sharma",
        "hashed_password": pwd_context.hash("Compliance@2026"),
        "full_name": "Priya Sharma (CAMS)",
        "role": "MLRO_OFFICER",
        "badge_id": "AML-88219",
        "department": "Special Investigations Unit (SIU)"
    },
    "analyst.verma": {
        "username": "analyst.verma",
        "hashed_password": pwd_context.hash("Analyst@2026"),
        "full_name": "Rohan Verma",
        "role": "ANALYST",
        "badge_id": "AML-33012",
        "department": "Transaction Monitoring Operations"
    }
}

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Compliance session expired. Re-authenticate.")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization bearer token.")

def require_role(allowed_roles: List[str]):
    def role_checker(user: UserPrincipal = Security(get_current_user)) -> UserPrincipal:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Role '{user.role}' lacks permission for this statutory action."
            )
        return user
    return role_checker
