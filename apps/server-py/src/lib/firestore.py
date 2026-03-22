import firebase_admin
from firebase_admin import credentials, firestore
from src.lib.config import config

if not firebase_admin._apps:
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": config.FIREBASE_PROJECT_ID,
        "client_email": config.FIREBASE_CLIENT_EMAIL,
        "private_key": config.FIREBASE_PRIVATE_KEY,
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)

db: firestore.Client = firestore.client()
