import asyncio

class TaskQueue:
    async def start_worker(self):
        # Minimal worker that does nothing
        while True:
            await asyncio.sleep(1)

task_queue = TaskQueue()