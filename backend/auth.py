"""
AWS Cognito JWT Authentication for FastAPI.

Validates Cognito-issued JWTs and exposes two FastAPI dependencies:
  - get_current_user: any authenticated user
  - require_admin:    only users in the 'admin' Cognito group
"""

import os
import requests
from functools import lru_cache

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

COGNITO_REGION = os.getenv("COGNITO_REGION", "us-east-1")
COGNITO_POOL_ID = os.getenv("COGNITO_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")
JWKS_URL = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
    f"/{COGNITO_POOL_ID}/.well-known/jwks.json"
)

security = HTTPBearer()


@lru_cache(maxsize=1)
def _fetch_jwks() -> dict:
    """Fetch and cache Cognito JWKS (rotates rarely — cache is fine)."""
    response = requests.get(JWKS_URL, timeout=5)
    response.raise_for_status()
    return response.json()


def _decode_token(token: str) -> dict:
    jwks = _fetch_jwks()
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Malformed token")

    key = next((k for k in jwks["keys"] if k["kid"] == header.get("kid")), None)
    if not key:
        raise HTTPException(status_code=401, detail="Token signing key not found")

    try:
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {exc}")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Dependency: returns the authenticated user dict or raises 401."""
    payload = _decode_token(credentials.credentials)
    return {
        "sub": payload["sub"],
        "email": payload.get("email"),
        "groups": payload.get("cognito:groups", []),
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: like get_current_user but raises 403 if not in 'admin' group."""
    if "admin" not in user["groups"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
