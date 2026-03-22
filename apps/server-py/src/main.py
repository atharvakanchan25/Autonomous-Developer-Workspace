import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import socketio

from src.lib.config import config
from src.lib.logger import logger
from src.lib.firestore import db
from src.lib.socket import sio
from src.agents.agent_service import bootstrap_agents, router as agents_router
from src.modules.projects.projects_service import router as projects_router
from src.modules.tasks.tasks_service import router as tasks_router
from src.modules.ai.ai_service import router as ai_router
from src.modules.files.files_service import router as files_router
from src.modules.cicd.cicd_service import router as cicd_router
from src.modules.observability.observability_service import router as observe_router
from src.queue.queue import task_queue

import src.queue.worker  # noqa: F401 — registers the job handler as a side effect


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_agents()
    worker_task = asyncio.create_task(task_queue.start_worker())
    logger.info(f"Server starting — env={config.APP_ENV} port={config.PORT}")
    yield
    worker_task.cancel()
    logger.info("Server shut down cleanly")


# slowapi expects "<count> per <period>" e.g. "200 per minute"
_window_seconds = config.RATE_LIMIT_WINDOW_MS // 1000
_rate_limit_str = f"{config.RATE_LIMIT_MAX} per {_window_seconds} second"

limiter = Limiter(key_func=get_remote_address, default_limits=[_rate_limit_str])

app = FastAPI(title="Autonomous Developer Workspace", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.CORS_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(projects_router, prefix="/api/projects")
app.include_router(tasks_router,    prefix="/api/tasks")
app.include_router(ai_router,       prefix="/api/ai")
app.include_router(agents_router,   prefix="/api/agents")
app.include_router(files_router,    prefix="/api/files")
app.include_router(cicd_router,     prefix="/api/cicd")
app.include_router(observe_router,  prefix="/api/observe")


@app.get("/health")
async def health():
    db_ok = False
    try:
        list(db.collection("_health").limit(1).stream())
        db_ok = True
    except Exception:
        pass
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


# ── Mount Socket.IO ───────────────────────────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
