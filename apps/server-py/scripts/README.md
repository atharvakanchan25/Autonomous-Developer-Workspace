# scripts/

One-time operational scripts. Run from the `apps/server-py/` directory with the venv active.

| Script | Purpose |
|--------|---------|
| `rbac_migration.py` | Backfills `ownerId`/`assignedTo` on existing tasks and normalises roles to `user`/`admin`. Run once after deploying RBAC. |

```bash
# Windows
.venv\Scripts\python.exe scripts/rbac_migration.py

# macOS / Linux
.venv/bin/python scripts/rbac_migration.py
```
