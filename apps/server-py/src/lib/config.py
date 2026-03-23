from pydantic_settings import BaseSettings
from typing import Literal


class Config(BaseSettings):
    APP_ENV: Literal["development", "production", "test"] = "development"
    PORT: int = 4000
    GROQ_API_KEY: str
    CORS_ORIGIN: str = "http://localhost:3000"
    LOG_LEVEL: Literal["debug", "info", "warning", "error"] = "info"
    RATE_LIMIT_WINDOW_MS: int = 60_000
    RATE_LIMIT_MAX: int = 200

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


config = Config()