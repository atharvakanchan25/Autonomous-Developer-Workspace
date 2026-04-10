"""
Git Integration — commit generated files to GitHub and open a PR.

Uses the GitHub REST API directly via httpx (no PyGithub dependency required).
Falls back to a stub result when GITHUB_TOKEN is not configured.

Flow:
  1. Ensure branch exists (create from main/master if needed)
  2. Upsert each file via the Contents API
  3. Open a pull request from the feature branch → default branch
  4. Persist commit record to Firestore
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

import httpx

from backend.core.config import config
from backend.core.database import db
from backend.core.logger import logger
from backend.core.utils import now_iso

GITHUB_API = "https://api.github.com"
_GITHUB_TOKEN: str = getattr(config, "GITHUB_TOKEN", "")


@dataclass
class CommitResult:
    success: bool
    branch: str
    commit_sha: str
    pr_url: str
    message: str
    stub: bool = False


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _get_default_branch(client: httpx.AsyncClient, repo: str) -> str:
    r = await client.get(f"{GITHUB_API}/repos/{repo}", headers=_headers())
    r.raise_for_status()
    return r.json().get("default_branch", "main")


async def _get_branch_sha(client: httpx.AsyncClient, repo: str, branch: str) -> str | None:
    r = await client.get(
        f"{GITHUB_API}/repos/{repo}/git/ref/heads/{branch}", headers=_headers()
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()["object"]["sha"]


async def _create_branch(
    client: httpx.AsyncClient, repo: str, branch: str, from_sha: str
) -> None:
    r = await client.post(
        f"{GITHUB_API}/repos/{repo}/git/refs",
        headers=_headers(),
        json={"ref": f"refs/heads/{branch}", "sha": from_sha},
    )
    if r.status_code not in (201, 422):  # 422 = branch already exists
        r.raise_for_status()


async def _upsert_file(
    client: httpx.AsyncClient,
    repo: str,
    branch: str,
    path: str,
    content: str,
    message: str,
) -> str:
    """Create or update a file; returns the commit SHA."""
    encoded = base64.b64encode(content.encode()).decode()
    url = f"{GITHUB_API}/repos/{repo}/contents/{path}"

    # Check if file exists to get its SHA (required for updates)
    existing = await client.get(url, headers=_headers(), params={"ref": branch})
    body: dict = {"message": message, "content": encoded, "branch": branch}
    if existing.status_code == 200:
        body["sha"] = existing.json()["sha"]

    r = await client.put(url, headers=_headers(), json=body)
    r.raise_for_status()
    return r.json()["commit"]["sha"]


async def _open_pr(
    client: httpx.AsyncClient,
    repo: str,
    branch: str,
    base: str,
    title: str,
    body: str,
) -> str:
    """Open a PR; returns the PR URL (or empty string if already exists)."""
    r = await client.post(
        f"{GITHUB_API}/repos/{repo}/pulls",
        headers=_headers(),
        json={"title": title, "head": branch, "base": base, "body": body},
    )
    if r.status_code == 422:  # PR already exists
        return ""
    r.raise_for_status()
    return r.json().get("html_url", "")


# ── Public API ────────────────────────────────────────────────────────────────

async def commit_project_files(
    project_id: str,
    task_id: str,
    repo_full_name: str,
    files: dict[str, str],
    task_title: str = "",
) -> CommitResult:
    """
    Commit files to a feature branch and open a PR.

    Args:
        project_id:      ADW project ID (for Firestore logging)
        task_id:         ADW task ID
        repo_full_name:  "owner/repo"
        files:           {relative_path: content}
        task_title:      used in branch name and PR title
    """
    if not _GITHUB_TOKEN:
        logger.warning("GITHUB_TOKEN not set — returning stub commit result")
        return CommitResult(
            success=True,
            branch="",
            commit_sha="",
            pr_url="",
            message="Git integration not configured (GITHUB_TOKEN missing)",
            stub=True,
        )

    safe_title = task_title.lower().replace(" ", "-")[:40] if task_title else task_id[:12]
    branch = f"adw/{project_id[:8]}/{safe_title}"
    commit_msg = f"feat: {task_title or task_id} [ADW auto-commit]"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            default_branch = await _get_default_branch(client, repo_full_name)
            base_sha = await _get_branch_sha(client, repo_full_name, default_branch)
            if not base_sha:
                raise ValueError(f"Cannot resolve SHA for {default_branch}")

            await _create_branch(client, repo_full_name, branch, base_sha)

            last_sha = base_sha
            for path, content in files.items():
                last_sha = await _upsert_file(
                    client, repo_full_name, branch, path, content, commit_msg
                )

            pr_url = await _open_pr(
                client, repo_full_name, branch, default_branch,
                title=f"[ADW] {task_title or task_id}",
                body=f"Auto-generated by Autonomous Developer Workspace\n\nTask: `{task_id}`",
            )

        db.collection("gitCommits").add({
            "projectId": project_id,
            "taskId": task_id,
            "repo": repo_full_name,
            "branch": branch,
            "commitSha": last_sha,
            "prUrl": pr_url,
            "fileCount": len(files),
            "createdAt": now_iso(),
        })

        logger.info(f"Git commit: repo={repo_full_name} branch={branch} sha={last_sha[:7]}")
        return CommitResult(
            success=True,
            branch=branch,
            commit_sha=last_sha,
            pr_url=pr_url,
            message=f"Committed {len(files)} file(s) to {branch}",
        )

    except Exception as err:
        logger.error(f"Git commit failed: {err}", exc_info=True)
        return CommitResult(
            success=False,
            branch=branch,
            commit_sha="",
            pr_url="",
            message=str(err),
        )
