"""
User management routes for SmartInvoice.

Public:
  POST /users/confirm-signup   — Called after Amplify confirmSignUp; auto-assigns 'user' group

Admin-only:
  GET  /users                  — List all Cognito users
  POST /users/{sub}/role       — Change user role (admin ↔ user)
  POST /users/{sub}/disable    — Enable or disable a user account
  DELETE /users/{sub}          — Permanently delete a user
"""

import os
import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user, require_admin

router = APIRouter(prefix="/users", tags=["users"])

COGNITO_REGION = os.getenv("COGNITO_REGION", "us-east-1")
COGNITO_POOL_ID = os.getenv("COGNITO_POOL_ID", "")


def _cognito():
    return boto3.client("cognito-idp", region_name=COGNITO_REGION)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_user_groups(client, username: str) -> list[str]:
    try:
        res = client.admin_list_groups_for_user(
            UserPoolId=COGNITO_POOL_ID,
            Username=username,
        )
        return [g["GroupName"] for g in res.get("Groups", [])]
    except ClientError:
        return []


def _attr(attrs: list, key: str) -> str | None:
    return next((a["Value"] for a in attrs if a["Name"] == key), None)


# ── Public: confirm signup + auto-assign user group ──────────────────────────

class ConfirmSignupRequest(BaseModel):
    email: str


@router.post("/confirm-signup")
def confirm_signup(body: ConfirmSignupRequest):
    """
    Called by the frontend after Amplify confirmSignUp succeeds.
    Adds the new user to the 'user' Cognito group so they have a role.
    """
    client = _cognito()
    if not COGNITO_POOL_ID:
        raise HTTPException(status_code=500, detail="Cognito not configured")
    try:
        client.admin_add_user_to_group(
            UserPoolId=COGNITO_POOL_ID,
            Username=body.email,
            GroupName="user",
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "UserNotFoundException":
            raise HTTPException(status_code=404, detail="User not found in Cognito")
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": "User assigned to 'user' group."}


# ── Admin: list all users ─────────────────────────────────────────────────────

@router.get("")
def list_users(_: dict = Depends(require_admin)):
    """Return all users in the Cognito user pool."""
    client = _cognito()
    if not COGNITO_POOL_ID:
        raise HTTPException(status_code=500, detail="Cognito not configured")

    users = []
    paginator_token = None
    while True:
        kwargs = {"UserPoolId": COGNITO_POOL_ID, "Limit": 60}
        if paginator_token:
            kwargs["PaginationToken"] = paginator_token
        try:
            res = client.list_users(**kwargs)
        except ClientError as e:
            raise HTTPException(status_code=500, detail=str(e))

        for u in res.get("Users", []):
            attrs = u.get("Attributes", [])
            sub = _attr(attrs, "sub") or u["Username"]
            groups = _get_user_groups(client, u["Username"])
            role = "admin" if "admin" in groups else "user"
            users.append({
                "sub": sub,
                "username": u["Username"],
                "email": _attr(attrs, "email"),
                "name": _attr(attrs, "name"),
                "enabled": u.get("Enabled", True),
                "role": role,
                "created_at": u.get("UserCreateDate", "").isoformat()
                if u.get("UserCreateDate") else None,
            })

        paginator_token = res.get("PaginationToken")
        if not paginator_token:
            break

    return users


# ── Admin: change role ────────────────────────────────────────────────────────

class RoleRequest(BaseModel):
    role: str  # "admin" or "user"


@router.post("/{sub}/role")
def change_role(sub: str, body: RoleRequest, _: dict = Depends(require_admin)):
    """Promote or demote a user by moving them between Cognito groups."""
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'user'")

    client = _cognito()
    if not COGNITO_POOL_ID:
        raise HTTPException(status_code=500, detail="Cognito not configured")

    # Find username by sub
    username = _username_from_sub(client, sub)

    old_group = "admin" if body.role == "user" else "user"
    new_group = body.role

    try:
        # Remove from old group (ignore if not a member)
        try:
            client.admin_remove_user_from_group(
                UserPoolId=COGNITO_POOL_ID,
                Username=username,
                GroupName=old_group,
            )
        except ClientError:
            pass

        client.admin_add_user_to_group(
            UserPoolId=COGNITO_POOL_ID,
            Username=username,
            GroupName=new_group,
        )
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": f"User role changed to '{new_group}'."}


# ── Admin: enable / disable ───────────────────────────────────────────────────

class DisableRequest(BaseModel):
    enable: bool  # True = enable the user, False = disable


@router.post("/{sub}/disable")
def toggle_user(sub: str, body: DisableRequest, _: dict = Depends(require_admin)):
    """Enable or disable a Cognito user account."""
    client = _cognito()
    if not COGNITO_POOL_ID:
        raise HTTPException(status_code=500, detail="Cognito not configured")

    username = _username_from_sub(client, sub)

    try:
        if body.enable:
            client.admin_enable_user(UserPoolId=COGNITO_POOL_ID, Username=username)
        else:
            client.admin_disable_user(UserPoolId=COGNITO_POOL_ID, Username=username)
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

    action = "enabled" if body.enable else "disabled"
    return {"message": f"User {action}."}


# ── Admin: delete user ────────────────────────────────────────────────────────

@router.delete("/{sub}")
def delete_user(sub: str, _: dict = Depends(require_admin)):
    """Permanently delete a Cognito user."""
    client = _cognito()
    if not COGNITO_POOL_ID:
        raise HTTPException(status_code=500, detail="Cognito not configured")

    username = _username_from_sub(client, sub)

    try:
        client.admin_delete_user(UserPoolId=COGNITO_POOL_ID, Username=username)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "UserNotFoundException":
            raise HTTPException(status_code=404, detail="User not found")
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "User deleted."}


# ── Internal: resolve sub → username ─────────────────────────────────────────

def _username_from_sub(client, sub: str) -> str:
    """Find the Cognito username for a given sub (UUID)."""
    try:
        res = client.list_users(
            UserPoolId=COGNITO_POOL_ID,
            Filter=f'sub = "{sub}"',
            Limit=1,
        )
        users = res.get("Users", [])
        if not users:
            raise HTTPException(status_code=404, detail="User not found")
        return users[0]["Username"]
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
