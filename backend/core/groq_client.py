import httpx
from groq import AsyncGroq
from core.config import config

groq_client = AsyncGroq(
    api_key=config.GROQ_API_KEY,
    http_client=httpx.AsyncClient(
        timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0),
    ),
)
