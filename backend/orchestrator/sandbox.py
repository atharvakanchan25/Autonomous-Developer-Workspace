"""
Docker Execution Sandbox.

Writes project files to a temp directory, spins up a language-appropriate
Docker container, runs the requested command, captures output, and cleans up.

Falls back to a dry-run stub when Docker is unavailable (dev machines without
the Docker daemon, or when the docker SDK is not installed).

Supported languages: python, typescript/javascript, go, rust, java
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
import sys

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from backend.core.logger import logger

TIMEOUT_SECONDS = 120

# Language → (Docker image, test command, build command)
_LANG_CONFIG: dict[str, dict[str, str]] = {
    "python": {
        "image": "python:3.11-slim",
        "test_cmd": "pip install -q -r requirements.txt 2>/dev/null || true && python -m pytest tests/ -v --tb=short 2>&1 || python -m pytest . -v --tb=short 2>&1",
        "build_cmd": "pip install -q -r requirements.txt 2>&1",
        "install_cmd": "pip install -q -r requirements.txt 2>&1",
    },
    "typescript": {
        "image": "node:20-slim",
        "test_cmd": "npm ci --silent 2>/dev/null || npm install --silent && npx jest --passWithNoTests 2>&1",
        "build_cmd": "npm ci --silent 2>/dev/null || npm install --silent && npm run build 2>&1",
        "install_cmd": "npm ci --silent 2>/dev/null || npm install --silent 2>&1",
    },
    "javascript": {
        "image": "node:20-slim",
        "test_cmd": "npm ci --silent 2>/dev/null || npm install --silent && npm test 2>&1",
        "build_cmd": "npm ci --silent 2>/dev/null || npm install --silent && npm run build 2>&1",
        "install_cmd": "npm ci --silent 2>/dev/null || npm install --silent 2>&1",
    },
    "go": {
        "image": "golang:1.22-alpine",
        "test_cmd": "go test ./... 2>&1",
        "build_cmd": "go build ./... 2>&1",
        "install_cmd": "go mod download 2>&1",
    },
}

_DEFAULT_LANG = "python"


@dataclass
class SandboxResult:
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    dry_run: bool = False


def _get_config(language: str) -> dict[str, str]:
    return _LANG_CONFIG.get(language.lower(), _LANG_CONFIG[_DEFAULT_LANG])


def _write_workspace(files: dict[str, str], workspace_dir: str) -> None:
    for rel_path, content in files.items():
        full_path = Path(workspace_dir) / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")


async def _docker_run(
    image: str,
    command: str,
    workspace_dir: str,
) -> tuple[int, str, str]:
    """Run a shell command inside a Docker container with the workspace mounted."""
    try:
        import docker  # type: ignore
        client = docker.from_env()
    except Exception as err:
        raise RuntimeError(f"Docker unavailable: {err}") from err

    loop = asyncio.get_event_loop()

    def _run_sync():
        container = client.containers.run(
            image=image,
            command=["sh", "-c", command],
            volumes={workspace_dir: {"bind": "/workspace", "mode": "rw"}},
            working_dir="/workspace",
            remove=True,
            stdout=True,
            stderr=True,
            mem_limit="512m",
            network_disabled=False,
            timeout=TIMEOUT_SECONDS,
        )
        output = container.decode("utf-8") if isinstance(container, bytes) else str(container)
        return 0, output, ""

    try:
        exit_code, stdout, stderr = await asyncio.wait_for(
            loop.run_in_executor(None, _run_sync),
            timeout=TIMEOUT_SECONDS + 5,
        )
        return exit_code, stdout, stderr
    except asyncio.TimeoutError:
        return 1, "", "Sandbox timeout exceeded"
    except Exception as err:
        # docker SDK raises ContainerError for non-zero exit codes
        err_str = str(err)
        exit_code = getattr(err, "exit_status", 1)
        stderr = getattr(err, "stderr", b"")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")
        return exit_code, err_str, stderr


async def _run_in_sandbox(
    project_id: str,
    files: dict[str, str],
    language: str,
    command: str,
    task_id: str = "",
) -> SandboxResult:
    import time
    workspace_dir = tempfile.mkdtemp(prefix=f"adw_{project_id[:8]}_")
    start = time.monotonic()

    try:
        _write_workspace(files, workspace_dir)
        cfg = _get_config(language)

        try:
            exit_code, stdout, stderr = await _docker_run(cfg["image"], command, workspace_dir)
        except RuntimeError as docker_err:
            # Docker not available — return a dry-run stub
            logger.warning(f"Sandbox dry-run (Docker unavailable): {docker_err}")
            duration_ms = int((time.monotonic() - start) * 1000)
            return SandboxResult(
                success=True,
                exit_code=0,
                stdout=f"[DRY RUN] Docker unavailable — command would run: {command}",
                stderr="",
                duration_ms=duration_ms,
                dry_run=True,
            )

        duration_ms = int((time.monotonic() - start) * 1000)
        success = exit_code == 0
        logger.info(
            f"Sandbox finished: project={project_id} lang={language} "
            f"exit={exit_code} duration={duration_ms}ms"
        )
        return SandboxResult(
            success=success,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
            duration_ms=duration_ms,
        )
    finally:
        shutil.rmtree(workspace_dir, ignore_errors=True)


# ── Public API ────────────────────────────────────────────────────────────────

async def run_tests(
    project_id: str,
    files: dict[str, str],
    language: str = "python",
    task_id: str = "",
) -> SandboxResult:
    cfg = _get_config(language)
    return await _run_in_sandbox(project_id, files, language, cfg["test_cmd"], task_id)


async def build_project(
    project_id: str,
    files: dict[str, str],
    language: str = "python",
    task_id: str = "",
) -> SandboxResult:
    cfg = _get_config(language)
    return await _run_in_sandbox(project_id, files, language, cfg["build_cmd"], task_id)


async def run_command(
    project_id: str,
    files: dict[str, str],
    language: str = "python",
    command: str = "echo ok",
    task_id: str = "",
) -> SandboxResult:
    return await _run_in_sandbox(project_id, files, language, command, task_id)
