# Architecture

## Backend

The Python backend is now organized around clearer layers:

- `apps/server-py/src/api`
  Central API router composition. This is the entry boundary for HTTP routes.
- `apps/server-py/src/application`
  Business use cases and orchestration logic. AI plan generation now lives here.
- `apps/server-py/src/infrastructure`
  External integrations such as Firestore and Groq client bootstrapping.
- `apps/server-py/src/modules`
  Route handlers and feature-facing HTTP services.
- `apps/server-py/src/agents`
  Agent runtime, runners, and pipeline orchestration.
- `apps/server-py/src/realtime`
  Socket.IO server, event payloads, and emitters.
- `apps/server-py/src/core`
  Shared primitives and backward-compatible shims for config, logging, errors, and legacy imports.

## Frontend

The Next.js app now has an explicit service layer:

- `apps/web/src/services/api`
  Shared API client and resource access methods.
- `apps/web/src/services/auth`
  Auth session and role-resolution logic.
- `apps/web/src/lib`
  Compatibility layer and reusable utilities.
- `apps/web/src/app`
  Route-level UI.
- `apps/web/src/components`
  Shared presentational and feature components.

## Database

- Firestore remains the system-of-record database.
- The canonical backend Firestore bootstrap now lives in:
  `apps/server-py/src/infrastructure/database/firestore.py`
- Existing imports from `src.core.database` still work through a compatibility shim.

## Migration Notes

- New backend code should prefer importing from `src.api`, `src.application`, and `src.infrastructure`.
- New frontend data/auth code should prefer `@/services/api` and `@/services/auth/useAuth`.
- Legacy imports remain supported to keep the refactor low-risk while the codebase transitions gradually.
