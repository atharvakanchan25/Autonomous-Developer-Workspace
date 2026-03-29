"""
SQLite-backed drop-in replacement for Firebase Firestore.
Mimics the Firestore API used across this project.
"""
import json
import sqlite3
import uuid
from pathlib import Path
from threading import Lock

DB_PATH = Path(__file__).parent / "adw_local.db"
_lock = Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            collection TEXT NOT NULL,
            doc_id     TEXT NOT NULL,
            data       TEXT NOT NULL,
            PRIMARY KEY (collection, doc_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_col ON documents(collection)")
    conn.commit()
    return conn


_conn = _get_conn()


def _encode(data: dict) -> str:
    return json.dumps(data, default=str)


def _decode(raw: str) -> dict:
    return json.loads(raw)


class DocumentReference:
    def __init__(self, collection: str, doc_id: str):
        self.id = doc_id
        self._col = collection

    def get(self) -> "DocumentSnapshot":
        with _lock:
            row = _conn.execute(
                "SELECT data FROM documents WHERE collection=? AND doc_id=?",
                (self._col, self.id),
            ).fetchone()
        if row:
            return DocumentSnapshot(self.id, _decode(row["data"]), True)
        return DocumentSnapshot(self.id, {}, False)

    def set(self, data: dict) -> None:
        with _lock:
            _conn.execute(
                "INSERT OR REPLACE INTO documents VALUES (?,?,?)",
                (self._col, self.id, _encode(data)),
            )
            _conn.commit()

    def update(self, data: dict) -> None:
        snap = self.get()
        merged = {**snap.to_dict(), **data} if snap.exists else data
        self.set(merged)

    def delete(self) -> None:
        with _lock:
            _conn.execute(
                "DELETE FROM documents WHERE collection=? AND doc_id=?",
                (self._col, self.id),
            )
            _conn.commit()

    @property
    def reference(self):
        return self


class DocumentSnapshot:
    def __init__(self, doc_id: str, data: dict, exists: bool):
        self.id = doc_id
        self.exists = exists
        self._data = data
        self.reference = DocumentReference("", doc_id)

    def to_dict(self) -> dict:
        return dict(self._data)


class Query:
    def __init__(self, collection: str, filters=None, order=None, limit_val=None):
        self._col = collection
        self._filters: list = filters or []
        self._order: list = order or []
        self._limit: int | None = limit_val

    def where(self, field: str, op: str, value) -> "Query":
        return Query(self._col, self._filters + [(field, op, value)], self._order, self._limit)

    def order_by(self, field: str, direction: str = "ASCENDING") -> "Query":
        return Query(self._col, self._filters, self._order + [(field, direction)], self._limit)

    def limit(self, n: int) -> "Query":
        return Query(self._col, self._filters, self._order, n)

    def stream(self) -> list[DocumentSnapshot]:
        with _lock:
            rows = _conn.execute(
                "SELECT doc_id, data FROM documents WHERE collection=?",
                (self._col,),
            ).fetchall()

        docs = []
        for row in rows:
            data = _decode(row["data"])
            snap = DocumentSnapshot(row["doc_id"], data, True)
            snap.reference = DocumentReference(self._col, row["doc_id"])
            docs.append(snap)

        for field, op, value in self._filters:
            if op == "==":
                docs = [d for d in docs if d.to_dict().get(field) == value]
            elif op == "in":
                docs = [d for d in docs if d.to_dict().get(field) in value]
            elif op == "<":
                docs = [d for d in docs if d.to_dict().get(field, "") < value]
            elif op == ">":
                docs = [d for d in docs if d.to_dict().get(field, "") > value]

        for field, direction in reversed(self._order):
            reverse = direction == "DESCENDING"
            docs.sort(key=lambda d: d.to_dict().get(field, ""), reverse=reverse)

        if self._limit is not None:
            docs = docs[: self._limit]

        return docs


class WriteBatch:
    def __init__(self):
        self._ops: list = []

    def set(self, ref: DocumentReference, data: dict) -> None:
        self._ops.append(("set", ref, data))

    def update(self, ref: DocumentReference, data: dict) -> None:
        self._ops.append(("update", ref, data))

    def delete(self, ref: DocumentReference) -> None:
        self._ops.append(("delete", ref, {}))

    def commit(self) -> None:
        with _lock:
            for op, ref, data in self._ops:
                if op == "set":
                    _conn.execute(
                        "INSERT OR REPLACE INTO documents VALUES (?,?,?)",
                        (ref._col, ref.id, _encode(data)),
                    )
                elif op == "update":
                    row = _conn.execute(
                        "SELECT data FROM documents WHERE collection=? AND doc_id=?",
                        (ref._col, ref.id),
                    ).fetchone()
                    existing = _decode(row["data"]) if row else {}
                    merged = {**existing, **data}
                    _conn.execute(
                        "INSERT OR REPLACE INTO documents VALUES (?,?,?)",
                        (ref._col, ref.id, _encode(merged)),
                    )
                elif op == "delete":
                    _conn.execute(
                        "DELETE FROM documents WHERE collection=? AND doc_id=?",
                        (ref._col, ref.id),
                    )
            _conn.commit()


class CollectionReference(Query):
    def __init__(self, collection: str):
        super().__init__(collection)

    def document(self, doc_id: str | None = None) -> DocumentReference:
        if doc_id is None:
            doc_id = str(uuid.uuid4())
        return DocumentReference(self._col, doc_id)

    def add(self, data: dict) -> tuple[None, DocumentReference]:
        doc_id = str(uuid.uuid4())
        ref = DocumentReference(self._col, doc_id)
        ref.set(data)
        return (None, ref)


class _Database:
    def collection(self, name: str) -> CollectionReference:
        return CollectionReference(name)

    def batch(self) -> WriteBatch:
        return WriteBatch()


db = _Database()
