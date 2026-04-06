import asyncio
from backend.core.logger import logger


class TaskQueue:
    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()

    def enqueue(self, task_id: str) -> None:
        self._queue.put_nowait(task_id)
        logger.info(f"[Queue] Enqueued task={task_id} (qsize={self._queue.qsize()})")

    async def start_worker(self) -> None:
        from backend.task_queue.worker import run_pipeline
        logger.info("[Queue] Worker started, waiting for tasks...")
        while True:
            task_id = await self._queue.get()
            logger.info(f"[Queue] Picked up task={task_id}")
            try:
                await run_pipeline(task_id)
            except Exception as e:
                logger.error(f"[Queue] Pipeline error for task={task_id}: {e}", exc_info=True)
            finally:
                self._queue.task_done()


task_queue = TaskQueue()
