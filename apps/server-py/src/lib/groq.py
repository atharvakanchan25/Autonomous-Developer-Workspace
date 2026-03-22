from groq import AsyncGroq
from src.lib.config import config

groq_client = AsyncGroq(api_key=config.GROQ_API_KEY)
