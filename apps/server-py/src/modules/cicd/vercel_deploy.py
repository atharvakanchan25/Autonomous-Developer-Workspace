import asyncio
import httpx
from src.core.config import config

VERCEL_API = "https://api.vercel.com/v13/deployments"


async def deploy_to_vercel(files: dict[str, str], project_name: str) -> dict:
    token = config.VERCEL_TOKEN
    if not token:
        raise ValueError("VERCEL_TOKEN must be set in .env")

    files_payload = [{"file": filename, "data": content} for filename, content in files.items()]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            VERCEL_API,
            headers=headers,
            json={"name": project_name, "files": files_payload, "target": "production", "projectSettings": {"framework": None}},
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Vercel deployment failed: {resp.status_code} {resp.text}")

        data = resp.json()
        deployment_id = data["id"]

        for _ in range(15):
            await asyncio.sleep(2)
            poll = await client.get(f"{VERCEL_API}/{deployment_id}", headers=headers)
            if poll.status_code == 200:
                state = poll.json().get("readyState", "")
                if state == "READY":
                    return {"url": "https://" + poll.json()["url"], "deploy_id": deployment_id, "status": "ready"}
                if state == "ERROR":
                    raise RuntimeError("Vercel deployment errored")

        raise RuntimeError("Vercel deployment timed out after 30 seconds")
