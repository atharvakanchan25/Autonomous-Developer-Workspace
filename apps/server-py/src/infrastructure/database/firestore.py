"""
Firestore infrastructure bootstrap.

This package is the canonical home for external database wiring so the rest
of the backend can depend on infrastructure through a single boundary.
"""
import firebase_admin
from firebase_admin import credentials, firestore

from src.core.config import config


def _ensure_firebase_app() -> None:
    if firebase_admin._apps:
        return

    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": config.FIREBASE_PROJECT_ID,
        "client_email": config.FIREBASE_CLIENT_EMAIL,
        "private_key": config.FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)


_ensure_firebase_app()
db = firestore.client()
