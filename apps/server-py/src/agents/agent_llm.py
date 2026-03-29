import asyncio
import re
from dataclasses import dataclass
from groq import RateLimitError
from src.core.groq_client import groq_client
from src.core.logger import logger

DEFAULT_MODEL = "llama-3.3-70b-versatile"
_MAX_RETRIES = 6
_BASE_WAIT = 15.0


@dataclass
class LlmMessage:
    role: str   # "user" | "assistant" | "system"
    content: str


@dataclass
class LlmResult:
    content: str
    tokensUsed: int


def _parse_retry_after(err: RateLimitError) -> float:
    match = re.search(r"try again in ([\d.]+)s", str(err), re.IGNORECASE)
    return float(match.group(1)) + 1.0 if match else _BASE_WAIT


async def call_llm(
    messages: list[LlmMessage],
    model: str = DEFAULT_MODEL,
    max_tokens: int = 4096,
    json_mode: bool = False,
) -> LlmResult:
    groq_messages = [{"role": m.role, "content": m.content} for m in messages]

    kwargs: dict = {
        "model": model,
        "messages": groq_messages,
        "max_tokens": max_tokens,
        "temperature": 0,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = await groq_client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens if response.usage else 0
            return LlmResult(content=content, tokensUsed=tokens_used)
        except RateLimitError as err:
            if attempt == _MAX_RETRIES:
                raise
            wait = _parse_retry_after(err)
            logger.warning(f"Groq rate limit — waiting {wait:.1f}s (attempt {attempt}/{_MAX_RETRIES - 1})")
            await asyncio.sleep(wait)
