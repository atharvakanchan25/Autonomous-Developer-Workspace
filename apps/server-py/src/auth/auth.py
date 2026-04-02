from typing import Optional

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.config import config
from src.core.database import db
from src.core.utils import now_iso
from src.core.logger import logger

# Initialize Firebase Admin SDK once
if not firebase_admin._apps:
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": config.FIREBASE_PROJECT_ID,
        "client_email": config.FIREBASE_CLIENT_EMAIL,
        "private_key": config.FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)

_bearer = HTTPBearer(auto_error=False)
ROLES = ("user", "admin")

# Source-of-truth admin emails — role is ALWAYS enforced from here,
# regardless of what is stored in the database.
DEFAULT_ADMIN_EMAILS: set[str] = {
    "tanvihole@adw.com",
    "saloni@adw.com",
    "varadmandhare@adw.com",
    "prajwalshedge@adw.com",
    "aryankanchan@adw.com",
    "atharvakanchan@adw.com",
    "atharvakanchan959@gmail.com",
    "abhidhautre@adw.com",
}

ENV_ADMIN_EMAILS = {
    email.strip().lower()
    for email in config.ADMIN_EMAILS.split(",")
    if email.strip()
}

ADMIN_EMAILS = {e.lower() for e in DEFAULT_ADMIN_EMAILS | ENV_ADMIN_EMAILS}


class AuthUser:
    def __init__(self, uid: str, email: str, role: str):
        self.uid = uid
        self.email = email
        self.role = role

    def has_role(self, minimum: str) -> bool:
        try:
            return ROLES.index(self.role) >= ROLES.index(minimum)
        except ValueError:
            return False

    def is_admin(self) -> bool:
        return self.role == "admin"

    def can_access_resource(self, resource_owner_id: str) -> bool:
        return self.is_admin() or self.uid == resource_owner_id


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> AuthUser:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    try:
        decoded = firebase_auth.verify_id_token(creds.credentials)
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    uid = decoded["uid"]
    email = decoded.get("email", "")

    # Email is the single source of truth for admin role (case-insensitive)
    correct_role = "admin" if email.lower() in ADMIN_EMAILS else "user"
    logger.info(f"Auth check: {email} -> role: {correct_role} (in ADMIN_EMAILS: {email.lower() in ADMIN_EMAILS})")

    doc = db.collection("users").document(uid).get()
    if doc.exists:
        stored_role = doc.to_dict().get("role", "user")
        if stored_role != correct_role:
            db.collection("users").document(uid).update({
                "role": correct_role,
                "updatedAt": now_iso(),
            })
            logger.info(f"Corrected role for {email}: {stored_role} -> {correct_role}")
    else:
        # Clean up any stale email-keyed placeholder docs first
        for ed in db.collection("users").where("email", "==", email).stream():
            ed.reference.delete()

        db.collection("users").document(uid).set({
            "uid": uid,
            "email": email,
            "role": correct_role,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        })
        logger.info(f"Created user {email} with role {correct_role}")

    return AuthUser(uid=uid, email=email, role=correct_role)


def require_role(minimum: str):
    async def _check(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if not user.has_role(minimum):
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role: {minimum}",
            )
        return user
    return _check


async def log_action(user: AuthUser, action: str, meta: dict = None):
    try:
        db.collection("audit_logs").add({
            "userId": user.uid,
            "email": user.email,
            "role": user.role,
            "action": action,
            "meta": meta or {},
            "createdAt": now_iso(),
        })
    except Exception as e:
        logger.error(f"Failed to log action: {e}")
