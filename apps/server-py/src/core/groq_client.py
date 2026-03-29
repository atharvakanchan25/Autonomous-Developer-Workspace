from groq import AsyncGroq
from src.core.config import config

groq_client = AsyncGroq(api_key=config.GROQ_API_KEY)
