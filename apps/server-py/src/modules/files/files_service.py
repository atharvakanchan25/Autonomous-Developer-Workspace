from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

from src.lib.firestore import db
from src.lib.errors import not_found, bad_request
from src.lib.utils import now_iso

router = APIRouter()
MAX_VERSIONS = 50

_LANG_MAP: dict[str, str] = {
    "ts": "typescript", "tsx": "typescript",
    "js": "javascript", "jsx": "javascript",
    "json": "json", "md": "markdown",
    "css": "css", "html": "html",
    "py": "python", "rs": "rust",
    "go": "go", "sh": "shell",
    "yaml": "yaml", "yml": "yaml",
    "toml": "toml", "sql": "sql",
}


def _detect_language(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _LANG_MAP.get(ext, "plaintext")


class CreateFileRequest(BaseModel):
    projectId: str
    path: str
    name: str
    content: str = ""
    language: str = "plaintext"


class UpdateFileRequest(BaseModel):
    content: str
    createVersion: bool = False
    versionLabel: Optional[str] = None


class RenameFileRequest(BaseModel):
    path: str
    name: str


@router.get("/")
def list_files(projectId: str = Query(...)):
    if not db.collection("projects").document(projectId).get().exists:
        raise not_found("Project")
    snap = (
        db.collection("projectFiles")
        .where("projectId", "==", projectId)
        .order_by("path")
        .stream()
    )
    return [{"id": d.id, **{k: v for k, v in d.to_dict().items() if k != "content"}} for d in snap]


@router.get("/versions/{version_id}")
def get_version(version_id: str):
    doc = db.collection("fileVersions").document(version_id).get()
    if not doc.exists:
        raise not_found("FileVersion")
    return {"id": doc.id, **doc.to_dict()}


@router.get("/{file_id}")
def get_file(file_id: str):
    doc = db.collection("projectFiles").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    return {"id": doc.id, **doc.to_dict()}


@router.post("/", status_code=201)
def create_file(body: CreateFileRequest):
    if not db.collection("projects").document(body.projectId).get().exists:
        raise not_found("Project")
    existing = list(
        db.collection("projectFiles")
        .where("projectId", "==", body.projectId)
        .where("path", "==", body.path)
        .limit(1)
        .stream()
    )
    if existing:
        raise bad_request(f'A file already exists at "{body.path}"')
    language = _detect_language(body.name) if body.language == "plaintext" else body.language
    now = now_iso()
    ref = db.collection("projectFiles").add({
        "projectId": body.projectId, "path": body.path, "name": body.name,
        "language": language, "content": body.content,
        "size": len(body.content.encode("utf-8")), "createdAt": now, "updatedAt": now,
    })[1]
    return {
        "id": ref.id, **body.model_dump(), "language": language,
        "size": len(body.content.encode("utf-8")), "createdAt": now, "updatedAt": now,
    }


@router.put("/{file_id}")
def update_file(file_id: str, body: UpdateFileRequest):
    doc = db.collection("projectFiles").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    file = doc.to_dict()

    if body.createVersion and file.get("content"):
        versions = list(db.collection("fileVersions").where("fileId", "==", file_id).stream())
        if len(versions) >= MAX_VERSIONS:
            sorted_v = sorted(versions, key=lambda d: d.to_dict().get("createdAt", ""))
            for v in sorted_v[: len(versions) - MAX_VERSIONS + 1]:
                v.reference.delete()
        db.collection("fileVersions").add({
            "fileId": file_id, "content": file["content"],
            "size": file.get("size", 0), "label": body.versionLabel, "createdAt": now_iso(),
        })

    now = now_iso()
    size = len(body.content.encode("utf-8"))
    db.collection("projectFiles").document(file_id).update(
        {"content": body.content, "size": size, "updatedAt": now}
    )
    return {"id": file_id, **file, "content": body.content, "size": size, "updatedAt": now}


@router.patch("/{file_id}/rename")
def rename_file(file_id: str, body: RenameFileRequest):
    doc = db.collection("projectFiles").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    file = doc.to_dict()
    conflict = list(
        db.collection("projectFiles")
        .where("projectId", "==", file["projectId"])
        .where("path", "==", body.path)
        .limit(1)
        .stream()
    )
    if conflict and conflict[0].id != file_id:
        raise bad_request(f'A file already exists at "{body.path}"')
    language = _detect_language(body.name)
    now = now_iso()
    db.collection("projectFiles").document(file_id).update(
        {"path": body.path, "name": body.name, "language": language, "updatedAt": now}
    )
    return {"id": file_id, **file, "path": body.path, "name": body.name, "language": language, "updatedAt": now}


@router.delete("/{file_id}", status_code=204)
def delete_file(file_id: str):
    doc = db.collection("projectFiles").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    db.collection("projectFiles").document(file_id).delete()


@router.get("/{file_id}/versions")
def list_versions(file_id: str):
    if not db.collection("projectFiles").document(file_id).get().exists:
        raise not_found("File")
    snap = (
        db.collection("fileVersions")
        .where("fileId", "==", file_id)
        .order_by("createdAt", direction="DESCENDING")
        .stream()
    )
    return [{"id": d.id, **{k: v for k, v in d.to_dict().items() if k != "content"}} for d in snap]


@router.post("/{file_id}/versions/{version_id}/restore")
def restore_version(file_id: str, version_id: str):
    file_doc = db.collection("projectFiles").document(file_id).get()
    if not file_doc.exists:
        raise not_found("File")
    version_doc = db.collection("fileVersions").document(version_id).get()
    if not version_doc.exists or version_doc.to_dict().get("fileId") != file_id:
        raise not_found("FileVersion")
    version = version_doc.to_dict()
    return update_file(
        file_id,
        UpdateFileRequest(
            content=version["content"],
            createVersion=True,
            versionLabel=f"Before restore to {version['createdAt']}",
        ),
    )
