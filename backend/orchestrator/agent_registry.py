"""
AGNTCY-style Agent Registry — Internet of Agents capability layer.

Each agent declares:
  - agent_id       unique identifier
  - display_name   human-readable name
  - description    what the agent does
  - version        semver string
  - owner          uid or "system" / "marketplace"
  - skills         list of capability tags (e.g. ["python", "api", "auth"])
  - tools          list of tool names the agent can use
  - tags           free-form discovery tags
  - is_active      whether the agent accepts work

Discovery: find agents by skills/tools/tags intersection.
Persistence: registry is in-memory + mirrored to Firestore for durability.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from backend.core.database import db
from backend.core.logger import logger
from backend.core.utils import now_iso


@dataclass
class AgentCapability:
    agent_id: str
    display_name: str
    description: str
    version: str = "1.0.0"
    owner: str = "system"
    skills: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    is_active: bool = True
    registered_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return asdict(self)

    def matches(self, query: dict[str, Any]) -> bool:
        """Return True if this agent satisfies all non-empty query fields."""
        q_skills: list[str] = query.get("skills") or []
        q_tools: list[str] = query.get("tools") or []
        q_tags: list[str] = query.get("tags") or []

        if q_skills and not set(q_skills).intersection(self.skills):
            return False
        if q_tools and not set(q_tools).intersection(self.tools):
            return False
        if q_tags and not set(q_tags).intersection(self.tags):
            return False
        return True


# In-memory store: agent_id → AgentCapability
_registry: dict[str, AgentCapability] = {}


def _seed_builtin_agents() -> None:
    """Register the built-in system agents on first import."""
    builtins = [
        AgentCapability(
            agent_id="code_generator",
            display_name="Code Generator",
            description="Generates source code from task descriptions",
            skills=["python", "typescript", "javascript", "api", "backend"],
            tools=["filesystem", "llm"],
            tags=["generation", "core"],
        ),
        AgentCapability(
            agent_id="test_generator",
            display_name="Test Generator",
            description="Writes unit and integration tests for generated code",
            skills=["python", "typescript", "testing", "pytest", "jest"],
            tools=["filesystem", "llm"],
            tags=["testing", "quality"],
        ),
        AgentCapability(
            agent_id="code_reviewer",
            display_name="Code Reviewer",
            description="Reviews code for quality, security, and best practices",
            skills=["python", "typescript", "security", "review"],
            tools=["filesystem", "llm"],
            tags=["review", "quality"],
        ),
        AgentCapability(
            agent_id="scaffold",
            display_name="Scaffold Agent",
            description="Generates project structure, README, and dependency files",
            skills=["python", "typescript", "scaffold", "readme"],
            tools=["filesystem", "llm"],
            tags=["scaffold", "setup"],
        ),
        AgentCapability(
            agent_id="frontend_generator",
            display_name="Frontend Generator",
            description="Generates HTML/CSS/JS frontend interfaces",
            skills=["html", "css", "javascript", "frontend", "ui"],
            tools=["filesystem", "llm"],
            tags=["frontend", "ui"],
        ),
    ]
    for cap in builtins:
        _registry[cap.agent_id] = cap


_seed_builtin_agents()


# ── Public API ────────────────────────────────────────────────────────────────

def register(cap: AgentCapability) -> None:
    """Register or update an agent capability."""
    cap.registered_at = now_iso()
    _registry[cap.agent_id] = cap
    try:
        db.collection("agentRegistry").document(cap.agent_id).set(cap.to_dict(), merge=True)
    except Exception as err:
        logger.warning(f"Registry Firestore sync failed: {err}")
    logger.info(f"Agent registered: {cap.agent_id} v{cap.version} owner={cap.owner}")


def get(agent_id: str) -> Optional[AgentCapability]:
    return _registry.get(agent_id)


def list_all() -> list[AgentCapability]:
    return [c for c in _registry.values() if c.is_active]


def discover(query: dict[str, Any]) -> list[AgentCapability]:
    """
    Return all active agents matching the capability query.

    query keys (all optional, OR-within-field, AND-across-fields):
      skills: list[str]
      tools:  list[str]
      tags:   list[str]
    """
    return [c for c in _registry.values() if c.is_active and c.matches(query)]


def deactivate(agent_id: str) -> bool:
    cap = _registry.get(agent_id)
    if not cap:
        return False
    cap.is_active = False
    try:
        db.collection("agentRegistry").document(agent_id).update({"is_active": False})
    except Exception:
        pass
    return True


def load_from_firestore() -> int:
    """Hydrate registry from Firestore on startup (for marketplace agents)."""
    count = 0
    try:
        for doc in db.collection("agentRegistry").stream():
            data = doc.to_dict()
            agent_id = data.get("agent_id", doc.id)
            if agent_id not in _registry:  # don't overwrite built-ins
                _registry[agent_id] = AgentCapability(
                    agent_id=agent_id,
                    display_name=data.get("display_name", agent_id),
                    description=data.get("description", ""),
                    version=data.get("version", "1.0.0"),
                    owner=data.get("owner", "marketplace"),
                    skills=data.get("skills", []),
                    tools=data.get("tools", []),
                    tags=data.get("tags", []),
                    is_active=data.get("is_active", True),
                    registered_at=data.get("registered_at", now_iso()),
                )
                count += 1
    except Exception as err:
        logger.warning(f"Registry Firestore load failed: {err}")
    return count
