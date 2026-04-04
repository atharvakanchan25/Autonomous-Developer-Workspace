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

from src.core.config import config
from src.core.logger import logger
from src.core.database import db
from src.api import api_router
from src.realtime.server import sio
from src.lib.mcp_server import mcp
from src.agents.agent_service import bootstrap_agents
from src.queue.queue import task_queue

import src.queue.worker  # noqa: F401 — registers the job handler as a side effect


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
    allow_origins=[config.CORS_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api")


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


# ── Mount MCP ─────────────────────────────────────────────────────────────────
app.mount("/mcp", mcp.streamable_http_app())

# ── Mount Socket.IO ───────────────────────────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
