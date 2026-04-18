import asyncio
import sys
from pathlib import Path

# Add ai-services to Python path
_repo_root = Path(__file__).parent.parent
for _p in (_repo_root, _repo_root / "ai-services"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import socketio

from backend.core.config import config
from backend.core.logger import logger
from backend.core.database import db
from backend.realtime.server import sio
from backend.task_queue.queue import task_queue
from agents.agent_service import bootstrap_agents, router as agents_router
from backend.api.projects.projects_service import router as projects_router
from backend.api.tasks.tasks_service import router as tasks_router
from backend.api.ai.ai_service import router as ai_router
from backend.api.files.files_service import router as files_router
from backend.api.cicd.cicd_service import router as cicd_router
from backend.api.observability.observability_service import router as observe_router
from backend.api.admin.admin_service import router as admin_router
from backend.lib.mcp_server import mcp

import backend.task_queue.worker  # noqa: F401  — ensures sys.path is patched before agent imports
from backend.api.orchestrator.orchestrator_service import router as orchestrator_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        bootstrap_agents()
        worker_task = asyncio.create_task(task_queue.start_worker())
        logger.info(f"[OK] Server started - env={config.APP_ENV} port={config.PORT}")
        yield
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise
    finally:
        try:
            worker_task.cancel()
            await worker_task
        except asyncio.CancelledError:
            pass
        logger.info("[OK] Server shut down")


_window_seconds = config.RATE_LIMIT_WINDOW_MS // 1000
_rate_limit_str = f"{config.RATE_LIMIT_MAX} per {_window_seconds} second"

limiter = Limiter(key_func=get_remote_address, default_limits=[_rate_limit_str])

app = FastAPI(title="Autonomous Developer Workspace", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(filter(None, [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        config.CORS_ORIGIN,
        config.FRONTEND_URL,
    ])),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(tasks_router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(ai_router, prefix="/api/ai", tags=["AI"])
app.include_router(agents_router, prefix="/api/agents", tags=["Agents"])
app.include_router(files_router, prefix="/api/files", tags=["Files"])
app.include_router(cicd_router, prefix="/api/cicd", tags=["CI/CD"])
app.include_router(observe_router, prefix="/api/observe", tags=["Observability"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(orchestrator_router, prefix="/api/orchestrator", tags=["Orchestrator"])


@app.get("/health")
async def health():
    db_ok = False
    try:
        list(db.collection("_health").limit(1).stream())
        db_ok = True
    except Exception as e:
        logger.warning(f"Health check DB error: {e}")
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": "ok" if db_ok else "degraded",
            "services": {"db": "connected" if db_ok else "disconnected"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=404, content={"error": "Route not found"})


# Mount MCP
app.mount("/mcp", mcp.streamable_http_app())

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
