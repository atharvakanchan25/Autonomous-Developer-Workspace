import asyncio
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable


@dataclass
class JobData:
    taskId: str
    projectId: str
    title: str


@dataclass
class Job:
    id: str
    data: JobData
    state: str = "waiting"  # waiting | active | completed | failed
    progress: int = 0
    failed_reason: Optional[str] = None
    attempts_made: int = 0


class InMemoryQueue:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._queue: asyncio.Queue = asyncio.Queue()
        self._handlers: list[Callable[[Job], Awaitable[None]]] = []

    def on_job(self, handler: Callable[[Job], Awaitable[None]]) -> None:
        self._handlers.append(handler)

    async def add(self, job_id: str, data: JobData) -> Job:
        existing = self._jobs.get(job_id)
        if existing and existing.state != "failed":
            return existing
        job = Job(id=job_id, data=data)
        self._jobs[job_id] = job
        await self._queue.put(job)
        return job

    def update_job(self, job_id: str, **kwargs) -> None:
        job = self._jobs.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def get_counts(self) -> dict[str, int]:
        counts = {"waiting": 0, "active": 0, "completed": 0, "failed": 0}
        for job in self._jobs.values():
            if job.state in counts:
                counts[job.state] += 1
        return counts

    async def start_worker(self) -> None:
        while True:
            job = await self._queue.get()
            for handler in self._handlers:
                asyncio.create_task(handler(job))


task_queue = InMemoryQueue()
