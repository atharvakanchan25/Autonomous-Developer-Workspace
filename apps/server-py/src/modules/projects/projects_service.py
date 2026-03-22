from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from src.lib.firestore import db
from src.lib.errors import not_found
from src.lib.utils import now_iso

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None


@router.get("/")
def list_projects():
    snap = db.collection("projects").order_by("createdAt", direction="DESCENDING").stream()
    return [{"id": d.id, **d.to_dict()} for d in snap]


@router.post("/", status_code=201)
def create_project(body: CreateProjectRequest):
    now = now_iso()
    ref = db.collection("projects").add({**body.model_dump(), "createdAt": now, "updatedAt": now})[1]
    return {"id": ref.id, **body.model_dump(), "createdAt": now, "updatedAt": now}


@router.get("/{project_id}")
def get_project(project_id: str):
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    tasks = [
        {"id": d.id, **d.to_dict()}
        for d in db.collection("tasks").where("projectId", "==", project_id).stream()
    ]
    return {"id": doc.id, **doc.to_dict(), "tasks": tasks}
