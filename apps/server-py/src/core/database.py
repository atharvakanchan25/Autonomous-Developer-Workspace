"""
Backward-compatible database shim.

New code should import `db` from `src.infrastructure.database`.
"""
from src.infrastructure.database import db

__all__ = ["db"]
