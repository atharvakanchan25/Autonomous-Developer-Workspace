# Autonomous Developer Workspace — Python Server

Full Python rewrite of the Node.js/Express backend using **FastAPI + python-socketio**.

## Stack

| TS Original | Python Equivalent |
|---|---|
| Express | FastAPI |
| Socket.IO (Node) | python-socketio (AsyncServer) |
| Zod | Pydantic v2 |
| firebase-admin (Node) | firebase-admin (Python) |
| `@google/generative-ai` | `google-generativeai` |
| Winston | Python `logging` |
| In-memory queue | `asyncio.Queue` |

## Structure

```
server-py/
├── src/
│   ├── agents/
│   │   ├── runners/
│   │   │   ├── code_generator.py
│   │   │   ├── test_generator.py
│   │   │   └── code_reviewer.py
│   │   ├── agent_dispatcher.py
│   │   ├── agent_llm.py
│   │   ├── agent_registry.py
│   │   ├── agent_service.py   ← FastAPI router + bootstrap
│   │   └── agent_types.py
│   ├── lib/
│   │   ├── config.py          ← Pydantic settings
│   │   ├── emitter.py         ← Socket.IO emit helpers
│   │   ├── errors.py          ← HTTPException helpers
│   │   ├── firestore.py       ← Firebase Admin init
│   │   ├── gemini.py          ← Gemini client init
│   │   ├── logger.py          ← Python logging
│   │   ├── socket.py          ← socketio.AsyncServer
│   │   └── socket_events.py   ← Pydantic payload models
│   ├── modules/
│   │   ├── ai/ai_service.py
│   │   ├── cicd/cicd_service.py
│   │   ├── files/files_service.py
│   │   ├── observability/observability_service.py
│   │   ├── projects/projects_service.py
│   │   └── tasks/tasks_service.py
│   ├── queue/
│   │   ├── queue.py           ← asyncio.Queue wrapper
│   │   └── worker.py          ← job processor
│   └── main.py                ← FastAPI app + Socket.IO mount
├── run.py                     ← uvicorn entry point
├── requirements.txt
├── .env.example
└── start.bat                  ← Windows setup + run script
```

## Setup

```bash
# 1. Create venv and install deps
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# 2. Configure environment
copy .env.example .env
# Fill in GEMINI_API_KEY, FIREBASE_* credentials

# 3. Run
python run.py
```

Or just double-click `start.bat` on Windows.

The server runs on **http://localhost:4000** — same port as the Node.js version, so the Next.js frontend works without any changes.

## API

Identical to the Node.js server — see the root README for the full API reference.
