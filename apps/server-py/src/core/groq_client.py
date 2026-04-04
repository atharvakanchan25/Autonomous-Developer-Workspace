"""
Backward-compatible AI client shim.

New code should import `groq_client` from `src.infrastructure.ai`.
"""
from src.infrastructure.ai import groq_client

__all__ = ["groq_client"]
