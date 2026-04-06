"""
Firebase Firestore database implementation.
Provides direct access to Firestore client without wrapper classes.
"""
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK if not already initialized
if not firebase_admin._apps:
    try:
        from core.config import config
    except ModuleNotFoundError:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
        from core.config import config
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": config.FIREBASE_PROJECT_ID,
        "private_key": config.FIREBASE_PRIVATE_KEY.replace('\\n', '\n'),
        "client_email": config.FIREBASE_CLIENT_EMAIL,
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)

# Direct Firestore client - no wrapper classes needed
db = firestore.client()
