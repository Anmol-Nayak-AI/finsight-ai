from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Dict, Any
from app.auth.security import (
    UserPrincipal,
    verify_password,
    create_access_token,
    get_current_user,
    DEMO_OFFICERS
)

auth_router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPrincipal

@auth_router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest):
    username = credentials.username.strip()
    user_record = DEMO_OFFICERS.get(username)
    if not user_record or not verify_password(credentials.password, user_record["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid compliance officer credentials."
        )
    user = UserPrincipal(
        username=user_record["username"],
        full_name=user_record["full_name"],
        role=user_record["role"],
        badge_id=user_record["badge_id"],
        department=user_record["department"]
    )
    token = create_access_token(user)
    return TokenResponse(access_token=token, user=user)

@auth_router.get("/me", response_model=UserPrincipal)
async def get_current_officer(user: UserPrincipal = Depends(get_current_user)):
    return user
