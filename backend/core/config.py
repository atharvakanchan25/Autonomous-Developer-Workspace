from pydantic_settings import BaseSettings
from pydantic import ConfigDict, validator
from typing import Literal
from pathlib import Path
import os

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent


class Config(BaseSettings):
    APP_ENV: Literal["development", "production", "test"] = "development"
    PORT: int = 4000
    GROQ_API_KEY: str
    FIREBASE_PROJECT_ID: str
    FIREBASE_CLIENT_EMAIL: str
    FIREBASE_PRIVATE_KEY: str
    ADMIN_EMAILS: str = ""
    CORS_ORIGIN: str = "http://localhost:3000"
    LOG_LEVEL: Literal["debug", "info", "warning", "error"] = "info"
    RATE_LIMIT_WINDOW_MS: int = 60_000
    RATE_LIMIT_MAX: int = 200
    VERCEL_TOKEN: str = ""
    GITHUB_TOKEN: str = ""

    @validator("CORS_ORIGIN", pre=True)
    def strip_cors_origin(cls, v: str) -> str:
        return v.strip()

    model_config = ConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def __init__(self, **kwargs):
        # Filter out NEXT_PUBLIC_ environment variables
        filtered_env = {k: v for k, v in os.environ.items() if not k.startswith('NEXT_PUBLIC_')}
        
        # Temporarily replace os.environ
        original_environ = os.environ.copy()
        os.environ.clear()
        os.environ.update(filtered_env)
        
        try:
            super().__init__(**kwargs)
        finally:
            # Restore original environment
            os.environ.clear()
            os.environ.update(original_environ)


config = Config()
