"""
Memory System — structured memory for the agent platform.

Three layers:
  1. VectorMemory   — semantic code search via embeddings
                      Uses Qdrant when available; falls back to TF-IDF keyword search
  2. GraphMemory    — task dependency + file relationship graph (Firestore-backed)
  3. ProjectMemory  — unified facade combining both layers

Vector embeddings use sentence-transformers when installed, otherwise a simple
hash-based stub so the system works without GPU/heavy dependencies.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Any
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from backend.core.database import db
from backend.core.logger import logger
from backend.core.utils import now_iso


# ── Vector Memory ─────────────────────────────────────────────────────────────

@dataclass
class CodeChunk:
    chunk_id: str
    project_id: str
    file_path: str
    content: str
    language: str
    score: float = 0.0


def _simple_embed(text: str) -> list[float]:
    """
    Deterministic pseudo-embedding: 64-dim vector from character n-gram hashes.
    Not semantically meaningful but allows cosine similarity to work as a
    keyword-overlap proxy when real embeddings are unavailable.
    """
    dim = 64
    vec = [0.0] * dim
    text = text.lower()
    for i in range(len(text) - 2):
        trigram = text[i:i + 3]
        h = int(hashlib.md5(trigram.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


class VectorMemory:
    """
    In-process vector store backed by Firestore for persistence.
    Swap _embed() for sentence-transformers and _store/_search for Qdrant
    to get production-grade semantic search.
    """

    def __init__(self, project_id: str):
        self.project_id = project_id
        self._chunks: list[tuple[CodeChunk, list[float]]] = []
        self._loaded = False

    def _embed(self, text: str) -> list[float]:
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            model = SentenceTransformer("all-MiniLM-L6-v2")
            return model.encode(text).tolist()
        except ImportError:
            return _simple_embed(text)

    def _load(self) -> None:
        if self._loaded:
            return
        try:
            docs = (
                db.collection("vectorChunks")
                .where(filter=("projectId", "==", self.project_id))
                .stream()
            )
            for doc in docs:
                data = doc.to_dict()
                chunk = CodeChunk(
                    chunk_id=doc.id,
                    project_id=self.project_id,
                    file_path=data.get("filePath", ""),
                    content=data.get("content", ""),
                    language=data.get("language", ""),
                )
                embedding = data.get("embedding", [])
                if embedding:
                    self._chunks.append((chunk, embedding))
        except Exception as err:
            logger.warning(f"VectorMemory load failed: {err}")
        self._loaded = True

    def index_file(self, file_path: str, content: str, language: str) -> None:
        """Index a file's content for semantic search."""
        chunk_id = hashlib.md5(f"{self.project_id}:{file_path}".encode()).hexdigest()
        embedding = self._embed(content[:2000])  # cap to avoid slow encoding

        chunk = CodeChunk(
            chunk_id=chunk_id,
            project_id=self.project_id,
            file_path=file_path,
            content=content[:500],
            language=language,
        )
        # Update in-memory
        self._chunks = [(c, e) for c, e in self._chunks if c.chunk_id != chunk_id]
        self._chunks.append((chunk, embedding))

        # Persist
        try:
            db.collection("vectorChunks").document(chunk_id).set({
                "projectId": self.project_id,
                "filePath": file_path,
                "content": content[:500],
                "language": language,
                "embedding": embedding,
                "updatedAt": now_iso(),
            }, merge=True)
        except Exception as err:
            logger.warning(f"VectorMemory persist failed: {err}")

    def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Return top-k most similar code chunks to the query."""
        self._load()
        if not self._chunks:
            return []

        q_embed = self._embed(query)
        scored = [
            (chunk, _cosine(q_embed, embed))
            for chunk, embed in self._chunks
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        return [
            {
                "filePath": c.file_path,
                "language": c.language,
                "snippet": c.content[:300],
                "score": round(score, 4),
            }
            for c, score in scored[:top_k]
        ]


# ── Graph Memory ──────────────────────────────────────────────────────────────

class GraphMemory:
    """
    Task dependency + file relationship graph stored in Firestore.
    Nodes: tasks and files. Edges: depends_on and imports/references.
    """

    def __init__(self, project_id: str):
        self.project_id = project_id

    def add_node(self, node_id: str, node_type: str, label: str, meta: dict | None = None) -> None:
        db.collection("graphNodes").document(f"{self.project_id}:{node_id}").set({
            "projectId": self.project_id,
            "nodeId": node_id,
            "type": node_type,   # "task" | "file"
            "label": label,
            "meta": meta or {},
            "updatedAt": now_iso(),
        }, merge=True)

    def add_edge(self, from_id: str, to_id: str, edge_type: str = "depends_on") -> None:
        edge_id = hashlib.md5(f"{self.project_id}:{from_id}:{to_id}:{edge_type}".encode()).hexdigest()
        db.collection("graphEdges").document(edge_id).set({
            "projectId": self.project_id,
            "from": from_id,
            "to": to_id,
            "type": edge_type,
            "updatedAt": now_iso(),
        }, merge=True)

    def build_from_tasks(self, tasks: list[dict]) -> None:
        """Populate graph nodes and edges from a task list."""
        for task in tasks:
            self.add_node(task["id"], "task", task.get("title", task["id"]))
            for dep in task.get("dependsOn", []) or []:
                dep_id = dep["id"] if isinstance(dep, dict) else dep
                self.add_edge(dep_id, task["id"], "depends_on")

    def build_from_files(self, files: list[dict]) -> None:
        """Populate graph nodes from a file list."""
        for f in files:
            self.add_node(f.get("path", f.get("id", "")), "file", f.get("name", ""))


# ── Unified ProjectMemory facade ──────────────────────────────────────────────

class ProjectMemory:
    """
    Unified memory facade for a project.
    Agents call this to read/write all memory layers.
    """

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.vector = VectorMemory(project_id)
        self.graph = GraphMemory(project_id)

    def index_project_files(self) -> int:
        """Index all project files into vector memory. Returns count indexed."""
        count = 0
        try:
            docs = (
                db.collection("files")
                .where(filter=("projectId", "==", self.project_id))
                .stream()
            )
            for doc in docs:
                data = doc.to_dict()
                content = data.get("content", "")
                if content:
                    self.vector.index_file(
                        file_path=data.get("path", doc.id),
                        content=content,
                        language=data.get("language", "plaintext"),
                    )
                    count += 1
        except Exception as err:
            logger.warning(f"ProjectMemory index failed: {err}")
        return count

    def search_similar_code(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        return self.vector.search(query, top_k=top_k)

    def rebuild_graph(self) -> None:
        """Rebuild the task/file dependency graph from Firestore state."""
        try:
            task_docs = (
                db.collection("tasks")
                .where(filter=("projectId", "==", self.project_id))
                .stream()
            )
            tasks = [{"id": d.id, **d.to_dict()} for d in task_docs]
            self.graph.build_from_tasks(tasks)

            file_docs = (
                db.collection("files")
                .where(filter=("projectId", "==", self.project_id))
                .stream()
            )
            files = [{"id": d.id, **d.to_dict()} for d in file_docs]
            self.graph.build_from_files(files)
        except Exception as err:
            logger.warning(f"GraphMemory rebuild failed: {err}")
