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

    # Role comes from Firestore — edit the users collection in Firebase Console to change roles
    doc = db.collection("users").document(uid).get()
    if doc.exists:
        stored = doc.to_dict()
        role = stored.get("role", "user")
        if role not in ROLES:
            role = "user"
        # Sync email if it changed
        if stored.get("email") != email:
            db.collection("users").document(uid).update({"email": email, "updatedAt": now_iso()})
    else:
        # First time this user logs in — create their doc with role=user
        role = "user"
        db.collection("users").document(uid).set({
            "uid": uid, "email": email, "role": role,
            "createdAt": now_iso(), "updatedAt": now_iso(),
        })
        logger.info(f"Created user doc for {email}")

    logger.info(f"Auth check: {email} -> role: {role} (from Firestore)")
    return AuthUser(uid=uid, email=email, role=role)


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
