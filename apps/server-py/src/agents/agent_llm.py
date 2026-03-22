from dataclasses import dataclass
from src.lib.groq import groq_client

DEFAULT_MODEL = "llama-3.3-70b-versatile"


@dataclass
class LlmMessage:
    role: str  # "user" | "assistant" | "system"
    content: str


@dataclass
class LlmResult:
    content: str
    tokensUsed: int


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

    response = await groq_client.chat.completions.create(**kwargs)

    content = response.choices[0].message.content or ""
    tokens_used = response.usage.total_tokens if response.usage else 0
    return LlmResult(content=content, tokensUsed=tokens_used)
