import socketio
from src.lib.config import config
from src.lib.logger import logger

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=config.CORS_ORIGIN,
    transports=["websocket", "polling"],
)


@sio.event
async def connect(sid, environ):
    logger.info(f"Socket connected: {sid}")


@sio.event
async def disconnect(sid):
    logger.info(f"Socket disconnected: {sid}")


@sio.event
async def room_join(sid, project_id: str):
    await sio.enter_room(sid, f"project:{project_id}")
    logger.info(f"Socket {sid} joined room project:{project_id}")


@sio.event
async def room_leave(sid, project_id: str):
    await sio.leave_room(sid, f"project:{project_id}")
    logger.info(f"Socket {sid} left room project:{project_id}")
