"""
AI provider infrastructure.

External model client construction lives here so application services and
agents do not own provider bootstrapping details.
"""
from groq import AsyncGroq

from src.core.config import config

groq_client = AsyncGroq(api_key=config.GROQ_API_KEY)
