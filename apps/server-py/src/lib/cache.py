"""
Lightweight in-memory LRU cache to avoid redundant Firestore reads.
Used primarily to cache project language/framework lookups that happen
3 times per task (once per agent).
"""
from collections import OrderedDict
from threading import Lock
from typing import Any, Optional

_DEFAULT_MAX = 256


class LRUCache:
    def __init__(self, maxsize: int = _DEFAULT_MAX):
        self._cache: OrderedDict[str, Any] = OrderedDict()
        self._maxsize = maxsize
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            self._cache.move_to_end(key)
            return self._cache[key]

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value
            if len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


# Shared cache instances
project_cache = LRUCache(maxsize=128)   # project docs keyed by project_id
task_cache = LRUCache(maxsize=512)      # task docs keyed by task_id
