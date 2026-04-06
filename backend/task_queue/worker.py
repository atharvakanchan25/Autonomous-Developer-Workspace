import sys
from pathlib import Path

# Ensure both backend/ and ai-services/ are on sys.path before any agent imports
_root = Path(__file__).parent.parent.parent  # repo root
_backend = _root / "backend"
_ai = _root / "ai-services"

for _p in (_root, _backend, _ai):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)


async def run_pipeline(task_id: str) -> None:
    from agents.agent_dispatcher import dispatch_pipeline
    await dispatch_pipeline(task_id)
